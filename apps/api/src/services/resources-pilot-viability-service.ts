import type { PoolClient } from 'pg';

import {
  assertResourcesPilotViabilityReplyRequest,
  assertResourcesPilotViabilityStartRequest,
  schemaIds,
} from '../contracts/schema-registry';
import type {
  AlphaGap,
  ChatTurn,
  GeneratedSection,
  ResourcesPilotViabilityState,
  ResourcesPilotViabilityTurn,
} from '../contracts/types';
import type { AppConfig } from '../config/env';
import {
  buildResourcesPilotViabilityFallbackQuestion,
  buildResourcesPilotViabilitySectionSourceRefs,
  classifyResourcesPilotViabilityGapStatuses,
  computeResourcesPilotViabilityMissingInformation,
  emptyResourcesPilotViabilityState,
  enforceResourcesPilotViabilityTurnGuardrails,
  renderResourcesPilotViabilitySection,
  RESOURCES_PILOT_VIABILITY_WARNING,
  selectResourcesPilotViabilityGapRefs,
} from '../domain/resources-pilot-viability';
import type { AlphaStore } from '../repositories/alpha-store';
import type { AgentRunRecord, SessionRecord, SessionStore } from '../repositories/session-store';
import { AppError, ModelOutputError } from '../utils/errors';
import type { Logger } from '../utils/logger';
import type { LlmOrchestrator } from './llm-orchestrator';
import { loadPrompt } from './prompt-service';
import type {
  ResourcesPilotViabilityReplyContextCommand,
  ResourcesPilotViabilityRunResponse,
  ResourcesPilotViabilityStartContextCommand,
  RunResourcesPilotViabilityCommand,
} from './service-types';
import { revertModuleReplyFailureForUserRetry } from './module-reply-failure-recovery';

