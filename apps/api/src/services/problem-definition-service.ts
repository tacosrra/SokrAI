import type { PoolClient } from 'pg';

import { schemaIds } from '../contracts/schema-registry';
import type {
  AlphaGap,
  ChatTurn,
  ProblemDefinitionState,
  ProblemDefinitionTurn,
  ProposalSource,
  ProposalReplyResponse,
  StructuredBrief,
} from '../contracts/types';
import type { AppConfig } from '../config/env';
import { collectRecentQuestionTexts } from '../domain/conversation-question';
import {
  buildProblemSectionSourceRefs,
  classifyProblemGapStatuses,
  enforceTurnGuardrails,
  evaluateCompletion,
  renderProblemSection,
  selectProblemGapRefs,
} from '../domain/problem-definition';
import type { AlphaStore } from '../repositories/alpha-store';
import type {
  AgentRunRecord,
  ConversationTurnRecord,
  SessionRecord,
  SessionStore,
} from '../repositories/session-store';
import { shouldRevertReplyFailureForUserRetry } from '../domain/session-retry';
import { AppError, ModelOutputError } from '../utils/errors';
import { sha256 } from '../utils/hash';
import type { Logger } from '../utils/logger';
import type { LlmOrchestrator } from './llm-orchestrator';
import type {
  AgentResponseState,
  ProblemDefinitionRunResponse,
  RunProblemDefinitionCommand,
} from './service-types';
import { loadPrompt } from './prompt-service';

