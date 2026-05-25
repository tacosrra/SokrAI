import type { PoolClient } from 'pg';

import { schemaIds } from '../contracts/schema-registry';
import type {
  AlphaGap,
  ChatTurn,
  GeneratedSection,
  ProposalSource,
  SolutionDefinitionState,
  SolutionDefinitionTurn,
} from '../contracts/types';
import type { AppConfig } from '../config/env';
import {
  buildSolutionFallbackQuestion,
  buildSolutionSectionSourceRefs,
  classifySolutionGapStatuses,
  computeSolutionMissingInformation,
  emptySolutionDefinition,
  enforceSolutionTurnGuardrails,
  renderSolutionSection,
  selectSolutionGapRefs,
} from '../domain/solution-definition';
import type { AlphaStore } from '../repositories/alpha-store';
import type { AgentRunRecord, SessionRecord, SessionStore } from '../repositories/session-store';
import { AppError, ModelOutputError } from '../utils/errors';
import type { Logger } from '../utils/logger';
import type { LlmOrchestrator } from './llm-orchestrator';
import { loadPrompt } from './prompt-service';
import type {
  RunSolutionDefinitionCommand,
  SolutionDefinitionRunResponse,
} from './service-types';

export class SolutionDefinitionService {
  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
    private readonly sessionStore: SessionStore,
    private readonly alphaStore: AlphaStore,
    private readonly llmOrchestrator: LlmOrchestrator,
  ) {}

  async execute(command: RunSolutionDefinitionCommand): Promise<SolutionDefinitionRunResponse> {
    const requestId = command.context.requestId;
    const existingResponse = await this.findExistingResponse(command.sessionId, requestId);

    if (existingResponse) {
      return existingResponse;
    }

    const session = await this.sessionStore.getSession(command.sessionId);
    const problemSection = await this.requireProblemSection(session.id);
    const chat = await this.ensureSolutionChat(session);
    const activeTurn = this.getActiveTurn(chat.turns, chat.active_turn_id);

    this.assertStartDoesNotReopenCompletedChat(command, chat.chat_status);

    if (command.trigger === 'start' && activeTurn) {
      throw new AppError(
        409,
        'solution_start_already_initialized',
        'The solution chat already has an open clarification turn',
        false,
        command.sessionId,
      );
    }

    if (command.trigger === 'reply' && (!activeTurn || activeTurn.turn_status !== 'processing')) {
      throw new AppError(
        409,
        'solution_reply_not_ready_for_agent',
        'The solution chat does not have a processing turn ready for the agent',
        false,
        command.sessionId,
      );
    }

    if (chat.turns.length >= this.config.maxTurnsPerSession && command.trigger === 'reply') {
      throw new AppError(
        409,
        'solution_maximum_turns_reached',
        'The maximum number of solution turns has already been reached',
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

    try {
      const modelTurn = await this.llmOrchestrator.runSolutionDefinition({
        structuredBrief: session.latest_structured_brief_json,
        problemSection,
        recentTurns,
        latestAnswer: activeTurn?.answer_text,
      });
      const guarded = enforceSolutionTurnGuardrails(
        modelTurn.output,
        activeTurn?.answer_text,
        { isInitialRun: command.trigger === 'start' },
      );

      if (
        guarded.turn.agent_status !== 'done' &&
        command.trigger === 'reply' &&
        chat.turns.length >= this.config.maxTurnsPerSession
      ) {
        guarded.turn.agent_status = 'blocked';
        guarded.turn.next_question = '';
        guarded.turn.completion_reason = 'maximum solution turns reached';
        guarded.warnings.push('Maximum solution turn count reached; chat blocked');
      }

      return this.sessionStore
        .getDatabase()
        .withTransaction(async (client) => {
          const lockedSession = await this.sessionStore.getSessionForUpdate(command.sessionId, client);
          const recoveredResponse = await this.findExistingResponse(command.sessionId, requestId);

          if (recoveredResponse) {
            return recoveredResponse;
          }

          const lockedProblemSection = await this.requireProblemSection(lockedSession.id, client);
          const lockedChat = await this.ensureSolutionChat(lockedSession, client);
          const lockedActiveTurn = this.getActiveTurn(lockedChat.turns, lockedChat.active_turn_id);

          this.assertStartDoesNotReopenCompletedChat(command, lockedChat.chat_status);

          if (command.trigger === 'start' && lockedActiveTurn) {
            throw new AppError(
              409,
              'solution_start_already_initialized',
              'The solution chat already has an open clarification turn',
              false,
              command.sessionId,
            );
          }

          if (command.trigger === 'reply' && (!lockedActiveTurn || lockedActiveTurn.turn_status !== 'processing')) {
            throw new AppError(
              409,
              'solution_reply_not_ready_for_agent',
              'The solution chat does not have a processing turn ready for the agent',
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
            runPurpose: 'solution_definition',
            agentName: 'solution_definition_agent',
            workflowName: 'agent_solution_definition_v1',
            workflowVersion: command.context.workflowVersion,
            workflowExecutionId: command.context.workflowExecutionId,
            promptName: modelTurn.prompt.name,
            promptVersion: modelTurn.prompt.version,
            promptSha256: modelTurn.prompt.hash,
            modelProvider: modelTurn.providerName,
            modelName: modelTurn.modelName,
            modelParamsJson: modelTurn.modelParams,
            inputContractName: 'solution-definition-agent.input',
            inputContractVersion: 'v1',
            outputContractName: 'solution-definition-turn',
            outputContractVersion: 'v1',
            inputPayloadJson: {
              structured_brief: lockedSession.latest_structured_brief_json,
              problem_section: {
                section_id: lockedProblemSection.section_id,
                title: lockedProblemSection.title,
                source_refs: lockedProblemSection.source_refs.map((source) => source.source_id),
              },
              recent_turns: recentTurns,
              latest_user_answer: lockedActiveTurn?.answer_text ?? null,
            },
            rawModelOutput: modelTurn.rawOutput,
            validatedOutputJson: guarded.turn as unknown as Record<string, unknown>,
            status: 'completed',
            repairAttempted: modelTurn.repairAttempted,
            metricsJson: modelTurn.metrics,
          });

          return this.persistSuccessfulTurn({
            client,
            session: lockedSession,
            chatId: lockedChat.chat_id,
            activeTurn: command.trigger === 'reply' ? lockedActiveTurn ?? null : null,
            existingTurns: lockedChat.turns,
            guardedTurn: guarded.turn,
            updatedSolutionDefinition: guarded.updatedSolutionDefinition,
            latestAnswerWasVague: guarded.latestAnswerWasVague,
            warnings: guarded.warnings,
            runId: run.id,
            requestId,
            problemSection: lockedProblemSection,
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
    command: RunSolutionDefinitionCommand,
    chatStatus: string,
  ): void {
    if (
      command.trigger === 'start' &&
      (chatStatus === 'completed' || chatStatus === 'ready_to_generate')
    ) {
      throw new AppError(
        409,
        'solution_start_already_completed',
        'The solution chat has already completed',
        false,
        command.sessionId,
      );
    }
  }

  private async ensureSolutionChat(session: SessionRecord, client?: PoolClient) {
    const existing = await this.alphaStore.findModuleChatByProposalAndModule(session.id, 'solution', client);

    if (existing) {
      return existing;
    }

    return this.alphaStore.createModuleChat(client ?? this.alphaStore.getDatabase(), {
      proposalId: session.id,
      module: 'solution',
      chatStatus: 'active',
      warnings: [],
    });
  }

  private async requireProblemSection(sessionId: string, client?: PoolClient): Promise<GeneratedSection> {
    const section = await this.alphaStore.findCurrentGeneratedSection(sessionId, 'problem', client);

    if (!section) {
      throw new AppError(
        409,
        'problem_section_required',
        'A generated problem section is required before starting solution definition',
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
    guardedTurn: SolutionDefinitionTurn;
    updatedSolutionDefinition: SolutionDefinitionState;
    latestAnswerWasVague: boolean;
    warnings: string[];
    runId: string;
    requestId: string;
    problemSection: GeneratedSection;
  }): Promise<SolutionDefinitionRunResponse> {
    await this.ensureSolutionGaps(params.client, params.session.id, params.updatedSolutionDefinition, params.requestId);
    const existingGaps = await this.alphaStore.listGaps(params.session.id, params.client);

    if (params.activeTurn) {
      await this.resolveAnsweredTurn({
        ...params,
        gaps: existingGaps,
      });
    }

    const updatedGaps = await this.alphaStore.listGaps(params.session.id, params.client);

    if (params.guardedTurn.agent_status === 'continue') {
      const openedTurn = await this.openSolutionQuestion({
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
      await this.generateSolutionSection(params);
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
      stage: 'solution_definition',
      agent_status: params.guardedTurn.agent_status,
      updated_solution_definition: params.updatedSolutionDefinition,
      diagnosis: params.guardedTurn.diagnosis,
      next_question: params.guardedTurn.next_question,
      completion_reason: params.guardedTurn.completion_reason,
      warnings: params.warnings,
      run_id: params.runId,
    };
  }

  private async ensureSolutionGaps(
    client: PoolClient,
    proposalId: string,
    solutionDefinition: SolutionDefinitionState,
    requestId: string,
  ): Promise<void> {
    const existingGaps = await this.alphaStore.listGaps(proposalId, client);
    const existingFields = new Set(existingGaps.filter((gap) => gap.module === 'solution').map((gap) => gap.field));

    for (const field of computeSolutionMissingInformation(solutionDefinition)) {
      if (existingFields.has(field)) {
        continue;
      }

      const gap = await this.alphaStore.createGap(client, {
        proposalId,
        module: 'solution',
        gapKind: field === 'target_user' ? 'needs_user_confirmation' : 'missing_information',
        gapStatus: 'open',
        origin: 'system_rule',
        field,
        description: `Solution definition needs clarification for ${field.replace(/_/g, ' ')}.`,
        absence: {
          is_absent: field !== 'target_user',
          checked_fields: [field],
          reason: 'Solution definition field is not sufficiently clear yet.',
        },
        questionHint: buildSolutionFallbackQuestion(solutionDefinition),
        sourceRefs: [],
        auditRefs: [],
        warnings: [],
      });

      await this.alphaStore.appendAuditEvent(client, {
        proposalId,
        sessionId: proposalId,
        eventType: 'gap_detected',
        actorType: 'system',
        requestId,
        payloadJson: {
          gap_id: gap.gap_id,
          module: 'solution',
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
    guardedTurn: SolutionDefinitionTurn;
    updatedSolutionDefinition: SolutionDefinitionState;
    latestAnswerWasVague: boolean;
    warnings: string[];
    runId: string;
    requestId: string;
    gaps: AlphaGap[];
  }): Promise<void> {
    if (!params.activeTurn?.answer_text) {
      throw new AppError(
        409,
        'solution_answer_missing',
        'The active solution turn has no user answer to resolve',
        false,
        params.session.id,
      );
    }

    const answerSource = await this.alphaStore.createSource(params.client, {
      proposalId: params.session.id,
      sourceKind: 'user_answer',
      label: `Solution answer turn ${params.activeTurn.turn_seq}`,
      turnId: params.activeTurn.turn_id,
      metadata: {
        request_id: params.requestId,
      },
    });

    const gapStatusChanges = !params.latestAnswerWasVague
      ? classifySolutionGapStatuses(params.gaps, params.updatedSolutionDefinition, params.activeTurn.turn_id)
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
      eventType: 'solution_answer_resolved',
      actorType: 'system',
      requestId: params.requestId,
      payloadJson: {
        source_id: answerSource.source_id,
        gap_refs: Array.from(resolvedGapRefSet),
      },
    });
  }

  private async openSolutionQuestion(params: {
    client: PoolClient;
    session: SessionRecord;
    chatId: string;
    guardedTurn: SolutionDefinitionTurn;
    updatedSolutionDefinition: SolutionDefinitionState;
    warnings: string[];
    runId: string;
    requestId: string;
    turnSeq: number;
    gaps: AlphaGap[];
  }): Promise<ChatTurn> {
    const gapRefs = selectSolutionGapRefs(params.gaps, params.updatedSolutionDefinition);
    const alphaTurn = await this.alphaStore.createChatTurn(params.client, {
      chatId: params.chatId,
      proposalId: params.session.id,
      module: 'solution',
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
      eventType: 'solution_question_opened',
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

  private async generateSolutionSection(params: {
    client: PoolClient;
    session: SessionRecord;
    updatedSolutionDefinition: SolutionDefinitionState;
    warnings: string[];
    runId: string;
    requestId: string;
    problemSection: GeneratedSection;
  }): Promise<void> {
    const sources = await this.alphaStore.listSources(params.session.id, params.client);
    const problemGeneratedSectionSources = sources.filter((source) =>
      source.source_kind === 'generated_section' && source.section_id === params.problemSection.section_id,
    );
    const sourceRefs = buildSolutionSectionSourceRefs(
      [
        ...sources.filter((source) =>
          source.source_kind === 'pasted_text' ||
          source.source_kind === 'uploaded_file' ||
          source.source_kind === 'extracted_text',
        ),
        ...problemGeneratedSectionSources,
      ],
      sources.filter((source) => source.source_kind === 'user_answer'),
      params.problemSection,
    );
    const gaps = await this.alphaStore.listGaps(params.session.id, params.client);
    const gapRefs = gaps
      .filter((gap) => gap.module === 'solution' && gap.gap_status === 'resolved')
      .map((gap) => gap.gap_id);
    const renderedSection = renderSolutionSection(params.updatedSolutionDefinition, {
      sourceCount: sourceRefs.length,
      gapCount: gapRefs.length,
    });
    const currentSection = await this.alphaStore.findCurrentGeneratedSection(
      params.session.id,
      'solution',
      params.client,
    );

    if (currentSection) {
      await this.alphaStore.supersedeGeneratedSection(params.client, {
        sectionId: currentSection.section_id,
      });
    }

    const section = await this.alphaStore.createGeneratedSection(params.client, {
      proposalId: params.session.id,
      sectionKind: 'solution',
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
      label: `Solution section v${section.section_version}`,
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
      eventType: 'solution_section_generated',
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
  ): Promise<SolutionDefinitionRunResponse | null> {
    if (!requestId) {
      return null;
    }

    const existingRun = await this.sessionStore.findAgentRunByRequestId(requestId, 'solution_definition');

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
  ): Promise<SolutionDefinitionRunResponse | null> {
    if (!requestId || !isUniqueViolation(error)) {
      return null;
    }

    return this.findExistingResponse(sessionId, requestId);
  }

  private toStoredAgentRunError(run: AgentRunRecord, sessionId: string): AppError {
    const statusCode = run.status === 'model_failed' ? 504 : 502;

    return new AppError(
      statusCode,
      run.error_code ?? 'solution_request_failed',
      run.error_message ?? 'The solution request failed while executing the workflow',
      run.status === 'model_failed',
      sessionId,
    );
  }

  private async buildResponseFromRun(sessionId: string, run: AgentRunRecord): Promise<SolutionDefinitionRunResponse> {
    const output = run.validated_output_json as unknown as SolutionDefinitionTurn;
    const warnings = await this.findPersistedWarningsForRun(sessionId, run.id);

    return {
      session_id: sessionId,
      stage: 'solution_definition',
      agent_status: output.agent_status,
      updated_solution_definition: output.updated_solution_definition,
      diagnosis: output.diagnosis,
      next_question: output.agent_status === 'continue' ? output.next_question : '',
      completion_reason: output.completion_reason,
      warnings,
      run_id: run.id,
    };
  }

  private async findPersistedWarningsForRun(sessionId: string, runId: string): Promise<string[]> {
    const chat = await this.alphaStore.findModuleChatByProposalAndModule(sessionId, 'solution');

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
    command: RunSolutionDefinitionCommand,
    session: SessionRecord,
    activeTurn: ChatTurn | null,
    error: AppError,
  ): Promise<void> {
    try {
      const prompt = await loadPrompt('solution-definition-agent');

      await this.sessionStore
        .getDatabase()
        .withTransaction(async (client) => {
          const lockedSession = await this.sessionStore.getSessionForUpdate(session.id, client);
          const run = await this.sessionStore.recordAgentRun(client, {
            sessionId: lockedSession.id,
            turnSeq: activeTurn?.turn_seq ?? 1,
            requestId: command.context.requestId,
            runPurpose: 'solution_definition',
            agentName: 'solution_definition_agent',
            workflowName: 'agent_solution_definition_v1',
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
            inputContractName: 'solution-definition-agent.input',
            inputContractVersion: 'v1',
            outputContractName: 'solution-definition-turn',
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

          const chat = await this.alphaStore.findModuleChatByProposalAndModule(lockedSession.id, 'solution', client);
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
            eventType: activeTurn ? 'solution_answer_failed' : 'solution_agent_failed',
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

    this.logger.error('solution_definition_failed', {
      request_id: command.context.requestId,
      session_id: command.sessionId,
      error_code: error.errorCode,
      schema: schemaIds.solutionDefinitionTurn,
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