export class ResourcesPilotViabilityService {
  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
    private readonly sessionStore: SessionStore,
    private readonly alphaStore: AlphaStore,
    private readonly llmOrchestrator: LlmOrchestrator,
  ) {}

  async start(command: ResourcesPilotViabilityStartContextCommand): Promise<ResourcesPilotViabilityRunResponse> {
    const payload = assertResourcesPilotViabilityStartRequest(command.payload);

    return this.execute({
      context: {
        ...command.context,
        requestId: command.context.requestId ?? payload.request_id,
      },
      sessionId: payload.session_id,
      trigger: 'start',
    });
  }

  async reply(command: ResourcesPilotViabilityReplyContextCommand): Promise<ResourcesPilotViabilityRunResponse> {
    const payload = assertResourcesPilotViabilityReplyRequest(command.payload);

    if (payload.answer.trim().length > this.config.maxReplyChars) {
      throw new AppError(
        400,
        'resources_pilot_viability_reply_too_large',
        'The resources pilot viability reply exceeds the maximum supported length',
        false,
        payload.session_id,
      );
    }

    if (payload.answer.trim().length === 0) {
      throw new AppError(
        400,
        'empty_resources_pilot_viability_answer',
        'The resources pilot viability reply cannot be empty',
        false,
        payload.session_id,
      );
    }

    const requestId = command.context.requestId ?? payload.request_id;

    if (requestId) {
      const existingTurn = await this.alphaStore.findChatTurnByAnswerRequestId(requestId);

      if (existingTurn) {
        return this.execute({
          context: {
            ...command.context,
            requestId,
          },
          sessionId: existingTurn.proposal_id,
          trigger: 'reply',
        });
      }
    }

    await this.sessionStore.getDatabase().withTransaction(async (client) => {
      const session = await this.sessionStore.getSessionForUpdate(payload.session_id, client);
      await this.sessionStore.tryUnblockSessionForUserRetry(client, session.id);

      let chat = await this.alphaStore.findModuleChatByProposalAndModule(
        session.id,
        'resources_pilot_viability',
        client,
      );
      if (!chat || !chat.active_turn_id) {
        const restored = await this.alphaStore.tryRestoreModuleChatForUserRetry(client, {
          proposalId: session.id,
          module: 'resources_pilot_viability',
        });
        if (restored) {
          chat = restored.chat;
        }
      }

      if (!chat || !chat.active_turn_id) {
        throw new AppError(
          409,
          'no_open_resources_pilot_viability_turn',
          'The resources pilot viability chat is not waiting for a user answer',
          false,
          payload.session_id,
        );
      }

      const activeTurn = chat.turns.find((turn) => turn.turn_id === chat.active_turn_id);

      if (!activeTurn || activeTurn.turn_status !== 'awaiting_user') {
        throw new AppError(
          409,
          'resources_pilot_viability_turn_not_waiting',
          'The active resources pilot viability turn is not waiting for a user answer',
          false,
          payload.session_id,
        );
      }

      const updatedTurn = await this.alphaStore.updateChatTurnAnswer(client, {
        turnId: activeTurn.turn_id,
        answerText: payload.answer.trim(),
        answerRequestId: requestId,
      });

      await this.alphaStore.appendAuditEvent(client, {
        proposalId: session.id,
        sessionId: session.id,
        turnId: updatedTurn.turn_id,
        eventType: 'resources_pilot_viability_answer_received',
        actorType: 'user',
        requestId,
        payloadJson: {
          turn_seq: updatedTurn.turn_seq,
        },
      });
    });

    return this.execute({
      context: {
        ...command.context,
        requestId: requestId ?? command.context.requestId,
      },
      sessionId: payload.session_id,
      trigger: 'reply',
    });
  }

  async execute(command: RunResourcesPilotViabilityCommand): Promise<ResourcesPilotViabilityRunResponse> {
    const requestId = command.context.requestId;
    const existingResponse = await this.findExistingResponse(command.sessionId, requestId);

    if (existingResponse) {
      return existingResponse;
    }

    const session = await this.sessionStore.getSession(command.sessionId);
    const problemSection = await this.requireGeneratedSection(session.id, 'problem');
    const solutionSection = await this.requireGeneratedSection(session.id, 'solution');
    const dataAiPrivacySection = await this.findOptionalGeneratedSection(session.id, 'data_ai_privacy');
    const medicalDeviceTriageSection = await this.findOptionalGeneratedSection(session.id, 'medical_device_triage');
    const chat = await this.ensureResourcesPilotViabilityChat(session);
    const activeTurn = this.getActiveTurn(chat.turns, chat.active_turn_id);

    this.assertStartDoesNotReopenCompletedChat(command, chat.chat_status);

    if (command.trigger === 'start' && activeTurn) {
      throw new AppError(
        409,
        'resources_pilot_viability_start_already_initialized',
        'The resources pilot viability chat already has an open clarification turn',
        false,
        command.sessionId,
      );
    }

    if (command.trigger === 'reply' && (!activeTurn || activeTurn.turn_status !== 'processing')) {
      throw new AppError(
        409,
        'resources_pilot_viability_reply_not_ready_for_agent',
        'The resources pilot viability chat does not have a processing turn ready for the agent',
        false,
        command.sessionId,
      );
    }

    if (command.trigger === 'start') {
      await this.recordStartRequested(session.id, requestId);
    }

    const recentTurns = chat.turns
      .filter((turn) => turn.turn_status === 'resolved')
      .slice(-5)
      .map((turn) => ({
        question_text: turn.question_text,
        answer_text: turn.answer_text ?? null,
        diagnosis: turn.diagnosis,
      }));

    try {
      const modelTurn = await this.llmOrchestrator.runResourcesPilotViability({
        structuredBrief: session.latest_structured_brief_json,
        problemSection,
        solutionSection,
        dataAiPrivacySection,
        medicalDeviceTriageSection,
        recentTurns,
        latestAnswer: activeTurn?.answer_text,
      });
      const guarded = enforceResourcesPilotViabilityTurnGuardrails(modelTurn.output, activeTurn?.answer_text);

      if (
        guarded.turn.agent_status !== 'done' &&
        command.trigger === 'reply' &&
        chat.turns.length >= this.config.maxTurnsPerSession
      ) {
        guarded.turn.agent_status = 'blocked';
        guarded.turn.next_question = '';
        guarded.turn.completion_reason = 'maximum resources pilot viability turns reached';
        guarded.warnings.push('Maximum resources pilot viability turn count reached; chat blocked');
      }

      return this.sessionStore.getDatabase().withTransaction(async (client) => {
        const lockedSession = await this.sessionStore.getSessionForUpdate(command.sessionId, client);
        const recoveredResponse = await this.findExistingResponse(command.sessionId, requestId);

        if (recoveredResponse) {
          return recoveredResponse;
        }

        const lockedProblemSection = await this.requireGeneratedSection(lockedSession.id, 'problem', client);
        const lockedSolutionSection = await this.requireGeneratedSection(lockedSession.id, 'solution', client);
        const lockedDataAiPrivacySection = await this.findOptionalGeneratedSection(
          lockedSession.id,
          'data_ai_privacy',
          client,
        );
        const lockedMedicalDeviceTriageSection = await this.findOptionalGeneratedSection(
          lockedSession.id,
          'medical_device_triage',
          client,
        );
        const lockedChat = await this.ensureResourcesPilotViabilityChat(lockedSession, client);
        const lockedActiveTurn = this.getActiveTurn(lockedChat.turns, lockedChat.active_turn_id);

        this.assertStartDoesNotReopenCompletedChat(command, lockedChat.chat_status);

        if (command.trigger === 'start' && lockedActiveTurn) {
          throw new AppError(
            409,
            'resources_pilot_viability_start_already_initialized',
            'The resources pilot viability chat already has an open clarification turn',
            false,
            command.sessionId,
          );
        }

        if (command.trigger === 'reply' && (!lockedActiveTurn || lockedActiveTurn.turn_status !== 'processing')) {
          throw new AppError(
            409,
            'resources_pilot_viability_reply_not_ready_for_agent',
            'The resources pilot viability chat does not have a processing turn ready for the agent',
            false,
            command.sessionId,
          );
        }

        const turnSeq = command.trigger === 'reply'
          ? lockedActiveTurn?.turn_seq
          : this.nextTurnSeq(lockedChat.turns);
        const run = await this.sessionStore.recordAgentRun(client, {
          sessionId: lockedSession.id,
          turnSeq,
          requestId,
          runPurpose: 'resources_pilot_viability',
          agentName: 'resources_pilot_viability_agent',
          workflowName: 'agent_resources_pilot_viability_v1',
          workflowVersion: command.context.workflowVersion,
          workflowExecutionId: command.context.workflowExecutionId,
          promptName: modelTurn.prompt.name,
          promptVersion: modelTurn.prompt.version,
          promptSha256: modelTurn.prompt.hash,
          modelProvider: modelTurn.providerName,
          modelName: modelTurn.modelName,
          modelParamsJson: modelTurn.modelParams,
          inputContractName: 'resources-pilot-viability-agent.input',
          inputContractVersion: 'v1',
          outputContractName: 'resources-pilot-viability-turn',
          outputContractVersion: 'v1',
          inputPayloadJson: {
            structured_brief: lockedSession.latest_structured_brief_json,
            problem_section: this.toSectionTrace(lockedProblemSection),
            solution_section: this.toSectionTrace(lockedSolutionSection),
            data_ai_privacy_section: lockedDataAiPrivacySection
              ? this.toSectionTrace(lockedDataAiPrivacySection)
              : null,
            medical_device_triage_section: lockedMedicalDeviceTriageSection
              ? this.toSectionTrace(lockedMedicalDeviceTriageSection)
              : null,
            recent_turns: recentTurns,
            latest_user_answer: lockedActiveTurn?.answer_text ?? null,
          },
          rawModelOutput: modelTurn.rawOutput,
          validatedOutputJson: guarded.turn as unknown as Record<string, unknown>,
          status: 'completed',
          repairAttempted: modelTurn.repairAttempted,
          metricsJson: {
            ...modelTurn.metrics,
            guardrail_intervention: guarded.intervention,
          },
        });

        if (guarded.intervention.applied) {
          await this.alphaStore.appendAuditEvent(client, {
            proposalId: lockedSession.id,
            sessionId: lockedSession.id,
            runId: run.id,
            turnId: lockedActiveTurn?.turn_id,
            eventType: 'resources_pilot_viability_guardrail_fallback_applied',
            actorType: 'system',
            requestId,
            payloadJson: {
              reasons: guarded.intervention.reasons,
              normalized_fields: guarded.intervention.normalizedFields,
              fallback_question_applied: guarded.intervention.fallbackQuestionApplied,
              forced_agent_status: guarded.intervention.forcedAgentStatus ?? null,
              scope: guarded.intervention.scope,
            },
          });
        }

        return this.persistSuccessfulTurn({
          client,
          session: lockedSession,
          chatId: lockedChat.chat_id,
          activeTurn: command.trigger === 'reply' ? lockedActiveTurn ?? null : null,
          existingTurns: lockedChat.turns,
          guardedTurn: guarded.turn,
          updatedResourcesPilotViability: guarded.updatedResourcesPilotViability,
          latestAnswerWasVague: guarded.latestAnswerWasVague,
          warnings: guarded.warnings,
          runId: run.id,
          requestId,
          problemSection: lockedProblemSection,
          solutionSection: lockedSolutionSection,
          dataAiPrivacySection: lockedDataAiPrivacySection,
          medicalDeviceTriageSection: lockedMedicalDeviceTriageSection,
        });
      });
    } catch (error) {
      const recoveredAfterConflict = await this.recoverExistingResponseAfterConflict(
        command.sessionId,
        requestId,
        error,
      );

      if (recoveredAfterConflict) {
        return recoveredAfterConflict;
      }

      if (error instanceof ModelOutputError || error instanceof AppError) {
        await this.persistFailure(command, session, activeTurn, error);
      }

      throw error;
    }
  }

  private assertStartDoesNotReopenCompletedChat(
    command: RunResourcesPilotViabilityCommand,
    chatStatus: string,
  ): void {
    if (
      command.trigger === 'start' &&
      (chatStatus === 'completed' || chatStatus === 'ready_to_generate')
    ) {
      throw new AppError(
        409,
        'resources_pilot_viability_start_already_completed',
        'The resources pilot viability chat has already completed',
        false,
        command.sessionId,
      );
    }
  }

  private async ensureResourcesPilotViabilityChat(session: SessionRecord, client?: PoolClient) {
    const existing = await this.alphaStore.findModuleChatByProposalAndModule(
      session.id,
      'resources_pilot_viability',
      client,
    );

    if (existing) {
      return existing;
    }

    return this.alphaStore.createModuleChat(client ?? this.alphaStore.getDatabase(), {
      proposalId: session.id,
      module: 'resources_pilot_viability',
      chatStatus: 'active',
      warnings: [RESOURCES_PILOT_VIABILITY_WARNING],
    });
  }

  private async recordStartRequested(sessionId: string, requestId?: string): Promise<void> {
    if (!requestId) {
      return;
    }

    await this.alphaStore.appendAuditEvent(this.alphaStore.getDatabase(), {
      proposalId: sessionId,
      sessionId,
      eventType: 'resources_pilot_viability_start_requested',
      actorType: 'workflow',
      requestId,
      payloadJson: {
        module: 'resources_pilot_viability',
      },
    });
  }

  private async requireGeneratedSection(
    sessionId: string,
    sectionKind: 'problem' | 'solution',
    client?: PoolClient,
  ): Promise<GeneratedSection> {
    const section = await this.alphaStore.findCurrentGeneratedSection(sessionId, sectionKind, client);

    if (!section) {
      throw new AppError(
        409,
        `${sectionKind}_section_required_for_resources_pilot_viability`,
        'A generated problem and solution section are required before starting resources pilot viability inputs',
        false,
        sessionId,
      );
    }

    return section;
  }

  private async findOptionalGeneratedSection(
    sessionId: string,
    sectionKind: 'data_ai_privacy' | 'medical_device_triage',
    client?: PoolClient,
  ): Promise<GeneratedSection | null> {
    return this.alphaStore.findCurrentGeneratedSection(sessionId, sectionKind, client);
  }

  private getActiveTurn(turns: ChatTurn[], activeTurnId?: string): ChatTurn | null {
    return turns.find((turn) => turn.turn_id === activeTurnId) ??
      turns.find((turn) => turn.turn_status === 'awaiting_user' || turn.turn_status === 'processing') ??
      null;
  }

  private nextTurnSeq(turns: ChatTurn[]): number {
    return Math.max(0, ...turns.map((turn) => turn.turn_seq)) + 1;
  }

  private toSectionTrace(section: GeneratedSection) {
    return {
      section_id: section.section_id,
      title: section.title,
      source_refs: section.source_refs.map((source) => source.source_id),
    };
  }

  private async persistSuccessfulTurn(params: {
    client: PoolClient;
    session: SessionRecord;
    chatId: string;
    activeTurn: ChatTurn | null;
    existingTurns: ChatTurn[];
    guardedTurn: ResourcesPilotViabilityTurn;
    updatedResourcesPilotViability: ResourcesPilotViabilityState;
    latestAnswerWasVague: boolean;
    warnings: string[];
    runId: string;
    requestId: string;
    problemSection: GeneratedSection;
    solutionSection: GeneratedSection;
    dataAiPrivacySection: GeneratedSection | null;
    medicalDeviceTriageSection: GeneratedSection | null;
  }): Promise<ResourcesPilotViabilityRunResponse> {
    await this.ensureResourcesPilotViabilityGaps(
      params.client,
      params.session.id,
      params.updatedResourcesPilotViability,
      params.requestId,
    );
    const existingGaps = await this.alphaStore.listGaps(params.session.id, params.client);

    if (params.activeTurn) {
      await this.resolveAnsweredTurn({
        ...params,
        gaps: existingGaps,
      });
    }

    const updatedGaps = await this.alphaStore.listGaps(params.session.id, params.client);

    if (params.guardedTurn.agent_status === 'continue') {
      const openedTurn = await this.openResourcesPilotViabilityQuestion({
        ...params,
        turnSeq: this.nextTurnSeq(params.existingTurns),
        gaps: updatedGaps,
      });

      await this.alphaStore.updateModuleChatStatus(params.client, {
        chatId: params.chatId,
        chatStatus: 'waiting_for_user',
        activeTurnId: openedTurn.turn_id,
      });
    } else if (params.guardedTurn.agent_status === 'done') {
      await this.alphaStore.updateModuleChatStatus(params.client, {
        chatId: params.chatId,
        chatStatus: 'ready_to_generate',
        activeTurnId: null,
      });
      await this.generateResourcesPilotViabilitySection(params);
      await this.alphaStore.updateModuleChatStatus(params.client, {
        chatId: params.chatId,
        chatStatus: 'completed',
        activeTurnId: null,
      });
    } else {
      await this.alphaStore.updateModuleChatStatus(params.client, {
        chatId: params.chatId,
        chatStatus: 'blocked',
        activeTurnId: null,
      });
    }

    return {
      session_id: params.session.id,
      stage: 'resources_pilot_viability',
      agent_status: params.guardedTurn.agent_status,
      updated_resources_pilot_viability: params.updatedResourcesPilotViability,
      diagnosis: params.guardedTurn.diagnosis,
      next_question: params.guardedTurn.next_question,
      completion_reason: params.guardedTurn.completion_reason,
      warnings: params.warnings,
      run_id: params.runId,
    };
  }

  private async ensureResourcesPilotViabilityGaps(
    client: PoolClient,
    proposalId: string,
    state: ResourcesPilotViabilityState,
    requestId: string,
  ): Promise<void> {
    const existingGaps = await this.alphaStore.listGaps(proposalId, client);
    const existingFields = new Set(
      existingGaps.filter((gap) => gap.module === 'resources_pilot_viability').map((gap) => gap.field),
    );

    for (const field of computeResourcesPilotViabilityMissingInformation(state)) {
      if (existingFields.has(field)) {
        continue;
      }

      const gap = await this.alphaStore.createGap(client, {
        proposalId,
        module: 'resources_pilot_viability',
        gapKind: field === 'assumptions' || field === 'uncertainties'
          ? 'needs_user_confirmation'
          : 'missing_information',
        gapStatus: 'open',
        origin: 'system_rule',
        field,
        description: `Resources pilot viability information gap for ${field.replace(/_/g, ' ')}.`,
        absence: {
          is_absent: field !== 'assumptions' && field !== 'uncertainties',
          checked_fields: [field],
          reason: 'Resources pilot viability field is not sufficiently clear yet.',
        },
        questionHint: buildResourcesPilotViabilityFallbackQuestion(state),
        sourceRefs: [],
        auditRefs: [],
        warnings: [RESOURCES_PILOT_VIABILITY_WARNING],
      });

      await this.alphaStore.appendAuditEvent(client, {
        proposalId,
        sessionId: proposalId,
        eventType: 'resources_pilot_viability_gap_detected',
        actorType: 'system',
        requestId,
        payloadJson: {
          gap_id: gap.gap_id,
          module: 'resources_pilot_viability',
          origin: gap.origin,
          field: gap.field,
          gap_kind: gap.gap_kind,
        },
      });
    }
  }

  private async resolveAnsweredTurn(params: {
    client: PoolClient;
    session: SessionRecord;
    activeTurn: ChatTurn | null;
    guardedTurn: ResourcesPilotViabilityTurn;
    updatedResourcesPilotViability: ResourcesPilotViabilityState;
    latestAnswerWasVague: boolean;
    warnings: string[];
    runId: string;
    requestId: string;
    gaps: AlphaGap[];
  }): Promise<void> {
    if (!params.activeTurn?.answer_text) {
      throw new AppError(
        409,
        'resources_pilot_viability_answer_missing',
        'The active resources pilot viability turn has no user answer to resolve',
        false,
        params.session.id,
      );
    }

    const answerSource = await this.alphaStore.createSource(params.client, {
      proposalId: params.session.id,
      sourceKind: 'user_answer',
      label: `Resources pilot viability answer turn ${params.activeTurn.turn_seq}`,
      turnId: params.activeTurn.turn_id,
      metadata: {
        request_id: params.requestId,
      },
    });
    const gapStatusChanges = !params.latestAnswerWasVague
      ? classifyResourcesPilotViabilityGapStatuses(
          params.gaps,
          params.updatedResourcesPilotViability,
          params.activeTurn.turn_id,
        )
      : [];
    const resolvedGapRefs: string[] = [];

    for (const change of gapStatusChanges) {
      await this.alphaStore.updateGapStatus(params.client, {
        gapId: change.gapId,
        gapStatus: change.gapStatus,
        resolvedByTurnId: change.resolvedByTurnId,
      });

      if (change.gapStatus === 'resolved') {
        resolvedGapRefs.push(change.gapId);
      }
    }

    const resolvedGapRefSet = new Set([...params.activeTurn.gap_refs, ...resolvedGapRefs]);
    const resolvedTurn = await this.alphaStore.resolveChatTurn(params.client, {
      turnId: params.activeTurn.turn_id,
      agentStatus: params.guardedTurn.agent_status,
      diagnosis: params.guardedTurn.diagnosis,
      sourceRefs: [answerSource],
      gapRefs: Array.from(resolvedGapRefSet),
      auditRefs: [{ kind: 'agent_run', id: params.runId }],
      warnings: params.warnings,
    });

    await this.alphaStore.appendAuditEvent(params.client, {
      proposalId: params.session.id,
      sessionId: params.session.id,
      runId: params.runId,
      turnId: resolvedTurn.turn_id,
      eventType: 'resources_pilot_viability_answer_resolved',
      actorType: 'system',
      requestId: params.requestId,
      payloadJson: {
        source_id: answerSource.source_id,
        gap_refs: Array.from(resolvedGapRefSet),
      },
    });
  }

  private async openResourcesPilotViabilityQuestion(params: {
    client: PoolClient;
    session: SessionRecord;
    chatId: string;
    guardedTurn: ResourcesPilotViabilityTurn;
    updatedResourcesPilotViability: ResourcesPilotViabilityState;
    warnings: string[];
    runId: string;
    requestId: string;
    turnSeq: number;
    gaps: AlphaGap[];
  }): Promise<ChatTurn> {
    const gapRefs = selectResourcesPilotViabilityGapRefs(params.gaps, params.updatedResourcesPilotViability);
    const alphaTurn = await this.alphaStore.createChatTurn(params.client, {
      chatId: params.chatId,
      proposalId: params.session.id,
      module: 'resources_pilot_viability',
      turnSeq: params.turnSeq,
      questionText: params.guardedTurn.next_question,
      turnStatus: 'awaiting_user',
      agentStatus: 'continue',
      diagnosis: params.guardedTurn.diagnosis,
      sourceRefs: [],
      gapRefs,
      auditRefs: [{ kind: 'agent_run', id: params.runId }],
      warnings: params.warnings,
    });

    const inProgressRefs = new Set(gapRefs);

    for (const gap of params.gaps) {
      if (inProgressRefs.has(gap.gap_id) && gap.gap_status === 'open') {
        await this.alphaStore.updateGapStatus(params.client, {
          gapId: gap.gap_id,
          gapStatus: 'in_progress',
        });
      }
    }

    await this.alphaStore.appendAuditEvent(params.client, {
      proposalId: params.session.id,
      sessionId: params.session.id,
      runId: params.runId,
      turnId: alphaTurn.turn_id,
      eventType: 'resources_pilot_viability_turn_opened',
      actorType: 'agent',
      requestId: params.requestId,
      payloadJson: {
        turn_seq: params.turnSeq,
        question_text: params.guardedTurn.next_question,
        gap_refs: gapRefs,
      },
    });

    return alphaTurn;
  }

  private async generateResourcesPilotViabilitySection(params: {
    client: PoolClient;
    session: SessionRecord;
    updatedResourcesPilotViability: ResourcesPilotViabilityState;
    warnings: string[];
    runId: string;
    requestId: string;
    problemSection: GeneratedSection;
    solutionSection: GeneratedSection;
    dataAiPrivacySection: GeneratedSection | null;
    medicalDeviceTriageSection: GeneratedSection | null;
  }): Promise<void> {
    const sources = await this.alphaStore.listSources(params.session.id, params.client);
    const supportingSectionIds = new Set([
      params.problemSection.section_id,
      params.solutionSection.section_id,
      params.dataAiPrivacySection?.section_id,
      params.medicalDeviceTriageSection?.section_id,
    ].filter(Boolean));
    const generatedSectionSources = sources.filter((source) =>
      source.source_kind === 'generated_section' &&
      source.section_id !== undefined &&
      supportingSectionIds.has(source.section_id),
    );
    const sourceRefs = buildResourcesPilotViabilitySectionSourceRefs(
      [
        ...sources.filter((source) =>
          source.source_kind === 'pasted_text' ||
          source.source_kind === 'uploaded_file' ||
          source.source_kind === 'extracted_text',
        ),
        ...generatedSectionSources,
      ],
      sources.filter((source) => source.source_kind === 'user_answer'),
      params.problemSection,
      params.solutionSection,
      params.dataAiPrivacySection,
      params.medicalDeviceTriageSection,
    );
    const gaps = await this.alphaStore.listGaps(params.session.id, params.client);
    const gapRefs = gaps
      .filter((gap) => gap.module === 'resources_pilot_viability' && gap.gap_status === 'resolved')
      .map((gap) => gap.gap_id);
    const renderedSection = renderResourcesPilotViabilitySection(params.updatedResourcesPilotViability, {
      sourceCount: sourceRefs.length,
      gapCount: gapRefs.length,
    });
    const currentSection = await this.alphaStore.findCurrentGeneratedSection(
      params.session.id,
      'resources_pilot_viability',
      params.client,
    );

    if (currentSection) {
      await this.alphaStore.supersedeGeneratedSection(params.client, {
        sectionId: currentSection.section_id,
      });
    }

    const section = await this.alphaStore.createGeneratedSection(params.client, {
      proposalId: params.session.id,
      sectionKind: 'resources_pilot_viability',
      sectionStatus: 'generated',
      title: renderedSection.title,
      contentMarkdown: renderedSection.contentMarkdown,
      sourceRefs,
      gapRefs,
      generatedByRunId: params.runId,
      supersedesSectionId: currentSection?.section_id,
      warnings: Array.from(new Set([...params.warnings, ...renderedSection.warnings])),
    });

    const generatedSource = await this.alphaStore.createSource(params.client, {
      proposalId: params.session.id,
      sourceKind: 'generated_section',
      label: `Resources pilot viability section v${section.section_version}`,
      sectionId: section.section_id,
      metadata: {
        request_id: params.requestId,
        generated_by_run_id: params.runId,
      },
    });

    await this.alphaStore.appendAuditEvent(params.client, {
      proposalId: params.session.id,
      sessionId: params.session.id,
      runId: params.runId,
      eventType: 'resources_pilot_viability_section_generated',
      actorType: 'system',
      requestId: params.requestId,
      payloadJson: {
        section_id: section.section_id,
        section_version: section.section_version,
        generated_source_id: generatedSource.source_id,
        source_refs: sourceRefs.map((source) => source.source_id),
        gap_refs: gapRefs,
      },
    });
  }

  private async findExistingResponse(
    sessionId: string,
    requestId?: string,
  ): Promise<ResourcesPilotViabilityRunResponse | null> {
    if (!requestId) {
      return null;
    }

    const existingRun = await this.sessionStore.findAgentRunByRequestId(requestId, 'resources_pilot_viability');

    if (!existingRun) {
      return null;
    }

    if (!existingRun.validated_output_json) {
      if (existingRun.status !== 'completed') {
        throw this.toStoredAgentRunError(existingRun, sessionId);
      }

      return null;
    }

    return this.buildResponseFromRun(sessionId, existingRun);
  }

  private async recoverExistingResponseAfterConflict(
    sessionId: string,
    requestId: string | undefined,
    error: unknown,
  ): Promise<ResourcesPilotViabilityRunResponse | null> {
    if (!requestId || !isUniqueViolation(error)) {
      return null;
    }

    return this.findExistingResponse(sessionId, requestId);
  }

  private toStoredAgentRunError(run: AgentRunRecord, sessionId: string): AppError {
    const statusCode = run.status === 'model_failed' ? 504 : 502;

    return new AppError(
      statusCode,
      run.error_code ?? 'resources_pilot_viability_request_failed',
      run.error_message ?? 'The resources pilot viability request failed while executing the workflow',
      run.status === 'model_failed',
      sessionId,
    );
  }

  private async buildResponseFromRun(
    sessionId: string,
    run: AgentRunRecord,
  ): Promise<ResourcesPilotViabilityRunResponse> {
    const output = run.validated_output_json as unknown as ResourcesPilotViabilityTurn;
    const warnings = await this.findPersistedWarningsForRun(sessionId, run.id);

    return {
      session_id: sessionId,
      stage: 'resources_pilot_viability',
      agent_status: output.agent_status,
      updated_resources_pilot_viability: output.updated_resources_pilot_viability,
      diagnosis: output.diagnosis,
      next_question: output.agent_status === 'continue' ? output.next_question : '',
      completion_reason: output.completion_reason,
      warnings,
      run_id: run.id,
    };
  }

  private async findPersistedWarningsForRun(sessionId: string, runId: string): Promise<string[]> {
    const chat = await this.alphaStore.findModuleChatByProposalAndModule(sessionId, 'resources_pilot_viability');

    if (!chat) {
      return [];
    }

    const warnings = new Set<string>();

    for (const turn of chat.turns) {
      const isRunTurn = turn.audit_refs.some((ref) => ref.kind === 'agent_run' && ref.id === runId);

      if (isRunTurn) {
        for (const warning of turn.warnings) {
          warnings.add(warning);
        }
      }
    }

    return Array.from(warnings);
  }

  private async persistFailure(
    command: RunResourcesPilotViabilityCommand,
    session: SessionRecord,
    activeTurn: ChatTurn | null,
    error: AppError,
  ): Promise<void> {
    try {
      const prompt = await loadPrompt('resources-pilot-viability-agent');

      await this.sessionStore.getDatabase().withTransaction(async (client) => {
        const lockedSession = await this.sessionStore.getSessionForUpdate(session.id, client);
        const run = await this.sessionStore.recordAgentRun(client, {
          sessionId: lockedSession.id,
          turnSeq: activeTurn?.turn_seq ?? 1,
          requestId: command.context.requestId,
          runPurpose: 'resources_pilot_viability',
          agentName: 'resources_pilot_viability_agent',
          workflowName: 'agent_resources_pilot_viability_v1',
          workflowVersion: command.context.workflowVersion,
          workflowExecutionId: command.context.workflowExecutionId,
          promptName: prompt.name,
          promptVersion: prompt.version,
          promptSha256: prompt.hash,
          modelProvider: this.config.aiProvider,
          modelName: this.config.aiModel,
          modelParamsJson: {
            temperature: 0.2,
            num_ctx: this.config.ollamaNumCtx,
            keep_alive: this.config.ollamaKeepAlive,
          },
          inputContractName: 'resources-pilot-viability-agent.input',
          inputContractVersion: 'v1',
          outputContractName: 'resources-pilot-viability-turn',
          outputContractVersion: 'v1',
          inputPayloadJson: {
            session_id: lockedSession.id,
            trigger: command.trigger,
          },
          rawModelOutput: error instanceof ModelOutputError ? error.rawOutput : undefined,
          status:
            error instanceof ModelOutputError
              ? error.repairAttempted
                ? 'repair_failed'
                : 'validation_failed'
              : error.retryable
                ? 'model_failed'
                : 'controlled_error',
          errorCode: error.errorCode,
          errorMessage: error.safeMessage,
          repairAttempted: error instanceof ModelOutputError ? error.repairAttempted : false,
        });

        if (activeTurn) {
          const reopenedForRetry = await revertModuleReplyFailureForUserRetry(
            client,
            this.alphaStore,
            {
              proposalId: lockedSession.id,
              module: 'resources_pilot_viability',
              activeTurn,
              trigger: command.trigger,
              error,
              runId: run.id,
              requestId: command.context.requestId,
              retryAuditEventType: 'resources_pilot_viability_answer_retry_opened',
              failureAuditEventType: 'resources_pilot_viability_answer_failed',
            },
          );

          if (!reopenedForRetry) {
            await this.alphaStore.resolveChatTurn(client, {
              turnId: activeTurn.turn_id,
              turnStatus: 'failed',
              agentStatus: 'blocked',
              diagnosis: activeTurn.diagnosis,
              sourceRefs: activeTurn.source_refs,
              gapRefs: activeTurn.gap_refs,
              auditRefs: [{ kind: 'agent_run', id: run.id }],
              warnings: [error.safeMessage],
            });

            const chat = await this.alphaStore.findModuleChatByProposalAndModule(
              lockedSession.id,
              'resources_pilot_viability',
              client,
            );
            if (chat) {
              await this.alphaStore.updateModuleChatStatus(client, {
                chatId: chat.chat_id,
                chatStatus: 'failed',
                activeTurnId: null,
              });
            }

            await this.alphaStore.appendAuditEvent(client, {
              proposalId: lockedSession.id,
              sessionId: lockedSession.id,
              runId: run.id,
              turnId: activeTurn.turn_id,
              eventType: 'resources_pilot_viability_answer_failed',
              actorType: 'system',
              requestId: command.context.requestId,
              payloadJson: {
                error_code: error.errorCode,
                reason: error.safeMessage,
              },
            });
          }
        } else {
          await this.alphaStore.appendAuditEvent(client, {
            proposalId: lockedSession.id,
            sessionId: lockedSession.id,
            runId: run.id,
            eventType: 'resources_pilot_viability_agent_failed',
            actorType: 'system',
            requestId: command.context.requestId,
            payloadJson: {
              error_code: error.errorCode,
              reason: error.safeMessage,
            },
          });
        }
      });
    } catch (persistError) {
      if (!isUniqueViolationForConstraint(persistError, 'uq_agent_runs_request_purpose')) {
        throw persistError;
      }
    }

    this.logger.error('resources_pilot_viability_failed', {
      request_id: command.context.requestId,
      session_id: command.sessionId,
      error_code: error.errorCode,
      schema: schemaIds.resourcesPilotViabilityTurn,
    });
  }
}

function isUniqueViolationForConstraint(error: unknown, constraintName: string): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === '23505' &&
      'constraint' in error &&
      (error as { constraint?: unknown }).constraint === constraintName,
  );
}

function isUniqueViolation(error: unknown): error is { code: string } {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === '23505',
  );
}
