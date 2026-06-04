import type { PoolClient } from 'pg';

import {
  assertMedicalDeviceTriageReplyRequest,
  assertMedicalDeviceTriageStartRequest,
  schemaIds,
} from '../contracts/schema-registry';
import type {
  AlphaGap,
  ChatTurn,
  GeneratedSection,
  MedicalDeviceTriageState,
  MedicalDeviceTriageTurn,
} from '../contracts/types';
import type { AppConfig } from '../config/env';
import {
  MEDICAL_DEVICE_TRIAGE_REVIEW_WARNING,
  buildMedicalDeviceFallbackQuestion,
  buildMedicalDeviceSectionSourceRefs,
  classifyMedicalDeviceGapStatuses,
  computeMedicalDeviceMissingInformation,
  enforceMedicalDeviceTriageTurnGuardrails,
  evaluateMedicalDeviceActivation,
  medicalDeviceStateFromActivation,
  renderMedicalDeviceTriageSection,
  selectMedicalDeviceGapRefs,
} from '../domain/medical-device-triage';
import { getRegulatoryProfile } from '../domain/regulatory-profile';
import type { AlphaStore } from '../repositories/alpha-store';
import type { AgentRunRecord, SessionRecord, SessionStore } from '../repositories/session-store';
import { AppError, ModelOutputError } from '../utils/errors';
import type { Logger } from '../utils/logger';
import type { LlmOrchestrator } from './llm-orchestrator';
import { loadPrompt } from './prompt-service';
import type {
  MedicalDeviceTriageReplyContextCommand,
  MedicalDeviceTriageRunResponse,
  MedicalDeviceTriageStartContextCommand,
  RunMedicalDeviceTriageCommand,
} from './service-types';