export class ProblemDefinitionService {
  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
    private readonly sessionStore: SessionStore,
    private readonly alphaStore: AlphaStore,
    private readonly llmOrchestrator: LlmOrchestrator,
  ) {}

  async execute(command: RunProblemDefinitionCommand): Promise<ProblemDefinitionRunResponse> {
    const requestId = command.context.requestId;

    const existingResponse = await this.findExistingResponse(command.sessionId, requestId);

    if (existingResponse) {
      return existingResponse;
    }

    const session = await this.sessionStore.getSession(command.sessionId);
    const openTurn = await this.sessionStore.getOpenTurn(command.sessionId);

    if (command.trigger === 'reply' && (!openTurn || openTurn.status !== 'processing')) {
      throw new AppError(
        409,
        'reply_not_ready_for_agent',
        'The session does not have a processing turn ready for the agent',
        false,
        command.sessionId,
      );
    }

    if (command.trigger === 'start' && openTurn) {
      throw new AppError(
        409,
        'start_already_initialized',
        'The session already has an open clarification turn',
        false,
        command.sessionId,
      );
    }

    if (session.current_turn_seq >= this.config.maxTurnsPerSession && command.trigger === 'reply') {
      const error = new AppError(
        409,
        'maximum_turns_reached',
        'The maximum number of turns has already been reached',
        false,
        command.sessionId,
      );

      await this.persistFailure(command, session, openTurn, error);
      throw error;
    }

    const recentTurns = (
      await this.sessionStore.listRecentResolvedTurns(command.sessionId, 5)
    ).map((turn) => ({
      question_text: turn.question_text,
      answer_text: turn.answer_text,
      diagnosis: turn.diagnosis_json,
    }));

    const recentQuestions = collectRecentQuestionTexts({
      resolvedTurns: recentTurns,
      currentQuestionText: openTurn?.question_text,
    });

    try {
      const modelTurn = await this.llmOrchestrator.runProblemDefinition({
        structuredBrief: session.latest_structured_brief_json,
        recentTurns,
        latestAnswer: openTurn?.answer_text ?? undefined,
      });

      const guarded = this.prepareGuardedTurn(
        session.latest_structured_brief_json,
        modelTurn.output,
        openTurn?.answer_text ?? undefined,
        { isInitialRun: command.trigger === 'start', recentQuestions },
      );

      if (
        guarded.turn.agent_status !== 'done' &&
        command.trigger === 'reply' &&
        session.current_turn_seq >= this.config.maxTurnsPerSession
      ) {
        guarded.turn.agent_status = 'blocked';
        guarded.turn.next_question = '';
        guarded.turn.completion_reason = 'maximum turns reached';
        guarded.warnings.push('Maximum turn count reached; session blocked');
      }

      return this.sessionStore
        .getDatabase()
        .withTransaction(async (client) => {
          const lockedSession = await this.sessionStore.getSessionForUpdate(command.sessionId, client);
          const recoveredResponse = await this.findExistingResponse(command.sessionId, requestId);

          if (recoveredResponse) {
            return recoveredResponse;
          }

          const currentOpenTurn = await this.sessionStore.getOpenTurn(command.sessionId, client);
          const activeTurn = command.trigger === 'reply' ? currentOpenTurn : null;

          if (command.trigger === 'reply' && (!activeTurn || activeTurn.status !== 'processing')) {
            throw new AppError(
              409,
              'reply_not_ready_for_agent',
              'The session does not have a processing turn ready for the agent',
              false,
              command.sessionId,
            );
          }

          if (command.trigger === 'start' && currentOpenTurn) {
            throw new AppError(
              409,
              'start_already_initialized',
              'The session already has an open clarification turn',
              false,
              command.sessionId,
            );
          }

          const run = await this.sessionStore.recordAgentRun(client, {
            sessionId: lockedSession.id,
            turnSeq: command.trigger === 'reply' ? activeTurn?.turn_seq : lockedSession.current_turn_seq + 1,
            requestId,
            runPurpose: 'problem_definition',
            agentName: 'problem_definition_agent',
            workflowName: 'agent_problem_definition_v1',
            workflowVersion: command.context.workflowVersion,
            workflowExecutionId: command.context.workflowExecutionId,
            promptName: modelTurn.prompt.name,
            promptVersion: modelTurn.prompt.version,
            promptSha256: modelTurn.prompt.hash,
            modelProvider: modelTurn.providerName,
            modelName: modelTurn.modelName,
            modelParamsJson: modelTurn.modelParams,
            inputContractName: 'problem-definition-agent.input',
            inputContractVersion: 'v1',
            outputContractName: 'problem-definition-turn',
            outputContractVersion: 'v1',
            inputPayloadJson: {
              structured_brief: session.latest_structured_brief_json,
              recent_turns: recentTurns,
              latest_user_answer: openTurn?.answer_text ?? null,
            },
            rawModelOutput: modelTurn.rawOutput,
            validatedOutputJson: guarded.turn as unknown as Record<string, unknown>,
            status: 'completed',
            repairAttempted: modelTurn.repairAttempted,
            metricsJson: modelTurn.metrics,
          });

          await this.sessionStore.insertEvent(client, {
            sessionId: lockedSession.id,
            turnSeq: command.trigger === 'reply' ? activeTurn?.turn_seq : lockedSession.current_turn_seq + 1,
            runId: run.id,
            eventType: 'run_completed',
            actorType: 'agent',
            requestId,
            payloadJson: {
              run_purpose: 'problem_definition',
            },
          });

          return this.persistSuccessfulTurn({
            client,
            session: lockedSession,
            activeTurn,
            guardedTurn: guarded.turn,
            updatedBrief: guarded.updatedBrief,
            updatedProblemDefinition: guarded.updatedProblemDefinition,
            detectedGaps: guarded.detectedGaps,
            latestAnswerWasVague: guarded.latestAnswerWasVague,
            warnings: guarded.warnings,
            runId: run.id,
            requestId,
            trigger: command.trigger,
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
        await this.persistFailure(command, session, openTurn, error);
      }

      throw error;
    }
  }

  private prepareGuardedTurn(
    brief: StructuredBrief,
    turn: ProblemDefinitionTurn,
    latestAnswer?: string,
    options?: { isInitialRun?: boolean; recentQuestions?: string[] },
  ) {
    return enforceTurnGuardrails(brief, turn, latestAnswer, options);
  }

  private async findExistingResponse(
    sessionId: string,
    requestId?: string,
  ): Promise<ProblemDefinitionRunResponse | null> {
    if (!requestId) {
      return null;
    }

    const existingRun = await this.sessionStore.findAgentRunByRequestId(
      requestId,
      'problem_definition',
    );

    if (!existingRun) {
      return null;
    }

    if (!existingRun.validated_output_json) {
      if (existingRun.status !== 'completed') {
        throw this.toStoredAgentRunError(existingRun, sessionId);
      }

      return null;
    }

    const session = await this.sessionStore.getSession(sessionId);
    return this.buildResponseFromRun(session, existingRun);
  }

  private toStoredAgentRunError(run: AgentRunRecord, sessionId: string): AppError {
    const statusCode =
      run.error_code === 'maximum_turns_reached'
        ? 409
        : run.status === 'model_failed'
          ? 504
          : 502;

    return new AppError(
      statusCode,
      run.error_code ?? 'request_failed',
      run.error_message ?? 'The request failed while executing the workflow',
      run.status === 'model_failed',
      sessionId,
    );
  }

  private async recoverExistingResponseAfterConflict(
    sessionId: string,
    requestId: string,
    error: unknown,
  ): Promise<ProblemDefinitionRunResponse | null> {
    if (!requestId || !isUniqueViolation(error)) {
      return null;
    }

    return this.findExistingResponse(sessionId, requestId);
  }

  private async persistSuccessfulTurn(params: {
    client: PoolClient;
    session: SessionRecord;
    activeTurn: ConversationTurnRecord | null;
    guardedTurn: ProblemDefinitionTurn;
    updatedBrief: StructuredBrief;
    updatedProblemDefinition: ProblemDefinitionState;
    detectedGaps: string[];
    latestAnswerWasVague: boolean;
    warnings: string[];
    runId: string;
    requestId: string;
    trigger: 'start' | 'reply';
  }): Promise<ProblemDefinitionRunResponse> {
    const nextStateVersion = params.session.state_version + 1;
    const sessionStatus =
      params.guardedTurn.agent_status === 'done'
        ? 'completed'
        : params.guardedTurn.agent_status === 'blocked'
          ? 'blocked'
          : 'waiting_for_user';

    let currentTurnSeq = params.session.current_turn_seq;
    let openedTurn: ConversationTurnRecord | null = null;

    if (params.trigger === 'reply' && params.activeTurn) {
      await this.sessionStore.resolveTurn(params.client, {
        sessionId: params.session.id,
        turnSeq: params.activeTurn.turn_seq,
        diagnosis: params.guardedTurn.diagnosis,
        updatedProblemDefinition: params.updatedProblemDefinition,
        agentStatus: params.guardedTurn.agent_status,
        completionReason: params.guardedTurn.completion_reason,
      });
    }

    if (params.guardedTurn.agent_status === 'continue') {
      currentTurnSeq = params.trigger === 'start' ? params.session.current_turn_seq + 1 : (params.activeTurn?.turn_seq ?? params.session.current_turn_seq) + 1;

      openedTurn = await this.sessionStore.createOpenTurn(params.client, {
        sessionId: params.session.id,
        turnSeq: currentTurnSeq,
        questionText: params.guardedTurn.next_question,
      });

      await this.sessionStore.insertEvent(params.client, {
        sessionId: params.session.id,
        turnSeq: openedTurn.turn_seq,
        runId: params.runId,
        eventType: 'turn_opened',
        actorType: 'agent',
        requestId: params.requestId,
        payloadJson: {
          question_text: openedTurn.question_text,
        },
      });
    }

    await this.persistAlphaArtifacts({
      client: params.client,
      session: params.session,
      activeTurn: params.activeTurn,
      openedTurn,
      guardedTurn: params.guardedTurn,
      updatedProblemDefinition: params.updatedProblemDefinition,
      latestAnswerWasVague: params.latestAnswerWasVague,
      warnings: params.warnings,
      runId: params.runId,
      requestId: params.requestId,
      trigger: params.trigger,
    });

    const snapshot = await this.sessionStore.createSnapshot(params.client, {
      sessionId: params.session.id,
      stateVersion: nextStateVersion,
      basedOnSnapshotId: params.session.latest_snapshot_id ?? undefined,
      sourceTurnSeq: params.activeTurn?.turn_seq ?? currentTurnSeq,
      sourceRunId: params.runId,
      snapshotKind: params.trigger === 'start' ? 'turn_resolved' : 'turn_resolved',
      sessionStatus,
      structuredBrief: params.updatedBrief,
      currentProblemDefinition: params.updatedProblemDefinition,
      detectedGaps: params.detectedGaps,
      nextQuestionText: params.guardedTurn.next_question || undefined,
      agentStatus: params.guardedTurn.agent_status,
      completionReason: params.guardedTurn.completion_reason,
      warnings: params.warnings,
      snapshotHash: sha256(
        JSON.stringify({
          structured_brief: params.updatedBrief,
          updated_problem_definition: params.updatedProblemDefinition,
          detected_gaps: params.detectedGaps,
          next_question: params.guardedTurn.next_question,
          agent_status: params.guardedTurn.agent_status,
        }),
      ),
    });

    await this.sessionStore.insertEvent(params.client, {
      sessionId: params.session.id,
      turnSeq: params.activeTurn?.turn_seq ?? currentTurnSeq,
      runId: params.runId,
      eventType: 'snapshot_created',
      actorType: 'system',
      requestId: params.requestId,
      payloadJson: {
        snapshot_id: snapshot.id,
        snapshot_seq: snapshot.snapshot_seq,
      },
    });

    if (sessionStatus === 'completed') {
      await this.sessionStore.insertEvent(params.client, {
        sessionId: params.session.id,
        turnSeq: params.activeTurn?.turn_seq,
        runId: params.runId,
        eventType: 'session_completed',
        actorType: 'system',
        requestId: params.requestId,
      });
    }

    if (sessionStatus === 'blocked') {
      await this.sessionStore.insertEvent(params.client, {
        sessionId: params.session.id,
        turnSeq: params.activeTurn?.turn_seq,
        runId: params.runId,
        eventType: 'session_blocked',
        actorType: 'system',
        requestId: params.requestId,
      });
    }

    await this.sessionStore.updateSessionHead(params.client, {
      sessionId: params.session.id,
      status: sessionStatus,
      currentTurnSeq,
      stateVersion: nextStateVersion,
      latestStructuredBrief: params.updatedBrief,
      latestProblemDefinition: params.updatedProblemDefinition,
      latestSnapshotId: snapshot.id,
      latestSuccessfulRunId: params.runId,
      completionReason: params.guardedTurn.completion_reason,
    });

    return {
      session_id: params.session.id,
      stage: 'problem_definition',
      agent_status: params.guardedTurn.agent_status,
      updated_problem_definition: params.updatedProblemDefinition,
      diagnosis: params.guardedTurn.diagnosis,
      next_question: params.guardedTurn.next_question,
      completion_reason: params.guardedTurn.completion_reason,
      warnings: params.warnings,
      structured_brief: params.updatedBrief,
      detected_gaps: params.detectedGaps,
      run_id: params.runId,
      snapshot_id: snapshot.id,
    };
  }

  private async persistAlphaArtifacts(params: {
    client: PoolClient;
    session: SessionRecord;
    activeTurn: ConversationTurnRecord | null;
    openedTurn: ConversationTurnRecord | null;
    guardedTurn: ProblemDefinitionTurn;
    updatedProblemDefinition: ProblemDefinitionState;
    latestAnswerWasVague: boolean;
    warnings: string[];
    runId: string;
    requestId: string;
    trigger: 'start' | 'reply';
  }): Promise<void> {
    const chat = await this.alphaStore.findModuleChatByProposalAndModule(
      params.session.id,
      'problem',
      params.client,
    );

    if (!chat) {
      throw new AppError(
        409,
        'alpha_chat_state_conflict',
        'The Alpha problem chat is missing for this session',
        false,
        params.session.id,
      );
    }

    const existingGaps = await this.alphaStore.listGaps(params.session.id, params.client);

    if (params.trigger === 'start') {
      if (params.openedTurn) {
        await this.openAlphaQuestion({
          ...params,
          chatId: chat.chat_id,
          turnSeq: params.openedTurn.turn_seq,
          questionText: params.openedTurn.question_text,
          gaps: existingGaps,
          sourceRefs: [],
        });
        return;
      }

      await this.closeAlphaChatForTerminalTurn({
        ...params,
        chatId: chat.chat_id,
        gaps: existingGaps,
      });
      return;
    }

    if (!params.activeTurn) {
      throw new AppError(
        409,
        'alpha_chat_state_conflict',
        'The legacy problem turn is missing while updating Alpha chat state',
        false,
        params.session.id,
      );
    }

    const activeAlphaTurn = this.findActiveAlphaTurn(chat.turns, chat.active_turn_id, params.activeTurn.turn_seq);

    if (!activeAlphaTurn) {
      throw new AppError(
        409,
        'alpha_chat_state_conflict',
        'The Alpha problem chat active turn is missing or out of sync',
        false,
        params.session.id,
      );
    }

    if (!params.activeTurn.answer_text) {
      throw new AppError(
        409,
        'alpha_chat_state_conflict',
        'The legacy problem turn has no user answer to mirror into Alpha state',
        false,
        params.session.id,
      );
    }

    const answerSource = await this.alphaStore.createSource(params.client, {
      proposalId: params.session.id,
      sourceKind: 'user_answer',
      label: `Problem answer turn ${params.activeTurn.turn_seq}`,
      turnId: activeAlphaTurn.turn_id,
      metadata: {
        request_id: params.requestId,
        legacy_turn_seq: params.activeTurn.turn_seq,
      },
    });

    await this.alphaStore.updateChatTurnAnswer(params.client, {
      turnId: activeAlphaTurn.turn_id,
      answerText: params.activeTurn.answer_text,
    });

    const gapStatusChanges = !params.latestAnswerWasVague
      ? classifyProblemGapStatuses(
          existingGaps,
          params.updatedProblemDefinition,
          activeAlphaTurn.turn_id,
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

    const resolvedGapRefSet = new Set([...activeAlphaTurn.gap_refs, ...resolvedGapRefs]);
    const resolvedTurn = await this.alphaStore.resolveChatTurn(params.client, {
      turnId: activeAlphaTurn.turn_id,
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
      eventType: 'problem_answer_resolved',
      actorType: 'system',
      requestId: params.requestId,
      payloadJson: {
        legacy_turn_seq: params.activeTurn.turn_seq,
        source_id: answerSource.source_id,
        gap_refs: Array.from(resolvedGapRefSet),
      },
    });

    const updatedGaps = await this.alphaStore.listGaps(params.session.id, params.client);

    if (params.openedTurn) {
      await this.openAlphaQuestion({
        ...params,
        chatId: chat.chat_id,
        turnSeq: params.openedTurn.turn_seq,
        questionText: params.openedTurn.question_text,
        gaps: updatedGaps,
        sourceRefs: [answerSource],
      });
      return;
    }

    await this.closeAlphaChatForTerminalTurn({
      ...params,
      chatId: chat.chat_id,
      gaps: updatedGaps,
    });
  }

  private async openAlphaQuestion(params: {
    client: PoolClient;
    session: SessionRecord;
    guardedTurn: ProblemDefinitionTurn;
    updatedProblemDefinition: ProblemDefinitionState;
    warnings: string[];
    runId: string;
    requestId: string;
    chatId: string;
    turnSeq: number;
    questionText: string;
    gaps: AlphaGap[];
    sourceRefs: ProposalSource[];
  }): Promise<ChatTurn> {
    const gapRefs = selectProblemGapRefs(params.gaps, params.updatedProblemDefinition);
    const alphaTurn = await this.alphaStore.createChatTurn(params.client, {
      chatId: params.chatId,
      proposalId: params.session.id,
      module: 'problem',
      turnSeq: params.turnSeq,
      questionText: params.questionText,
      turnStatus: 'awaiting_user',
      agentStatus: 'continue',
      diagnosis: params.guardedTurn.diagnosis,
      sourceRefs: params.sourceRefs,
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

    await this.alphaStore.updateModuleChatStatus(params.client, {
      chatId: params.chatId,
      chatStatus: 'waiting_for_user',
      activeTurnId: alphaTurn.turn_id,
    });

    await this.alphaStore.appendAuditEvent(params.client, {
      proposalId: params.session.id,
      sessionId: params.session.id,
      runId: params.runId,
      turnId: alphaTurn.turn_id,
      eventType: 'problem_question_opened',
      actorType: 'agent',
      requestId: params.requestId,
      payloadJson: {
        legacy_turn_seq: params.turnSeq,
        question_text: params.questionText,
        gap_refs: gapRefs,
      },
    });

    return alphaTurn;
  }

  private async closeAlphaChatForTerminalTurn(params: {
    client: PoolClient;
    session: SessionRecord;
    guardedTurn: ProblemDefinitionTurn;
    updatedProblemDefinition: ProblemDefinitionState;
    warnings: string[];
    runId: string;
    requestId: string;
    chatId: string;
    gaps: AlphaGap[];
  }): Promise<void> {
    if (params.guardedTurn.agent_status === 'done') {
      await this.alphaStore.updateModuleChatStatus(params.client, {
        chatId: params.chatId,
        chatStatus: 'ready_to_generate',
        activeTurnId: null,
      });

      await this.generateProblemSection(params);

      await this.alphaStore.updateModuleChatStatus(params.client, {
        chatId: params.chatId,
        chatStatus: 'completed',
        activeTurnId: null,
      });
      return;
    }

    if (params.guardedTurn.agent_status === 'blocked') {
      await this.alphaStore.deferActiveGapsForModule(params.client, {
        proposalId: params.session.id,
        module: 'problem',
      });

      await this.alphaStore.updateModuleChatStatus(params.client, {
        chatId: params.chatId,
        chatStatus: 'blocked',
        activeTurnId: null,
      });
    }
  }

  private async generateProblemSection(params: {
    client: PoolClient;
    session: SessionRecord;
    updatedProblemDefinition: ProblemDefinitionState;
    warnings: string[];
    runId: string;
    requestId: string;
  }): Promise<void> {
    const sources = await this.alphaStore.listSources(params.session.id, params.client);
    const sourceRefs = buildProblemSectionSourceRefs(
      sources.filter((source) =>
        source.source_kind === 'pasted_text' ||
        source.source_kind === 'uploaded_file' ||
        source.source_kind === 'extracted_text',
      ),
      sources.filter((source) => source.source_kind === 'user_answer'),
    );
    const gaps = await this.alphaStore.listGaps(params.session.id, params.client);
    const gapRefs = gaps
      .filter((gap) => gap.module === 'problem' && gap.gap_status === 'resolved')
      .map((gap) => gap.gap_id);
    const renderedSection = renderProblemSection(params.updatedProblemDefinition, {
      sourceCount: sourceRefs.length,
      gapCount: gapRefs.length,
    });
    const currentSection = await this.alphaStore.findCurrentGeneratedSection(
      params.session.id,
      'problem',
      params.client,
    );

    if (currentSection) {
      await this.alphaStore.supersedeGeneratedSection(params.client, {
        sectionId: currentSection.section_id,
      });
    }

    const section = await this.alphaStore.createGeneratedSection(params.client, {
      proposalId: params.session.id,
      sectionKind: 'problem',
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
      label: `Problem section v${section.section_version}`,
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
      eventType: 'problem_section_generated',
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

  private findActiveAlphaTurn(
    turns: ChatTurn[],
    activeTurnId: string | undefined,
    legacyTurnSeq: number,
  ): ChatTurn | null {
    return turns.find((turn) => turn.turn_id === activeTurnId) ??
      turns.find((turn) => turn.turn_seq === legacyTurnSeq && turn.turn_status !== 'resolved') ??
      null;
  }

  private async persistFailure(
    command: RunProblemDefinitionCommand,
    session: SessionRecord,
    openTurn: ConversationTurnRecord | null,
    error: AppError,
  ): Promise<void> {
    try {
      const prompt = await loadPrompt('problem-definition-agent');

      await this.sessionStore
        .getDatabase()
        .withTransaction(async (client) => {
          const lockedSession = await this.sessionStore.getSessionForUpdate(session.id, client);
          const run = await this.sessionStore.recordAgentRun(client, {
            sessionId: lockedSession.id,
            turnSeq: openTurn?.turn_seq ?? lockedSession.current_turn_seq + 1,
            requestId: command.context.requestId,
            runPurpose: 'problem_definition',
            agentName: 'problem_definition_agent',
            workflowName: 'agent_problem_definition_v1',
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
            inputContractName: 'problem-definition-agent.input',
            inputContractVersion: 'v1',
            outputContractName: 'problem-definition-turn',
            outputContractVersion: 'v1',
            inputPayloadJson: {
              session_id: lockedSession.id,
              trigger: command.trigger,
              current_turn_seq: lockedSession.current_turn_seq,
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

          await this.sessionStore.insertEvent(client, {
            sessionId: lockedSession.id,
            turnSeq: openTurn?.turn_seq,
            runId: run.id,
            eventType: 'run_failed',
            actorType: 'agent',
            requestId: command.context.requestId,
            payloadJson: {
              error_code: error.errorCode,
            },
          });

          if (command.trigger === 'reply' && openTurn?.status === 'processing') {
            if (shouldRevertReplyFailureForUserRetry(command.trigger, error)) {
              const revertedTurn = await this.sessionStore.revertTurnForUserRetry(client, {
                sessionId: lockedSession.id,
                turnSeq: openTurn.turn_seq,
              });

              if (!revertedTurn) {
                return;
              }

              await this.revertAlphaProblemTurnForRetry(client, {
                session: lockedSession,
                legacyTurn: openTurn,
                runId: run.id,
                requestId: command.context.requestId,
                reason: error.safeMessage,
                errorCode: error.errorCode,
              });

              await this.sessionStore.updateSessionHead(client, {
                sessionId: lockedSession.id,
                status: 'waiting_for_user',
                currentTurnSeq: lockedSession.current_turn_seq,
                stateVersion: lockedSession.state_version,
                latestStructuredBrief: lockedSession.latest_structured_brief_json,
                latestProblemDefinition: lockedSession.latest_problem_definition_json,
                latestSnapshotId: lockedSession.latest_snapshot_id ?? undefined,
                latestSuccessfulRunId: lockedSession.latest_successful_run_id ?? undefined,
                completionReason: lockedSession.completion_reason ?? undefined,
              });
            } else {
              await this.sessionStore.markTurnFailed(client, {
                sessionId: lockedSession.id,
                turnSeq: openTurn.turn_seq,
                completionReason: error.safeMessage,
              });

              await this.failAlphaProblemTurn(client, {
                session: lockedSession,
                legacyTurn: openTurn,
                runId: run.id,
                requestId: command.context.requestId,
                reason: error.safeMessage,
                errorCode: error.errorCode,
              });

              await this.sessionStore.insertEvent(client, {
                sessionId: lockedSession.id,
                turnSeq: openTurn?.turn_seq,
                runId: run.id,
                eventType: 'session_blocked',
                actorType: 'system',
                requestId: command.context.requestId,
              });

              await this.sessionStore.updateSessionHead(client, {
                sessionId: lockedSession.id,
                status: 'blocked',
                currentTurnSeq: lockedSession.current_turn_seq,
                stateVersion: lockedSession.state_version,
                latestStructuredBrief: lockedSession.latest_structured_brief_json,
                latestProblemDefinition: lockedSession.latest_problem_definition_json,
                latestSnapshotId: lockedSession.latest_snapshot_id ?? undefined,
                latestSuccessfulRunId: lockedSession.latest_successful_run_id ?? undefined,
                completionReason: lockedSession.completion_reason ?? undefined,
              });
            }
          } else if (command.trigger === 'start') {
            await this.sessionStore.insertEvent(client, {
              sessionId: lockedSession.id,
              turnSeq: openTurn?.turn_seq,
              runId: run.id,
              eventType: 'session_blocked',
              actorType: 'system',
              requestId: command.context.requestId,
            });

            await this.sessionStore.updateSessionHead(client, {
              sessionId: lockedSession.id,
              status: 'blocked',
              currentTurnSeq: lockedSession.current_turn_seq,
              stateVersion: lockedSession.state_version,
              latestStructuredBrief: lockedSession.latest_structured_brief_json,
              latestProblemDefinition: lockedSession.latest_problem_definition_json,
              latestSnapshotId: lockedSession.latest_snapshot_id ?? undefined,
              latestSuccessfulRunId: lockedSession.latest_successful_run_id ?? undefined,
              completionReason: lockedSession.completion_reason ?? undefined,
            });
          }
        });
    } catch (persistError) {
      if (!isUniqueViolationForConstraint(persistError, 'uq_agent_runs_request_purpose')) {
        throw persistError;
      }
    }

    this.logger.error('problem_definition_failed', {
      request_id: command.context.requestId,
      session_id: command.sessionId,
      error_code: error.errorCode,
      schema: schemaIds.problemDefinitionTurn,
    });
  }

  private async revertAlphaProblemTurnForRetry(
    client: PoolClient,
    params: {
      session: SessionRecord;
      legacyTurn: ConversationTurnRecord;
      runId: string;
      requestId: string;
      reason: string;
      errorCode: string;
    },
  ): Promise<void> {
    const chat = await this.alphaStore.findModuleChatByProposalAndModule(
      params.session.id,
      'problem',
      client,
    );

    if (!chat) {
      return;
    }

    const alphaTurn =
      this.findActiveAlphaTurn(chat.turns, chat.active_turn_id, params.legacyTurn.turn_seq) ??
      chat.turns.find(
        (turn) =>
          turn.turn_seq === params.legacyTurn.turn_seq &&
          (turn.turn_status === 'failed' || turn.turn_status === 'processing'),
      ) ??
      null;

    if (!alphaTurn) {
      return;
    }

    const revertedTurn = await this.alphaStore.revertChatTurnForUserRetry(client, {
      turnId: alphaTurn.turn_id,
    });

    if (!revertedTurn) {
      return;
    }

    await this.alphaStore.updateModuleChatStatus(client, {
      chatId: chat.chat_id,
      chatStatus: 'waiting_for_user',
      activeTurnId: revertedTurn.turn_id,
    });

    await this.alphaStore.appendAuditEvent(client, {
      proposalId: params.session.id,
      sessionId: params.session.id,
      runId: params.runId,
      turnId: revertedTurn.turn_id,
      eventType: 'problem_answer_retry_opened',
      actorType: 'system',
      requestId: params.requestId,
      payloadJson: {
        error_code: params.errorCode,
        reason: params.reason,
        turn_seq: revertedTurn.turn_seq,
      },
    });
  }

  private async failAlphaProblemTurn(
    client: PoolClient,
    params: {
      session: SessionRecord;
      legacyTurn: ConversationTurnRecord;
      runId: string;
      requestId: string;
      reason: string;
      errorCode: string;
    },
  ): Promise<void> {
    const chat = await this.alphaStore.findModuleChatByProposalAndModule(
      params.session.id,
      'problem',
      client,
    );

    if (!chat) {
      return;
    }

    const activeAlphaTurn = this.findActiveAlphaTurn(
      chat.turns,
      chat.active_turn_id,
      params.legacyTurn.turn_seq,
    );

    if (!activeAlphaTurn) {
      await this.alphaStore.deferActiveGapsForModule(client, {
        proposalId: params.session.id,
        module: 'problem',
      });

      await this.alphaStore.updateModuleChatStatus(client, {
        chatId: chat.chat_id,
        chatStatus: 'failed',
        activeTurnId: null,
      });
      return;
    }

    const sourceRefs: ProposalSource[] = [...activeAlphaTurn.source_refs];

    if (params.legacyTurn.answer_text) {
      const answerSource = await this.alphaStore.createSource(client, {
        proposalId: params.session.id,
        sourceKind: 'user_answer',
        label: `Problem answer turn ${params.legacyTurn.turn_seq}`,
        turnId: activeAlphaTurn.turn_id,
        metadata: {
          request_id: params.requestId,
          legacy_turn_seq: params.legacyTurn.turn_seq,
          failure: true,
        },
      });

      sourceRefs.push(answerSource);

      if (activeAlphaTurn.turn_status === 'awaiting_user') {
        await this.alphaStore.updateChatTurnAnswer(client, {
          turnId: activeAlphaTurn.turn_id,
          answerText: params.legacyTurn.answer_text,
        });
      }
    }

    const failedTurn = await this.alphaStore.resolveChatTurn(client, {
      turnId: activeAlphaTurn.turn_id,
      turnStatus: 'failed',
      agentStatus: 'blocked',
      diagnosis: activeAlphaTurn.diagnosis,
      sourceRefs,
      gapRefs: activeAlphaTurn.gap_refs,
      auditRefs: [{ kind: 'agent_run', id: params.runId }],
      warnings: [params.reason],
    });

    await this.alphaStore.updateModuleChatStatus(client, {
      chatId: chat.chat_id,
      chatStatus: 'failed',
      activeTurnId: null,
    });

    await this.alphaStore.deferActiveGapsForModule(client, {
      proposalId: params.session.id,
      module: 'problem',
    });

    await this.alphaStore.appendAuditEvent(client, {
      proposalId: params.session.id,
      sessionId: params.session.id,
      runId: params.runId,
      turnId: failedTurn.turn_id,
      eventType: 'problem_answer_failed',
      actorType: 'system',
      requestId: params.requestId,
      payloadJson: {
        legacy_turn_seq: params.legacyTurn.turn_seq,
        error_code: params.errorCode,
        reason: params.reason,
        source_refs: sourceRefs.map((source) => source.source_id),
        gap_refs: failedTurn.gap_refs,
      },
    });
  }

  private buildResponseFromRun(session: SessionRecord, run: AgentRunRecord): ProblemDefinitionRunResponse {
    const output = run.validated_output_json as unknown as ProblemDefinitionTurn;
    const openTurnQuestion = output.agent_status === 'continue' ? output.next_question : '';
    const state = this.buildAgentState(session, output, []);

    return {
      ...state.response,
      structured_brief: state.structuredBrief,
      detected_gaps: state.detectedGaps,
      run_id: run.id,
      snapshot_id: session.latest_snapshot_id ?? '',
      next_question: openTurnQuestion,
    };
  }

  private buildAgentState(
    session: SessionRecord,
    output: ProblemDefinitionTurn,
    warnings: string[],
  ): AgentResponseState {
    const updatedProblemDefinition = output.updated_problem_definition;
    const structuredBrief = session.latest_structured_brief_json;
    const detectedGaps = Array.from(
      new Set([...structuredBrief.ambiguities, ...structuredBrief.missing_information]),
    );
    const response: ProposalReplyResponse = {
      session_id: session.id,
      stage: 'problem_definition',
      agent_status: output.agent_status,
      updated_problem_definition: updatedProblemDefinition,
      diagnosis: output.diagnosis,
      next_question: output.next_question,
      completion_reason: output.completion_reason,
      warnings,
    };

    return {
      structuredBrief,
      updatedProblemDefinition,
      detectedGaps,
      response,
    };
  }
}

function isUniqueViolationForConstraint(error: unknown, constraintName: string): error is { code: string; constraint: string } {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    'constraint' in error &&
    (error as { code?: unknown }).code === '23505' &&
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
