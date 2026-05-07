import type { PoolClient } from 'pg';

import { schemaIds } from '../contracts/schema-registry';
import type {
  ProblemDefinitionState,
  ProblemDefinitionTurn,
  ProposalReplyResponse,
  StructuredBrief,
} from '../contracts/types';
import type { AppConfig } from '../config/env';
import { enforceTurnGuardrails, evaluateCompletion } from '../domain/problem-definition';
import type { RagModule } from '../rag';
import type {
  AgentRunRecord,
  ConversationTurnRecord,
  SessionRecord,
  SessionStore,
} from '../repositories/session-store';
import { AppError, ModelOutputError } from '../utils/errors';
import { sha256 } from '../utils/hash';
import type { Logger } from '../utils/logger';
import type { LlmOrchestrator } from './llm-orchestrator';
import type {
  AgentResponseState,
  ProblemDefinitionRunResponse,
  RunProblemDefinitionCommand,
} from './service-types';

export class ProblemDefinitionService {
  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
    private readonly sessionStore: SessionStore,
    private readonly llmOrchestrator: LlmOrchestrator,
    private readonly rag?: Pick<RagModule, 'retrieval' | 'buildSourcesBlock'>,
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
      throw new AppError(
        409,
        'maximum_turns_reached',
        'The maximum number of turns has already been reached',
        false,
        command.sessionId,
      );
    }

    const recentTurns = (
      await this.sessionStore.listRecentResolvedTurns(command.sessionId, 5, undefined, session.context_reset_at)
    ).map((turn) => ({
      question_text: turn.question_text,
      answer_text: turn.answer_text,
      diagnosis: turn.diagnosis_json,
    }));

    const effectiveSpecialty = session.current_specialty ?? session.specialty ?? undefined;

    let retrievalContext: string | undefined;
    if (effectiveSpecialty === 'legal' && this.rag) {
      try {
        const ragResult = await this.rag.retrieval.retrieve({
          requester: 'problem_definition_agent_legal',
          requesterRef: command.sessionId,
          query: openTurn?.answer_text ?? session.latest_structured_brief_json.problem_statement,
          packs: ['legal'],
          topK: 5,
        });
        retrievalContext = this.rag.buildSourcesBlock(ragResult.chunks);
      } catch (ragError) {
        this.logger.warn('legal_retrieval_failed', {
          session_id: command.sessionId,
          error_message: ragError instanceof Error ? ragError.message : 'unknown',
        });
      }
    }

    try {
      const modelTurn = await this.llmOrchestrator.runProblemDefinition({
        structuredBrief: session.latest_structured_brief_json,
        recentTurns,
        latestAnswer: openTurn?.answer_text ?? undefined,
        specialty: effectiveSpecialty,
        retrievalContext,
      });

      const guarded = this.prepareGuardedTurn(session.latest_structured_brief_json, modelTurn.output, openTurn?.answer_text ?? undefined, effectiveSpecialty);

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

          const run = await this.sessionStore.insertAgentRun(client, {
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
            modelName: modelTurn.modelName,
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
            specialty: effectiveSpecialty,
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
            warnings: guarded.warnings,
            runId: run.id,
            requestId,
            trigger: command.trigger,
            specialty: effectiveSpecialty,
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
    specialty?: 'default' | 'legal',
  ) {
    return enforceTurnGuardrails(brief, turn, latestAnswer, specialty);
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

    if (!existingRun?.validated_output_json) {
      return null;
    }

    const session = await this.sessionStore.getSession(sessionId);
    return this.buildResponseFromRun(session, existingRun);
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
    warnings: string[];
    runId: string;
    requestId: string;
    trigger: 'start' | 'reply';
    specialty?: 'default' | 'legal';
  }): Promise<ProblemDefinitionRunResponse> {
    const nextStateVersion = params.session.state_version + 1;
    const sessionStatus =
      params.guardedTurn.agent_status === 'done'
        ? 'completed'
        : params.guardedTurn.agent_status === 'blocked'
          ? 'blocked'
          : 'waiting_for_user';

    let currentTurnSeq = params.session.current_turn_seq;

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

      const openTurn = await this.sessionStore.createOpenTurn(params.client, {
        sessionId: params.session.id,
        turnSeq: currentTurnSeq,
        questionText: params.guardedTurn.next_question,
      });

      await this.sessionStore.insertEvent(params.client, {
        sessionId: params.session.id,
        turnSeq: openTurn.turn_seq,
        runId: params.runId,
        eventType: 'turn_opened',
        actorType: 'agent',
        requestId: params.requestId,
        payloadJson: {
          question_text: openTurn.question_text,
        },
      });
    }

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
      specialty: params.specialty,
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

  private async persistFailure(
    command: RunProblemDefinitionCommand,
    session: SessionRecord,
    openTurn: ConversationTurnRecord | null,
    error: AppError,
  ): Promise<void> {
    try {
      await this.sessionStore
        .getDatabase()
        .withTransaction(async (client) => {
          const lockedSession = await this.sessionStore.getSessionForUpdate(session.id, client);
          const run = await this.sessionStore.insertAgentRun(client, {
            sessionId: lockedSession.id,
            turnSeq: openTurn?.turn_seq ?? lockedSession.current_turn_seq + 1,
            requestId: command.context.requestId,
            runPurpose: 'problem_definition',
            agentName: 'problem_definition_agent',
            workflowName: 'agent_problem_definition_v1',
            workflowVersion: command.context.workflowVersion,
            workflowExecutionId: command.context.workflowExecutionId,
            promptName: 'problem-definition-agent',
            promptVersion: 'v1',
            promptSha256: '',
            modelName: this.config.ollamaModel,
            inputContractName: 'problem-definition-agent.input',
            inputContractVersion: 'v1',
            outputContractName: 'problem-definition-turn',
            outputContractVersion: 'v1',
            inputPayloadJson: {
              session_id: lockedSession.id,
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
        });
    } catch (persistError) {
      if (!isUniqueViolation(persistError)) {
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

function isUniqueViolation(error: unknown): error is { code: string } {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505',
  );
}
