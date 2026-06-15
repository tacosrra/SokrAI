import type { PoolClient } from 'pg';

import { schemaIds } from '../contracts/schema-registry';
import type {
  AlphaGap,
  ChatTurn,
  DataAiPrivacyState,
  DataAiPrivacyTurn,
  GeneratedSection,
} from '../contracts/types';
import type { AppConfig } from '../config/env';
import { collectRecentQuestionTexts } from '../domain/conversation-question';
import {
  buildDataAiPrivacyFallbackQuestion,
  buildDataAiPrivacySectionSourceRefs,
  classifyDataAiPrivacyGapStatuses,
  computeDataAiPrivacyMissingInformation,
  DATA_AI_PRIVACY_REVIEW_WARNING,
  emptyDataAiPrivacyState,
  enforceDataAiPrivacyTurnGuardrails,
  renderDataAiPrivacySection,
  selectDataAiPrivacyGapRefs,
} from '../domain/data-ai-privacy';
import { getRegulatoryProfile } from '../domain/regulatory-profile';
import type { AlphaStore } from '../repositories/alpha-store';
import type { AgentRunRecord, SessionRecord, SessionStore } from '../repositories/session-store';
import { AppError, ModelOutputError } from '../utils/errors';
import type { Logger } from '../utils/logger';
import type { LlmOrchestrator } from './llm-orchestrator';
import { loadPrompt } from './prompt-service';
import type {
  DataAiPrivacyReplyContextCommand,
  DataAiPrivacyRunResponse,
  DataAiPrivacyStartContextCommand,
  RunDataAiPrivacyCommand,
} from './service-types';
import { revertModuleReplyFailureForUserRetry } from './module-reply-failure-recovery';
import {
  assertDataAiPrivacyReplyRequest,
  assertDataAiPrivacyStartRequest,
} from '../contracts/schema-registry';