export class MedicalDeviceTriageService {
  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
    private readonly sessionStore: SessionStore,
    private readonly alphaStore: AlphaStore,
    private readonly llmOrchestrator: LlmOrchestrator,
  ) {}

  async start(command: MedicalDeviceTriageStartContextCommand): Promise<MedicalDeviceTriageRunResponse> {
    const payload = assertMedicalDeviceTriageStartRequest(command.payload);
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

  async reply(command: MedicalDeviceTriageReplyContextCommand): Promise<MedicalDeviceTriageRunResponse> {
    const payload = assertMedicalDeviceTriageReplyRequest(command.payload);

    if (payload.answer.trim().length > this.config.maxReplyChars) {
      throw new AppError(
        400,
        'medical_device_triage_reply_too_large',
        'The medical-device triage reply exceeds the maximum supported length',
        false,
        payload.session_id,
      );
    }

    if (payload.answer.trim().length === 0) {
      throw new AppError(
        400,
        'empty_medical_device_triage_answer',
        'The medical-device triage reply cannot be empty',
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
      const chat = await this.alphaStore.findModuleChatByProposalAndModule(
        session.id,
        'medical_device_triage',
        client,
      );

      if (!chat || !chat.active_turn_id) {
        throw new AppError(
          409,
          'no_open_medical_device_triage_turn',
          'The medical-device triage chat is not waiting for a user answer',
          false,
          payload.session_id,
        );
      }

      const activeTurn = chat.turns.find((turn) => turn.turn_id === chat.active_turn_id);

      if (!activeTurn || activeTurn.turn_status !== 'awaiting_user') {
        throw new AppError(
          409,
          'medical_device_triage_turn_not_waiting',
          'The active medical-device triage turn is not waiting for a user answer',
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
        eventType: 'medical_device_triage_answer_received',
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

  async execute(
    command: RunMedicalDeviceTriageCommand,
    profileId = 'hospital_clinic_v1',
  ): Promise<MedicalDeviceTriageRunResponse> {
    const requestId = command.context.requestId;
    const existingResponse = await this.findExistingResponse(command.sessionId, requestId);

    if (existingResponse) {
      return existingResponse;
    }

    const profile = getRegulatoryProfile(profileId as never);
    const session = await this.sessionStore.getSession(command.sessionId);
    const problemSection = await this.requireGeneratedSection(session.id, 'problem');
    const solutionSection = await this.requireGeneratedSection(session.id, 'solution');
    const dataAiPrivacySection = await this.requireGeneratedSection(session.id, 'data_ai_privacy');
    const sources = await this.alphaStore.listSources(session.id);
    const activation = evaluateMedicalDeviceActivation({
      structuredBrief: session.latest_structured_brief_json,
      problemSection,
      solutionSection,
      dataAiPrivacySection,
      sources,
    });
    const chat = await this.ensureMedicalDeviceTriageChat(session);
    const activeTurn = this.getActiveTurn(chat.turns, chat.active_turn_id);

    this.assertStartDoesNotReopenCompletedChat(command, chat.chat_status);

    if (command.trigger === 'start' && activeTurn) {
      throw new AppError(
        409,
        'medical_device_triage_start_already_initialized',
        'The medical-device triage chat already has an open clarification turn',
        false,
        command.sessionId,
      );
    }

    if (command.trigger === 'reply' && (!activeTurn || activeTurn.turn_status !== 'processing')) {
      throw new AppError(
        409,
        'medical_device_triage_reply_not_ready_for_agent',
        'The medical-device triage chat does not have a processing turn ready for the agent',
        false,
        command.sessionId,
      );
    }

    if (activation.triageStatus === 'not_applicable' && command.trigger === 'start') {
      return this.persistNotApplicableStart({
        command,
        session,
        problemSection,
        solutionSection,
        dataAiPrivacySection,
        activationState: medicalDeviceStateFromActivation(activation),
      });
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
      const modelTurn = await this.llmOrchestrator.runMedicalDeviceTriage({
        structuredBrief: session.latest_structured_brief_json,
        problemSection,
        solutionSection,
        dataAiPrivacySection,
        regulatoryProfile: profile,
        activationResult: {
          triage_status: activation.triageStatus,
          activation_signals: activation.activationSignals,
          uncertainties: activation.uncertainties,
          needs_human_review: activation.needsHumanReview,
          requires_competent_human_review: activation.requiresCompetentHumanReview,
        },
        recentTurns,
        latestAnswer: activeTurn?.answer_text,
      });
      const guarded = enforceMedicalDeviceTriageTurnGuardrails(modelTurn.output, activeTurn?.answer_text);

      if (
        guarded.turn.agent_status !== 'done' &&
        command.trigger === 'reply' &&
        chat.turns.length >= this.config.maxTurnsPerSession
      ) {
        guarded.turn.agent_status = 'blocked';
        guarded.turn.next_question = '';
        guarded.turn.completion_reason = 'maximum medical-device triage turns reached';
        guarded.warnings.push('Maximum medical-device triage turn count reached; chat blocked');
      }

      return this.sessionStore.getDatabase().withTransaction(async (client) => {
        const lockedSession = await this.sessionStore.getSessionForUpdate(command.sessionId, client);
        const recoveredResponse = await this.findExistingResponse(command.sessionId, requestId);

        if (recoveredResponse) {
          return recoveredResponse;
        }

        const lockedProblemSection = await this.requireGeneratedSection(lockedSession.id, 'problem', client);
        const lockedSolutionSection = await this.requireGeneratedSection(lockedSession.id, 'solution', client);
        const lockedDataAiPrivacySection = await this.requireGeneratedSection(
          lockedSession.id,
          'data_ai_privacy',
          client,
        );
        const lockedChat = await this.ensureMedicalDeviceTriageChat(lockedSession, client);
        const lockedActiveTurn = this.getActiveTurn(lockedChat.turns, lockedChat.active_turn_id);

        this.assertStartDoesNotReopenCompletedChat(command, lockedChat.chat_status);

        if (command.trigger === 'start' && lockedActiveTurn) {
          throw new AppError(
            409,
            'medical_device_triage_start_already_initialized',
            'The medical-device triage chat already has an open clarification turn',
            false,
            command.sessionId,
          );
        }

        if (command.trigger === 'reply' && (!lockedActiveTurn || lockedActiveTurn.turn_status !== 'processing')) {
          throw new AppError(
            409,
            'medical_device_triage_reply_not_ready_for_agent',
            'The medical-device triage chat does not have a processing turn ready for the agent',
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
          runPurpose: 'medical_device_triage',
          agentName: 'medical_device_triage_agent',
          workflowName: 'agent_medical_device_triage_v1',
          workflowVersion: command.context.workflowVersion,
          workflowExecutionId: command.context.workflowExecutionId,
          promptName: modelTurn.prompt.name,
          promptVersion: modelTurn.prompt.version,
          promptSha256: modelTurn.prompt.hash,
          modelProvider: modelTurn.providerName,
          modelName: modelTurn.modelName,
          modelParamsJson: modelTurn.modelParams,
          inputContractName: 'medical-device-triage-agent.input',
          inputContractVersion: 'v1',
          outputContractName: 'medical-device-triage-turn',
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
            data_ai_privacy_section: {
              section_id: lockedDataAiPrivacySection.section_id,
              title: lockedDataAiPrivacySection.title,
              source_refs: lockedDataAiPrivacySection.source_refs.map((source) => source.source_id),
            },
            regulatory_profile: profile,
            activation_result: activation,
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
            eventType: 'medical_device_triage_guardrail_fallback_applied',
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
          updatedMedicalDeviceTriage: guarded.updatedMedicalDeviceTriage,
          latestAnswerWasVague: guarded.latestAnswerWasVague,
          warnings: guarded.warnings,
          runId: run.id,
          requestId,
          problemSection: lockedProblemSection,
          solutionSection: lockedSolutionSection,
          dataAiPrivacySection: lockedDataAiPrivacySection,
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

  private async persistNotApplicableStart(params: {
    command: RunMedicalDeviceTriageCommand;
    session: SessionRecord;
    problemSection: GeneratedSection;
    solutionSection: GeneratedSection;
    dataAiPrivacySection: GeneratedSection;
    activationState: MedicalDeviceTriageState;
  }): Promise<MedicalDeviceTriageRunResponse> {
    const prompt = await loadPrompt('medical-device-triage-agent');

    return this.sessionStore.getDatabase().withTransaction(async (client) => {
      const lockedSession = await this.sessionStore.getSessionForUpdate(params.session.id, client);
      const recoveredResponse = await this.findExistingResponse(
        lockedSession.id,
        params.command.context.requestId,
      );

      if (recoveredResponse) {
        return recoveredResponse;
      }

      const lockedProblemSection = await this.requireGeneratedSection(lockedSession.id, 'problem', client);
      const lockedSolutionSection = await this.requireGeneratedSection(lockedSession.id, 'solution', client);
      const lockedDataAiPrivacySection = await this.requireGeneratedSection(
        lockedSession.id,
        'data_ai_privacy',
        client,
      );
      const chat = await this.ensureMedicalDeviceTriageChat(lockedSession, client);
      this.assertStartDoesNotReopenCompletedChat(params.command, chat.chat_status);

      const output: MedicalDeviceTriageTurn = {
        agent_status: 'done',
        diagnosis: ['No medical-device signals or uncertainty are present in persisted proposal material.'],
        updated_medical_device_triage: params.activationState,
        next_question: '',
        completion_reason: 'medical-device triage recorded as not_applicable for current persisted material',
      };
      const run = await this.sessionStore.recordAgentRun(client, {
        sessionId: lockedSession.id,
        turnSeq: undefined,
        requestId: params.command.context.requestId,
        runPurpose: 'medical_device_triage',
        agentName: 'medical_device_triage_agent',
        workflowName: 'medical_device_triage_start_v1',
        workflowVersion: params.command.context.workflowVersion,
        workflowExecutionId: params.command.context.workflowExecutionId,
        promptName: prompt.name,
        promptVersion: prompt.version,
        promptSha256: prompt.hash,
        modelProvider: this.config.aiProvider,
        modelName: this.config.aiModel,
        modelParamsJson: {
          deterministic_activation: true,
        },
        inputContractName: 'medical-device-triage-start.input',
        inputContractVersion: 'v1',
        outputContractName: 'medical-device-triage-turn',
        outputContractVersion: 'v1',
        inputPayloadJson: {
          session_id: lockedSession.id,
          trigger: params.command.trigger,
          activation_state: params.activationState,
        },
        validatedOutputJson: output as unknown as Record<string, unknown>,
        status: 'completed',
        repairAttempted: false,
        metricsJson: {
          deterministic_activation: true,
        },
      });

      await this.alphaStore.updateModuleChatStatus(client, {
        chatId: chat.chat_id,
        chatStatus: 'ready_to_generate',
        activeTurnId: null,
      });
      await this.generateMedicalDeviceTriageSection({
        client,
        session: lockedSession,
        updatedMedicalDeviceTriage: params.activationState,
        warnings: [MEDICAL_DEVICE_TRIAGE_REVIEW_WARNING],
        runId: run.id,
        requestId: params.command.context.requestId,
        problemSection: lockedProblemSection,
        solutionSection: lockedSolutionSection,
        dataAiPrivacySection: lockedDataAiPrivacySection,
      });
      await this.alphaStore.updateModuleChatStatus(client, {
        chatId: chat.chat_id,
        chatStatus: 'completed',
        activeTurnId: null,
      });
      await this.alphaStore.appendAuditEvent(client, {
        proposalId: lockedSession.id,
        sessionId: lockedSession.id,
        runId: run.id,
        eventType: 'medical_device_triage_not_applicable_recorded',
        actorType: 'system',
        requestId: params.command.context.requestId,
        payloadJson: {
          triage_status: params.activationState.triage_status,
          activation_signals: params.activationState.activation_signals,
          uncertainties: params.activationState.uncertainties,
        },
      });

      return this.buildResponseFromTurn(lockedSession.id, run.id, output, [MEDICAL_DEVICE_TRIAGE_REVIEW_WARNING]);
    });
  }

  private assertStartDoesNotReopenCompletedChat(
    command: RunMedicalDeviceTriageCommand,
    chatStatus: string,
  ): void {
    if (
      command.trigger === 'start' &&
      (chatStatus === 'completed' || chatStatus === 'ready_to_generate')
    ) {
      throw new AppError(
        409,
        'medical_device_triage_start_already_completed',
        'The medical-device triage chat has already completed',
        false,
        command.sessionId,
      );
    }
  }

  private async ensureMedicalDeviceTriageChat(session: SessionRecord, client?: PoolClient) {
    const existing = await this.alphaStore.findModuleChatByProposalAndModule(
      session.id,
      'medical_device_triage',
      client,
    );

    if (existing) {
      return existing;
    }

    return this.alphaStore.createModuleChat(client ?? this.alphaStore.getDatabase(), {
      proposalId: session.id,
      module: 'medical_device_triage',
      chatStatus: 'active',
      warnings: [MEDICAL_DEVICE_TRIAGE_REVIEW_WARNING],
    });
  }

  private async requireGeneratedSection(
    sessionId: string,
    sectionKind: 'problem' | 'solution' | 'data_ai_privacy',
    client?: PoolClient,
  ): Promise<GeneratedSection> {
    const section = await this.alphaStore.findCurrentGeneratedSection(sessionId, sectionKind, client);

    if (!section) {
      throw new AppError(
        409,
        `${sectionKind}_section_required_for_medical_device_triage`,
        'Generated problem, solution, and data AI privacy sections are required before medical-device triage',
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
    guardedTurn: MedicalDeviceTriageTurn;
    updatedMedicalDeviceTriage: MedicalDeviceTriageState;
    latestAnswerWasVague: boolean;
    warnings: string[];
    runId: string;
    requestId: string;
    problemSection: GeneratedSection;
    solutionSection: GeneratedSection;
    dataAiPrivacySection: GeneratedSection;
  }): Promise<MedicalDeviceTriageRunResponse> {
    await this.ensureMedicalDeviceTriageGaps(
      params.client,
      params.session.id,
      params.updatedMedicalDeviceTriage,
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
      const openedTurn = await this.openMedicalDeviceTriageQuestion({
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
      await this.generateMedicalDeviceTriageSection(params);
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

    return this.buildResponseFromTurn(
      params.session.id,
      params.runId,
      params.guardedTurn,
      params.warnings,
    );
  }

  private async ensureMedicalDeviceTriageGaps(
    client: PoolClient,
    proposalId: string,
    state: MedicalDeviceTriageState,
    requestId: string,
  ): Promise<void> {
    const existingGaps = await this.alphaStore.listGaps(proposalId, client);
    const existingFields = new Set(
      existingGaps.filter((gap) => gap.module === 'medical_device_triage').map((gap) => gap.field),
    );

    for (const field of computeMedicalDeviceMissingInformation(state)) {
      if (existingFields.has(field)) {
        continue;
      }

      const gap = await this.alphaStore.createGap(client, {
        proposalId,
        module: 'medical_device_triage',
        gapKind: field === 'human_review_plan' ? 'needs_user_confirmation' : 'missing_information',
        gapStatus: 'open',
        origin: 'system_rule',
        field,
        description: `Medical-device triage gap for ${field.replace(/_/g, ' ')}.`,
        absence: {
          is_absent: field !== 'human_review_plan',
          checked_fields: [field],
          reason: 'Medical-device triage field is not sufficiently clear yet.',
        },
        questionHint: buildMedicalDeviceFallbackQuestion(state),
        sourceRefs: [],
        auditRefs: [],
        warnings: [MEDICAL_DEVICE_TRIAGE_REVIEW_WARNING],
      });

      await this.alphaStore.appendAuditEvent(client, {
        proposalId,
        sessionId: proposalId,
        eventType: 'medical_device_triage_gap_detected',
        actorType: 'system',
        requestId,
        payloadJson: {
          gap_id: gap.gap_id,
          module: 'medical_device_triage',
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
    guardedTurn: MedicalDeviceTriageTurn;
    updatedMedicalDeviceTriage: MedicalDeviceTriageState;
    latestAnswerWasVague: boolean;
    warnings: string[];
    runId: string;
    requestId: string;
    gaps: AlphaGap[];
  }): Promise<void> {
    if (!params.activeTurn?.answer_text) {
      throw new AppError(
        409,
        'medical_device_triage_answer_missing',
        'The active medical-device triage turn has no user answer to resolve',
        false,
        params.session.id,
      );
    }

    const answerSource = await this.alphaStore.createSource(params.client, {
      proposalId: params.session.id,
      sourceKind: 'user_answer',
      label: `Medical-device triage answer turn ${params.activeTurn.turn_seq}`,
      turnId: params.activeTurn.turn_id,
      metadata: {
        request_id: params.requestId,
      },
    });
    const gapStatusChanges = !params.latestAnswerWasVague
      ? classifyMedicalDeviceGapStatuses(
          params.gaps,
          params.updatedMedicalDeviceTriage,
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
      eventType: 'medical_device_triage_answer_resolved',
      actorType: 'system',
      requestId: params.requestId,
      payloadJson: {
        source_id: answerSource.source_id,
        gap_refs: Array.from(resolvedGapRefSet),
      },
    });
  }

  private async openMedicalDeviceTriageQuestion(params: {
    client: PoolClient;
    session: SessionRecord;
    chatId: string;
    guardedTurn: MedicalDeviceTriageTurn;
    updatedMedicalDeviceTriage: MedicalDeviceTriageState;
    warnings: string[];
    runId: string;
    requestId: string;
    turnSeq: number;
    gaps: AlphaGap[];
  }): Promise<ChatTurn> {
    const gapRefs = selectMedicalDeviceGapRefs(params.gaps, params.updatedMedicalDeviceTriage);
    const alphaTurn = await this.alphaStore.createChatTurn(params.client, {
      chatId: params.chatId,
      proposalId: params.session.id,
      module: 'medical_device_triage',
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
      eventType: 'medical_device_triage_turn_opened',
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

  private async generateMedicalDeviceTriageSection(params: {
    client: PoolClient;
    session: SessionRecord;
    updatedMedicalDeviceTriage: MedicalDeviceTriageState;
    warnings: string[];
    runId: string;
    requestId: string;
    problemSection: GeneratedSection;
    solutionSection: GeneratedSection;
    dataAiPrivacySection: GeneratedSection;
  }): Promise<void> {
    const sources = await this.alphaStore.listSources(params.session.id, params.client);
    const generatedSectionSources = sources.filter((source) =>
      source.source_kind === 'generated_section' &&
      (
        source.section_id === params.problemSection.section_id ||
        source.section_id === params.solutionSection.section_id ||
        source.section_id === params.dataAiPrivacySection.section_id
      ),
    );
    const sourceRefs = buildMedicalDeviceSectionSourceRefs(
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
    );
    const gaps = await this.alphaStore.listGaps(params.session.id, params.client);
    const gapRefs = gaps
      .filter((gap) => gap.module === 'medical_device_triage' && gap.gap_status === 'resolved')
      .map((gap) => gap.gap_id);
    const renderedSection = renderMedicalDeviceTriageSection(params.updatedMedicalDeviceTriage, {
      sourceCount: sourceRefs.length,
      gapCount: gapRefs.length,
    });
    const currentSection = await this.alphaStore.findCurrentGeneratedSection(
      params.session.id,
      'medical_device_triage',
      params.client,
    );

    if (currentSection) {
      await this.alphaStore.supersedeGeneratedSection(params.client, {
        sectionId: currentSection.section_id,
      });
    }

    const section = await this.alphaStore.createGeneratedSection(params.client, {
      proposalId: params.session.id,
      sectionKind: 'medical_device_triage',
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
      label: `Medical-device triage section v${section.section_version}`,
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
      eventType: 'medical_device_triage_section_generated',
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
  ): Promise<MedicalDeviceTriageRunResponse | null> {
    if (!requestId) {
      return null;
    }

    const existingRun = await this.sessionStore.findAgentRunByRequestId(requestId, 'medical_device_triage');

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
  ): Promise<MedicalDeviceTriageRunResponse | null> {
    if (!requestId || !isUniqueViolation(error)) {
      return null;
    }

    return this.findExistingResponse(sessionId, requestId);
  }

  private toStoredAgentRunError(run: AgentRunRecord, sessionId: string): AppError {
    const statusCode = run.status === 'model_failed' ? 504 : 502;

    return new AppError(
      statusCode,
      run.error_code ?? 'medical_device_triage_request_failed',
      run.error_message ?? 'The medical-device triage request failed while executing the workflow',
      run.status === 'model_failed',
      sessionId,
    );
  }

  private async buildResponseFromRun(
    sessionId: string,
    run: AgentRunRecord,
  ): Promise<MedicalDeviceTriageRunResponse> {
    const output = run.validated_output_json as unknown as MedicalDeviceTriageTurn;
    const warnings = await this.findPersistedWarningsForRun(sessionId, run.id);

    return this.buildResponseFromTurn(sessionId, run.id, output, warnings);
  }

  private buildResponseFromTurn(
    sessionId: string,
    runId: string,
    output: MedicalDeviceTriageTurn,
    warnings: string[],
  ): MedicalDeviceTriageRunResponse {
    return {
      session_id: sessionId,
      stage: 'medical_device_triage',
      profile_id: 'hospital_clinic_v1',
      activation_result: output.updated_medical_device_triage.triage_status,
      agent_status: output.agent_status,
      updated_medical_device_triage: output.updated_medical_device_triage,
      diagnosis: output.diagnosis,
      next_question: output.agent_status === 'continue' ? output.next_question : '',
      completion_reason: output.completion_reason,
      warnings,
      run_id: runId,
    };
  }

  private async findPersistedWarningsForRun(sessionId: string, runId: string): Promise<string[]> {
    const chat = await this.alphaStore.findModuleChatByProposalAndModule(sessionId, 'medical_device_triage');
    const warnings = new Set<string>();

    if (chat) {
      for (const turn of chat.turns) {
        const isRunTurn = turn.audit_refs.some((ref) => ref.kind === 'agent_run' && ref.id === runId);

        if (isRunTurn) {
          for (const warning of turn.warnings) {
            warnings.add(warning);
          }
        }
      }
    }

    const section = await this.alphaStore.findCurrentGeneratedSection(sessionId, 'medical_device_triage');
    if (section?.generated_by_run_id === runId) {
      for (const warning of section.warnings) {
        warnings.add(warning);
      }
    }

    return Array.from(warnings);
  }

  private async persistFailure(
    command: RunMedicalDeviceTriageCommand,
    session: SessionRecord,
    activeTurn: ChatTurn | null,
    error: AppError,
  ): Promise<void> {
    try {
      const prompt = await loadPrompt('medical-device-triage-agent');

      await this.sessionStore.getDatabase().withTransaction(async (client) => {
        const lockedSession = await this.sessionStore.getSessionForUpdate(session.id, client);
        const run = await this.sessionStore.recordAgentRun(client, {
          sessionId: lockedSession.id,
          turnSeq: activeTurn?.turn_seq ?? 1,
          requestId: command.context.requestId,
          runPurpose: 'medical_device_triage',
          agentName: 'medical_device_triage_agent',
          workflowName: 'agent_medical_device_triage_v1',
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
          inputContractName: 'medical-device-triage-agent.input',
          inputContractVersion: 'v1',
          outputContractName: 'medical-device-triage-turn',
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
        }

        const chat = await this.alphaStore.findModuleChatByProposalAndModule(
          lockedSession.id,
          'medical_device_triage',
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
          turnId: activeTurn?.turn_id,
          eventType: activeTurn ? 'medical_device_triage_answer_failed' : 'medical_device_triage_agent_failed',
          actorType: 'system',
          requestId: command.context.requestId,
          payloadJson: {
            error_code: error.errorCode,
            reason: error.safeMessage,
          },
        });
      });
    } catch (persistError) {
      if (!isUniqueViolationForConstraint(persistError, 'uq_agent_runs_request_purpose')) {
        throw persistError;
      }
    }

    this.logger.error('medical_device_triage_failed', {
      request_id: command.context.requestId,
      session_id: command.sessionId,
      error_code: error.errorCode,
      schema: schemaIds.medicalDeviceTriageTurn,
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