export class DataAiPrivacyService {
  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
    private readonly sessionStore: SessionStore,
    private readonly alphaStore: AlphaStore,
    private readonly llmOrchestrator: LlmOrchestrator,
  ) {}

  async start(command: DataAiPrivacyStartContextCommand): Promise<DataAiPrivacyRunResponse> {
    const payload = assertDataAiPrivacyStartRequest(command.payload);
    const profile = getRegulatoryProfile(payload.profile_id);

    return this.execute({
      context: {
        ...command.context,
        requestId: command.context.requestId ?? payload.request_id,
      },
      sessionId: payload.session_id,
      trigger: 'start',
    }, profile.profile_id);
  }

  async reply(command: DataAiPrivacyReplyContextCommand): Promise<DataAiPrivacyRunResponse> {
    const payload = assertDataAiPrivacyReplyRequest(command.payload);

    if (payload.answer.trim().length > this.config.maxReplyChars) {
      throw new AppError(
        400,
        'data_ai_privacy_reply_too_large',
        'The data AI privacy reply exceeds the maximum supported length',
        false,
        payload.session_id,
      );
    }

    if (payload.answer.trim().length === 0) {
      throw new AppError(
        400,
        'empty_data_ai_privacy_answer',
        'The data AI privacy reply cannot be empty',
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

      let chat = await this.alphaStore.findModuleChatByProposalAndModule(session.id, 'data_ai_privacy', client);
      if (!chat || !chat.active_turn_id) {
        const restored = await this.alphaStore.tryRestoreModuleChatForUserRetry(client, {
          proposalId: session.id,
          module: 'data_ai_privacy',
        });
        if (restored) {
          chat = restored.chat;
        }
      }

      if (!chat || !chat.active_turn_id) {
        throw new AppError(
          409,
          'no_open_data_ai_privacy_turn',
          'The data AI privacy chat is not waiting for a user answer',
          false,
          payload.session_id,
        );
      }

      const activeTurn = chat.turns.find((turn) => turn.turn_id === chat.active_turn_id);

      if (!activeTurn || activeTurn.turn_status !== 'awaiting_user') {
        throw new AppError(
          409,
          'data_ai_privacy_turn_not_waiting',
          'The active data AI privacy turn is not waiting for a user answer',
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
        eventType: 'data_ai_privacy_answer_received',
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

  async execute(command: RunDataAiPrivacyCommand, profileId = 'hospital_clinic_v1'): Promise<DataAiPrivacyRunResponse> {
    const requestId = command.context.requestId;
    const existingResponse = await this.findExistingResponse(command.sessionId, requestId);

    if (existingResponse) {
      return existingResponse;
    }

    const profile = getRegulatoryProfile(profileId as never);
    const session = await this.sessionStore.getSession(command.sessionId);
    const problemSection = await this.requireGeneratedSection(session.id, 'problem');
    const solutionSection = await this.requireGeneratedSection(session.id, 'solution');
    const chat = await this.ensureDataAiPrivacyChat(session);
    const activeTurn = this.getActiveTurn(chat.turns, chat.active_turn_id);

    this.assertStartDoesNotReopenCompletedChat(command, chat.chat_status);

    if (command.trigger === 'start' && activeTurn) {
      throw new AppError(
        409,
        'data_ai_privacy_start_already_initialized',
        'The data AI privacy chat already has an open clarification turn',
        false,
        command.sessionId,
      );
    }

    if (command.trigger === 'reply' && (!activeTurn || activeTurn.turn_status !== 'processing')) {
      throw new AppError(
        409,
        'data_ai_privacy_reply_not_ready_for_agent',
        'The data AI privacy chat does not have a processing turn ready for the agent',
        false,
        command.sessionId,
      );
    }

    const recentTurns = chat.turns
      .filter((turn) => turn.turn_status === 'resolved')
      .slice(-5)
      .map((turn) => ({
        question_text: turn.question_text,
        answer_text: turn.answer_text ?? null,
        diagnosis: turn.diagnosis,
      }));

    const recentQuestions = collectRecentQuestionTexts({
      resolvedTurns: recentTurns,
      currentQuestionText: activeTurn?.question_text,
    });

    try {
      const modelTurn = await this.llmOrchestrator.runDataAiPrivacyGap({
        structuredBrief: session.latest_structured_brief_json,
        problemSection,
        solutionSection,
        regulatoryProfile: profile,
        recentTurns,
        latestAnswer: activeTurn?.answer_text,
      });
      const guarded = enforceDataAiPrivacyTurnGuardrails(
        modelTurn.output,
        activeTurn?.answer_text,
        { recentQuestions },
      );

      if (
        guarded.turn.agent_status !== 'done' &&
        command.trigger === 'reply' &&
        chat.turns.length >= this.config.maxTurnsPerSession
      ) {
        guarded.turn.agent_status = 'blocked';
        guarded.turn.next_question = '';
        guarded.turn.completion_reason = 'maximum data AI privacy turns reached';
        guarded.warnings.push('Maximum data AI privacy turn count reached; chat blocked');
      }

      return this.sessionStore.getDatabase().withTransaction(async (client) => {
        const lockedSession = await this.sessionStore.getSessionForUpdate(command.sessionId, client);
        const recoveredResponse = await this.findExistingResponse(command.sessionId, requestId);

        if (recoveredResponse) {
          return recoveredResponse;
        }

        const lockedProblemSection = await this.requireGeneratedSection(lockedSession.id, 'problem', client);
        const lockedSolutionSection = await this.requireGeneratedSection(lockedSession.id, 'solution', client);
        const lockedChat = await this.ensureDataAiPrivacyChat(lockedSession, client);
        const lockedActiveTurn = this.getActiveTurn(lockedChat.turns, lockedChat.active_turn_id);

        this.assertStartDoesNotReopenCompletedChat(command, lockedChat.chat_status);

        if (command.trigger === 'start' && lockedActiveTurn) {
          throw new AppError(
            409,
            'data_ai_privacy_start_already_initialized',
            'The data AI privacy chat already has an open clarification turn',
            false,
            command.sessionId,
          );
        }

        if (command.trigger === 'reply' && (!lockedActiveTurn || lockedActiveTurn.turn_status !== 'processing')) {
          throw new AppError(
            409,
            'data_ai_privacy_reply_not_ready_for_agent',
            'The data AI privacy chat does not have a processing turn ready for the agent',
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
          runPurpose: 'data_ai_privacy_gap',
          agentName: 'data_ai_privacy_gap_agent',
          workflowName: 'agent_data_ai_privacy_gap_v1',
          workflowVersion: command.context.workflowVersion,
          workflowExecutionId: command.context.workflowExecutionId,
          promptName: modelTurn.prompt.name,
          promptVersion: modelTurn.prompt.version,
          promptSha256: modelTurn.prompt.hash,
          modelProvider: modelTurn.providerName,
          modelName: modelTurn.modelName,
          modelParamsJson: modelTurn.modelParams,
          inputContractName: 'data-ai-privacy-gap-agent.input',
          inputContractVersion: 'v1',
          outputContractName: 'data-ai-privacy-turn',
          outputContractVersion: 'v1',
          inputPayloadJson: {
            structured_brief: lockedSession.latest_structured_brief_json,
            problem_section: {
              section_id: lockedProblemSection.section_id,
              title: lockedProblemSection.title,
              source_refs: lockedProblemSection.source_refs.map((source) => source.source_id),
            },
            solution_section: {
              section_id: lockedSolutionSection.section_id,
              title: lockedSolutionSection.title,
              source_refs: lockedSolutionSection.source_refs.map((source) => source.source_id),
            },
            regulatory_profile: profile,
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
            eventType: 'data_ai_privacy_guardrail_fallback_applied',
            actorType: 'system',
            requestId,
            payloadJson: {
              reasons: guarded.intervention.reasons,
              normalized_fields: guarded.intervention.normalizedFields,
              fallback_question_applied: guarded.intervention.fallbackQuestionApplied,
              forced_agent_status: guarded.intervention.forcedAgentStatus ?? null,
              competent_human_review_required: guarded.intervention.competentHumanReviewRequired,
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
          updatedDataAiPrivacy: guarded.updatedDataAiPrivacy,
          latestAnswerWasVague: guarded.latestAnswerWasVague,
          warnings: guarded.warnings,
          runId: run.id,
          requestId,
          problemSection: lockedProblemSection,
          solutionSection: lockedSolutionSection,
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

  private assertStartDoesNotReopenCompletedChat(command: RunDataAiPrivacyCommand, chatStatus: string): void {
    if (
      command.trigger === 'start' &&
      (chatStatus === 'completed' || chatStatus === 'ready_to_generate')
    ) {
      throw new AppError(
        409,
        'data_ai_privacy_start_already_completed',
        'The data AI privacy chat has already completed',
        false,
        command.sessionId,
      );
    }
  }

  private async ensureDataAiPrivacyChat(session: SessionRecord, client?: PoolClient) {
    const existing = await this.alphaStore.findModuleChatByProposalAndModule(session.id, 'data_ai_privacy', client);

    if (existing) {
      return existing;
    }

    return this.alphaStore.createModuleChat(client ?? this.alphaStore.getDatabase(), {
      proposalId: session.id,
      module: 'data_ai_privacy',
      chatStatus: 'active',
      warnings: [DATA_AI_PRIVACY_REVIEW_WARNING],
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
        `${sectionKind}_section_required_for_data_ai_privacy`,
        'A generated problem and solution section are required before starting data AI privacy review',
        false,
        sessionId,
      );
    }

    return section;
  }

  private getActiveTurn(turns: ChatTurn[], activeTurnId?: string): ChatTurn | null {
    return turns.find((turn) => turn.turn_id === activeTurnId) ??
      turns.find((turn) => turn.turn_status === 'awaiting_user' || turn.turn_status === 'processing') ??
      null;
  }

  private nextTurnSeq(turns: ChatTurn[]): number {
    return Math.max(0, ...turns.map((turn) => turn.turn_seq)) + 1;
  }

  private async persistSuccessfulTurn(params: {
    client: PoolClient;
    session: SessionRecord;
    chatId: string;
    activeTurn: ChatTurn | null;
    existingTurns: ChatTurn[];
    guardedTurn: DataAiPrivacyTurn;
    updatedDataAiPrivacy: DataAiPrivacyState;
    latestAnswerWasVague: boolean;
    warnings: string[];
    runId: string;
    requestId: string;
    problemSection: GeneratedSection;
    solutionSection: GeneratedSection;
  }): Promise<DataAiPrivacyRunResponse> {
    await this.ensureDataAiPrivacyGaps(
      params.client,
      params.session.id,
      params.updatedDataAiPrivacy,
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
      const openedTurn = await this.openDataAiPrivacyQuestion({
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
      await this.generateDataAiPrivacySection(params);
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
      stage: 'data_ai_privacy',
      profile_id: 'hospital_clinic_v1',
      agent_status: params.guardedTurn.agent_status,
      updated_data_ai_privacy: params.updatedDataAiPrivacy,
      diagnosis: params.guardedTurn.diagnosis,
      next_question: params.guardedTurn.next_question,
      completion_reason: params.guardedTurn.completion_reason,
      warnings: params.warnings,
      run_id: params.runId,
    };
  }

  private async ensureDataAiPrivacyGaps(
    client: PoolClient,
    proposalId: string,
    state: DataAiPrivacyState,
    requestId: string,
  ): Promise<void> {
    const existingGaps = await this.alphaStore.listGaps(proposalId, client);
    const existingFields = new Set(
      existingGaps.filter((gap) => gap.module === 'data_ai_privacy').map((gap) => gap.field),
    );

    for (const field of computeDataAiPrivacyMissingInformation(state)) {
      if (existingFields.has(field)) {
        continue;
      }

      const gap = await this.alphaStore.createGap(client, {
        proposalId,
        module: 'data_ai_privacy',
        gapKind: field === 'human_review_plan' ? 'needs_user_confirmation' : 'missing_information',
        gapStatus: 'open',
        origin: 'system_rule',
        field,
        description: `Data AI privacy information gap for ${field.replace(/_/g, ' ')}.`,
        absence: {
          is_absent: field !== 'human_review_plan',
          checked_fields: [field],
          reason: 'Data AI privacy field is not sufficiently clear yet.',
        },
        questionHint: buildDataAiPrivacyFallbackQuestion(state),
        sourceRefs: [],
        auditRefs: [],
        warnings: [DATA_AI_PRIVACY_REVIEW_WARNING],
      });

      await this.alphaStore.appendAuditEvent(client, {
        proposalId,
        sessionId: proposalId,
        eventType: 'data_ai_privacy_gap_detected',
        actorType: 'system',
        requestId,
        payloadJson: {
          gap_id: gap.gap_id,
          module: 'data_ai_privacy',
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
    guardedTurn: DataAiPrivacyTurn;
    updatedDataAiPrivacy: DataAiPrivacyState;
    latestAnswerWasVague: boolean;
    warnings: string[];
    runId: string;
    requestId: string;
    gaps: AlphaGap[];
  }): Promise<void> {
    if (!params.activeTurn?.answer_text) {
      throw new AppError(
        409,
        'data_ai_privacy_answer_missing',
        'The active data AI privacy turn has no user answer to resolve',
        false,
        params.session.id,
      );
    }

    const answerSource = await this.alphaStore.createSource(params.client, {
      proposalId: params.session.id,
      sourceKind: 'user_answer',
      label: `Data AI privacy answer turn ${params.activeTurn.turn_seq}`,
      turnId: params.activeTurn.turn_id,
      metadata: {
        request_id: params.requestId,
      },
    });
    const gapStatusChanges = !params.latestAnswerWasVague
      ? classifyDataAiPrivacyGapStatuses(params.gaps, params.updatedDataAiPrivacy, params.activeTurn.turn_id)
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
      eventType: 'data_ai_privacy_answer_resolved',
      actorType: 'system',
      requestId: params.requestId,
      payloadJson: {
        source_id: answerSource.source_id,
        gap_refs: Array.from(resolvedGapRefSet),
      },
    });
  }

  private async openDataAiPrivacyQuestion(params: {
    client: PoolClient;
    session: SessionRecord;
    chatId: string;
    guardedTurn: DataAiPrivacyTurn;
    updatedDataAiPrivacy: DataAiPrivacyState;
    warnings: string[];
    runId: string;
    requestId: string;
    turnSeq: number;
    gaps: AlphaGap[];
  }): Promise<ChatTurn> {
    const gapRefs = selectDataAiPrivacyGapRefs(params.gaps, params.updatedDataAiPrivacy);
    const alphaTurn = await this.alphaStore.createChatTurn(params.client, {
      chatId: params.chatId,
      proposalId: params.session.id,
      module: 'data_ai_privacy',
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
      eventType: 'data_ai_privacy_turn_opened',
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

  private async generateDataAiPrivacySection(params: {
    client: PoolClient;
    session: SessionRecord;
    updatedDataAiPrivacy: DataAiPrivacyState;
    warnings: string[];
    runId: string;
    requestId: string;
    problemSection: GeneratedSection;
    solutionSection: GeneratedSection;
  }): Promise<void> {
    const sources = await this.alphaStore.listSources(params.session.id, params.client);
    const generatedSectionSources = sources.filter((source) =>
      source.source_kind === 'generated_section' &&
      (
        source.section_id === params.problemSection.section_id ||
        source.section_id === params.solutionSection.section_id
      ),
    );
    const sourceRefs = buildDataAiPrivacySectionSourceRefs(
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
    );
    const gaps = await this.alphaStore.listGaps(params.session.id, params.client);
    const gapRefs = gaps
      .filter((gap) => gap.module === 'data_ai_privacy' && gap.gap_status === 'resolved')
      .map((gap) => gap.gap_id);
    const renderedSection = renderDataAiPrivacySection(params.updatedDataAiPrivacy, {
      sourceCount: sourceRefs.length,
      gapCount: gapRefs.length,
    });
    const currentSection = await this.alphaStore.findCurrentGeneratedSection(
      params.session.id,
      'data_ai_privacy',
      params.client,
    );

    if (currentSection) {
      await this.alphaStore.supersedeGeneratedSection(params.client, {
        sectionId: currentSection.section_id,
      });
    }

    const section = await this.alphaStore.createGeneratedSection(params.client, {
      proposalId: params.session.id,
      sectionKind: 'data_ai_privacy',
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
      label: `Data AI privacy section v${section.section_version}`,
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
      eventType: 'data_ai_privacy_section_generated',
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
  ): Promise<DataAiPrivacyRunResponse | null> {
    if (!requestId) {
      return null;
    }

    const existingRun = await this.sessionStore.findAgentRunByRequestId(requestId, 'data_ai_privacy_gap');

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
  ): Promise<DataAiPrivacyRunResponse | null> {
    if (!requestId || !isUniqueViolation(error)) {
      return null;
    }

    return this.findExistingResponse(sessionId, requestId);
  }

  private toStoredAgentRunError(run: AgentRunRecord, sessionId: string): AppError {
    const statusCode = run.status === 'model_failed' ? 504 : 502;

    return new AppError(
      statusCode,
      run.error_code ?? 'data_ai_privacy_request_failed',
      run.error_message ?? 'The data AI privacy request failed while executing the workflow',
      run.status === 'model_failed',
      sessionId,
    );
  }

  private async buildResponseFromRun(sessionId: string, run: AgentRunRecord): Promise<DataAiPrivacyRunResponse> {
    const output = run.validated_output_json as unknown as DataAiPrivacyTurn;
    const warnings = await this.findPersistedWarningsForRun(sessionId, run.id);

    return {
      session_id: sessionId,
      stage: 'data_ai_privacy',
      profile_id: 'hospital_clinic_v1',
      agent_status: output.agent_status,
      updated_data_ai_privacy: output.updated_data_ai_privacy,
      diagnosis: output.diagnosis,
      next_question: output.agent_status === 'continue' ? output.next_question : '',
      completion_reason: output.completion_reason,
      warnings,
      run_id: run.id,
    };
  }

  private async findPersistedWarningsForRun(sessionId: string, runId: string): Promise<string[]> {
    const chat = await this.alphaStore.findModuleChatByProposalAndModule(sessionId, 'data_ai_privacy');

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
    command: RunDataAiPrivacyCommand,
    session: SessionRecord,
    activeTurn: ChatTurn | null,
    error: AppError,
  ): Promise<void> {
    try {
      const prompt = await loadPrompt('data-ai-privacy-gap-agent');

      await this.sessionStore.getDatabase().withTransaction(async (client) => {
        const lockedSession = await this.sessionStore.getSessionForUpdate(session.id, client);
        const run = await this.sessionStore.recordAgentRun(client, {
          sessionId: lockedSession.id,
          turnSeq: activeTurn?.turn_seq ?? 1,
          requestId: command.context.requestId,
          runPurpose: 'data_ai_privacy_gap',
          agentName: 'data_ai_privacy_gap_agent',
          workflowName: 'agent_data_ai_privacy_gap_v1',
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
          inputContractName: 'data-ai-privacy-gap-agent.input',
          inputContractVersion: 'v1',
          outputContractName: 'data-ai-privacy-turn',
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
              module: 'data_ai_privacy',
              activeTurn,
              trigger: command.trigger,
              error,
              runId: run.id,
              requestId: command.context.requestId,
              retryAuditEventType: 'data_ai_privacy_answer_retry_opened',
              failureAuditEventType: 'data_ai_privacy_answer_failed',
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
              'data_ai_privacy',
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
              eventType: 'data_ai_privacy_answer_failed',
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
            eventType: 'data_ai_privacy_agent_failed',
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

    this.logger.error('data_ai_privacy_failed', {
      request_id: command.context.requestId,
      session_id: command.sessionId,
      error_code: error.errorCode,
      schema: schemaIds.dataAiPrivacyTurn,
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
