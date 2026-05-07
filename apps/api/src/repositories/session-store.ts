import type { PoolClient, QueryResult, QueryResultRow } from 'pg';

import type { ProblemDefinitionState, StructuredBrief } from '../contracts/types';
import { AppError } from '../utils/errors';
import type { Database, SqlExecutor } from './database';

export interface SessionRecord {
  id: string;
  start_request_id: string | null;
  user_id: string | null;
  project_title: string;
  goal: string;
  raw_input_text: string | null;
  raw_input_file_name: string | null;
  raw_input_file_sha256: string | null;
  normalized_text: string;
  metadata_json: Record<string, unknown>;
  current_stage: 'problem_definition';
  current_agent: 'problem_definition_agent';
  status: 'active' | 'waiting_for_user' | 'completed' | 'blocked' | 'failed';
  current_turn_seq: number;
  state_version: number;
  latest_structured_brief_json: StructuredBrief;
  latest_problem_definition_json: ProblemDefinitionState | Record<string, never>;
  latest_snapshot_id: string | null;
  latest_successful_run_id: string | null;
  completion_reason: string | null;
  specialty: 'default' | 'legal' | null;
  current_specialty: 'default' | 'legal' | null;
  context_reset_at: string | null;
}

export interface ConversationTurnRecord {
  id: string;
  session_id: string;
  turn_seq: number;
  question_text: string;
  answer_text: string | null;
  answer_request_id: string | null;
  status: 'awaiting_user' | 'processing' | 'resolved' | 'failed';
  agent_status: 'continue' | 'done' | 'blocked' | null;
  diagnosis_json: string[];
  updated_problem_definition_json: ProblemDefinitionState | null;
  completion_reason: string | null;
  created_at: string;
}

export interface AgentRunRecord {
  id: string;
  session_id: string;
  turn_seq: number | null;
  request_id: string | null;
  run_purpose: 'brief_extraction' | 'problem_definition' | 'json_repair';
  agent_name: string;
  prompt_name: string;
  prompt_version: string;
  prompt_sha256: string;
  model_name: string;
  raw_model_output: string | null;
  validated_output_json: Record<string, unknown> | null;
  status: 'completed' | 'validation_failed' | 'repair_failed' | 'model_failed' | 'controlled_error';
  error_code?: string | null;
  error_message?: string | null;
  specialty: 'default' | 'legal' | null;
}

export interface SnapshotRecord {
  id: string;
  session_id: string;
  snapshot_seq: number;
  state_version: number;
  source_turn_seq: number | null;
  source_run_id: string | null;
  structured_brief_json: StructuredBrief;
  current_problem_definition_json: ProblemDefinitionState | Record<string, never>;
  detected_gaps_json: string[];
  next_question_text: string | null;
  agent_status: 'continue' | 'done' | 'blocked';
  completion_reason: string | null;
  warnings_json: string[];
  specialty: 'default' | 'legal' | null;
}

export interface RequestExecutionLookup {
  request_id: string;
  request_kind: 'proposal_start' | 'proposal_reply' | 'unknown';
  status: 'pending' | 'completed' | 'failed' | 'not_found';
  session_id?: string;
  error_code?: string;
  safe_message?: string;
  retryable?: boolean;
}

interface AgentRunStatusLookup {
  session_id: string;
  status: AgentRunRecord['status'];
  error_code: string | null;
  error_message: string | null;
}

export class SessionStore {
  constructor(private readonly database: Database) {}

  getDatabase(): Database {
    return this.database;
  }

  async findSessionByStartRequestId(requestId: string): Promise<SessionRecord | null> {
    const result = await this.database.query<SessionRecord>(
      'SELECT * FROM proposal_sessions WHERE start_request_id = $1 LIMIT 1',
      [requestId],
    );

    return result.rows[0] ?? null;
  }

  async findTurnByAnswerRequestId(requestId: string): Promise<ConversationTurnRecord | null> {
    const result = await this.database.query<ConversationTurnRecord>(
      'SELECT * FROM conversation_turns WHERE answer_request_id = $1 LIMIT 1',
      [requestId],
    );

    return result.rows[0] ?? null;
  }

  async findAgentRunByRequestId(
    requestId: string,
    runPurpose?: AgentRunRecord['run_purpose'],
  ): Promise<AgentRunRecord | null> {
    const result = await this.database.query<AgentRunRecord>(
      runPurpose
        ? 'SELECT * FROM agent_runs WHERE request_id = $1 AND run_purpose = $2 LIMIT 1'
        : 'SELECT * FROM agent_runs WHERE request_id = $1 LIMIT 1',
      runPurpose ? [requestId, runPurpose] : [requestId],
    );

    return result.rows[0] ?? null;
  }

  async getSession(sessionId: string, executor?: SqlExecutor): Promise<SessionRecord> {
    const queryable = executor ?? this.database;
    const result = await runQuery<SessionRecord>(
      queryable,
      'SELECT * FROM proposal_sessions WHERE id = $1 LIMIT 1',
      [sessionId],
    );

    const session = result.rows[0];

    if (!session) {
      throw new AppError(404, 'session_not_found', 'The requested session does not exist', false, sessionId);
    }

    return session;
  }

  async getSessionForUpdate(sessionId: string, client: PoolClient): Promise<SessionRecord> {
    const result = await client.query<SessionRecord>(
      'SELECT * FROM proposal_sessions WHERE id = $1 LIMIT 1 FOR UPDATE',
      [sessionId],
    );

    const session = result.rows[0];

    if (!session) {
      throw new AppError(404, 'session_not_found', 'The requested session does not exist', false, sessionId);
    }

    return session;
  }

  async getOpenTurn(sessionId: string, executor?: SqlExecutor): Promise<ConversationTurnRecord | null> {
    const queryable = executor ?? this.database;
    const result = await runQuery<ConversationTurnRecord>(
      queryable,
      [
        'SELECT *',
        'FROM conversation_turns',
        'WHERE session_id = $1 AND status IN (\'awaiting_user\', \'processing\')',
        'ORDER BY turn_seq DESC',
        'LIMIT 1',
      ].join(' '),
      [sessionId],
    );

    return result.rows[0] ?? null;
  }

  async listRecentResolvedTurns(
    sessionId: string,
    limit: number,
    executor?: SqlExecutor,
    contextResetAt?: string | null,
  ): Promise<ConversationTurnRecord[]> {
    const queryable = executor ?? this.database;
    const result = await runQuery<ConversationTurnRecord>(
      queryable,
      [
        'SELECT *',
        'FROM conversation_turns',
        'WHERE session_id = $1 AND status = \'resolved\'',
        'AND ($3::timestamptz IS NULL OR created_at > $3)',
        'ORDER BY turn_seq DESC',
        'LIMIT $2',
      ].join(' '),
      [sessionId, limit, contextResetAt ?? null],
    );

    return result.rows;
  }

  async createSession(
    client: PoolClient,
    params: {
      startRequestId?: string;
      userId?: string;
      projectTitle: string;
      goal: string;
      rawInputText: string;
      rawInputFileName?: string;
      rawInputFileSha256?: string;
      normalizedText: string;
      metadata: Record<string, unknown>;
      structuredBrief: StructuredBrief;
      initialProblemDefinition: ProblemDefinitionState | Record<string, never>;
      specialty?: 'default' | 'legal';
    },
  ): Promise<SessionRecord> {
    const result = await client.query<SessionRecord>(
      [
        'INSERT INTO proposal_sessions (',
        '  start_request_id, user_id, project_title, goal, raw_input_text, raw_input_file_name,',
        '  raw_input_file_sha256, normalized_text, metadata_json, status,',
        '  latest_structured_brief_json, latest_problem_definition_json,',
        '  specialty, current_specialty',
        ') VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)',
        'RETURNING *',
      ].join(' '),
      [
        params.startRequestId ?? null,
        params.userId ?? null,
        params.projectTitle,
        params.goal,
        params.rawInputText,
        params.rawInputFileName ?? null,
        params.rawInputFileSha256 ?? null,
        params.normalizedText,
        toJson(params.metadata),
        'active',
        toJson(params.structuredBrief),
        toJson(params.initialProblemDefinition),
        params.specialty ?? null,
        params.specialty ?? null,
      ],
    );

    return result.rows[0];
  }

  async insertAgentRun(
    client: PoolClient,
    params: {
      sessionId: string;
      turnSeq?: number;
      parentRunId?: string;
      requestId?: string;
      runPurpose: 'brief_extraction' | 'problem_definition' | 'json_repair';
      agentName: string;
      workflowName: string;
      workflowVersion: string;
      workflowExecutionId?: string;
      attemptNo?: number;
      promptName: string;
      promptVersion: string;
      promptSha256: string;
      modelName: string;
      inputContractName: string;
      inputContractVersion: string;
      outputContractName: string;
      outputContractVersion: string;
      inputPayloadJson: Record<string, unknown>;
      rawModelOutput?: string;
      validatedOutputJson?: Record<string, unknown>;
      status: 'completed' | 'validation_failed' | 'repair_failed' | 'model_failed' | 'controlled_error';
      errorCode?: string;
      errorMessage?: string;
      repairAttempted?: boolean;
      metricsJson?: Record<string, unknown>;
      specialty?: 'default' | 'legal';
    },
  ): Promise<AgentRunRecord> {
    const result = await client.query<AgentRunRecord>(
      [
        'INSERT INTO agent_runs (',
        '  session_id, turn_seq, parent_run_id, request_id, run_purpose, agent_name, workflow_name, workflow_version,',
        '  workflow_execution_id, attempt_no, prompt_name, prompt_version, prompt_sha256, model_name,',
        '  input_contract_name, input_contract_version, output_contract_name, output_contract_version,',
        '  input_payload_json, raw_model_output, validated_output_json, status, error_code, error_message, repair_attempted, metrics_json, specialty, finished_at',
        ') VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, NOW())',
        'RETURNING id, session_id, turn_seq, request_id, run_purpose, agent_name, prompt_name, prompt_version, prompt_sha256, model_name, raw_model_output, validated_output_json, status, specialty',
      ].join(' '),
      [
        params.sessionId,
        params.turnSeq ?? null,
        params.parentRunId ?? null,
        params.requestId ?? null,
        params.runPurpose,
        params.agentName,
        params.workflowName,
        params.workflowVersion,
        params.workflowExecutionId ?? null,
        params.attemptNo ?? 1,
        params.promptName,
        params.promptVersion,
        params.promptSha256,
        params.modelName,
        params.inputContractName,
        params.inputContractVersion,
        params.outputContractName,
        params.outputContractVersion,
        toJson(params.inputPayloadJson),
        params.rawModelOutput ?? null,
        params.validatedOutputJson ? toJson(params.validatedOutputJson) : null,
        params.status,
        params.errorCode ?? null,
        params.errorMessage ?? null,
        params.repairAttempted ?? false,
        toJson(params.metricsJson ?? {}),
        params.specialty ?? null,
      ],
    );

    return result.rows[0];
  }

  async createSnapshot(
    client: PoolClient,
    params: {
      sessionId: string;
      stateVersion: number;
      basedOnSnapshotId?: string;
      sourceTurnSeq?: number;
      sourceRunId?: string;
      snapshotKind: 'session_started' | 'turn_resolved' | 'manual_recovery';
      sessionStatus: 'active' | 'waiting_for_user' | 'completed' | 'blocked' | 'failed';
      structuredBrief: StructuredBrief;
      currentProblemDefinition: ProblemDefinitionState | Record<string, never>;
      detectedGaps: string[];
      nextQuestionText?: string;
      agentStatus: 'continue' | 'done' | 'blocked';
      completionReason?: string;
      warnings: string[];
      snapshotHash: string;
      specialty?: 'default' | 'legal';
    },
  ): Promise<SnapshotRecord> {
    const snapshotSeq = await this.getNextSnapshotSeq(client, params.sessionId);
    const result = await client.query<SnapshotRecord>(
      [
        'INSERT INTO session_snapshots (',
        '  session_id, snapshot_seq, state_version, based_on_snapshot_id, source_turn_seq, source_run_id, snapshot_kind,',
        '  current_stage, current_agent, session_status, structured_brief_json, current_problem_definition_json, detected_gaps_json,',
        '  next_question_text, agent_status, completion_reason, warnings_json, snapshot_hash, specialty',
        ') VALUES ($1, $2, $3, $4, $5, $6, $7, \'problem_definition\', \'problem_definition_agent\', $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)',
        'RETURNING id, session_id, snapshot_seq, state_version, source_turn_seq, source_run_id, structured_brief_json, current_problem_definition_json, detected_gaps_json, next_question_text, agent_status, completion_reason, warnings_json, specialty',
      ].join(' '),
      [
        params.sessionId,
        snapshotSeq,
        params.stateVersion,
        params.basedOnSnapshotId ?? null,
        params.sourceTurnSeq ?? null,
        params.sourceRunId ?? null,
        params.snapshotKind,
        params.sessionStatus,
        toJson(params.structuredBrief),
        toJson(params.currentProblemDefinition),
        toJson(params.detectedGaps),
        params.nextQuestionText ?? null,
        params.agentStatus,
        params.completionReason ?? null,
        toJson(params.warnings),
        params.snapshotHash,
        params.specialty ?? null,
      ],
    );

    return result.rows[0];
  }

  async createOpenTurn(
    client: PoolClient,
    params: {
      sessionId: string;
      turnSeq: number;
      questionText: string;
    },
  ): Promise<ConversationTurnRecord> {
    const result = await client.query<ConversationTurnRecord>(
      [
        'INSERT INTO conversation_turns (session_id, turn_seq, question_text, status)',
        'VALUES ($1, $2, $3, \'awaiting_user\')',
        'RETURNING *',
      ].join(' '),
      [params.sessionId, params.turnSeq, params.questionText],
    );

    return result.rows[0];
  }

  async appendUserAnswer(
    client: PoolClient,
    params: {
      sessionId: string;
      requestId: string;
      answer: string;
    },
  ): Promise<ConversationTurnRecord> {
    const openTurn = await this.getOpenTurn(params.sessionId, client);

    if (!openTurn) {
      throw new AppError(
        409,
        'no_open_turn',
        'The session is not waiting for a user answer',
        false,
        params.sessionId,
      );
    }

    const result = await client.query<ConversationTurnRecord>(
      [
        'UPDATE conversation_turns',
        'SET answer_text = $2, answer_request_id = $3, answer_received_at = NOW(), status = \'processing\'',
        'WHERE id = $1',
        'RETURNING *',
      ].join(' '),
      [openTurn.id, params.answer, params.requestId],
    );

    return result.rows[0];
  }

  async resolveTurn(
    client: PoolClient,
    params: {
      sessionId: string;
      turnSeq: number;
      diagnosis: string[];
      updatedProblemDefinition: ProblemDefinitionState;
      agentStatus: 'continue' | 'done' | 'blocked';
      completionReason: string;
      failed?: boolean;
    },
  ): Promise<ConversationTurnRecord> {
    const result = await client.query<ConversationTurnRecord>(
      [
        'UPDATE conversation_turns',
        'SET diagnosis_json = $3, updated_problem_definition_json = $4, agent_status = $5, completion_reason = $6,',
        '    status = $7, resolved_at = CASE WHEN $7 = \'resolved\' THEN NOW() ELSE resolved_at END',
        'WHERE session_id = $1 AND turn_seq = $2',
        'RETURNING *',
      ].join(' '),
      [
        params.sessionId,
        params.turnSeq,
        toJson(params.diagnosis),
        toJson(params.updatedProblemDefinition),
        params.agentStatus,
        params.completionReason,
        params.failed ? 'failed' : 'resolved',
      ],
    );

    const turn = result.rows[0];

    if (!turn) {
      throw new AppError(409, 'turn_not_found', 'The turn could not be resolved', false, params.sessionId);
    }

    return turn;
  }

  async updateSessionHead(
    client: PoolClient,
    params: {
      sessionId: string;
      status: 'active' | 'waiting_for_user' | 'completed' | 'blocked' | 'failed';
      currentTurnSeq: number;
      stateVersion: number;
      latestStructuredBrief: StructuredBrief;
      latestProblemDefinition: ProblemDefinitionState | Record<string, never>;
      latestSnapshotId?: string;
      latestSuccessfulRunId?: string;
      completionReason?: string;
    },
  ): Promise<SessionRecord> {
    const result = await client.query<SessionRecord>(
      [
        'UPDATE proposal_sessions',
        'SET status = $2, current_turn_seq = $3, state_version = $4, latest_structured_brief_json = $5,',
        '    latest_problem_definition_json = $6, latest_snapshot_id = $7, latest_successful_run_id = $8,',
        '    completion_reason = $9, completed_at = CASE WHEN $2 = \'completed\' THEN COALESCE(completed_at, NOW()) ELSE completed_at END',
        'WHERE id = $1',
        'RETURNING *',
      ].join(' '),
      [
        params.sessionId,
        params.status,
        params.currentTurnSeq,
        params.stateVersion,
        toJson(params.latestStructuredBrief),
        toJson(params.latestProblemDefinition),
        params.latestSnapshotId ?? null,
        params.latestSuccessfulRunId ?? null,
        params.completionReason ?? null,
      ],
    );

    return result.rows[0];
  }

  async updateSessionSpecialty(
    client: PoolClient,
    params: {
      sessionId: string;
      specialty: 'default' | 'legal';
    },
  ): Promise<SessionRecord> {
    const result = await client.query<SessionRecord>(
      [
        'UPDATE proposal_sessions',
        'SET current_specialty = $2, context_reset_at = NOW()',
        'WHERE id = $1',
        'RETURNING *',
      ].join(' '),
      [params.sessionId, params.specialty],
    );

    return result.rows[0];
  }

  async insertEvent(
    client: PoolClient,
    params: {
      sessionId: string;
      turnSeq?: number;
      runId?: string;
      eventType:
        | 'session_created'
        | 'brief_extracted'
        | 'turn_opened'
        | 'answer_received'
        | 'run_started'
        | 'run_completed'
        | 'run_failed'
        | 'snapshot_created'
        | 'session_completed'
        | 'session_blocked';
      actorType: 'user' | 'workflow' | 'agent' | 'system';
      requestId?: string;
      payloadJson?: Record<string, unknown>;
    },
  ): Promise<void> {
    const eventSeq = await this.getNextEventSeq(client, params.sessionId);

    await client.query(
      [
        'INSERT INTO session_events (session_id, turn_seq, run_id, event_seq, event_type, actor_type, request_id, payload_json)',
        'VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      ].join(' '),
      [
        params.sessionId,
        params.turnSeq ?? null,
        params.runId ?? null,
        eventSeq,
        params.eventType,
        params.actorType,
        params.requestId ?? null,
        toJson(params.payloadJson ?? {}),
      ],
    );
  }

  async getAuditView(sessionId: string): Promise<{
    session: SessionRecord;
    turns: ConversationTurnRecord[];
    runs: AgentRunRecord[];
    snapshots: SnapshotRecord[];
    events: Array<Record<string, unknown>>;
  }> {
    const session = await this.getSession(sessionId);
    const [turns, runs, snapshots, events] = await Promise.all([
      this.database.query<ConversationTurnRecord>(
        'SELECT * FROM conversation_turns WHERE session_id = $1 ORDER BY turn_seq ASC',
        [sessionId],
      ),
      this.database.query<AgentRunRecord>(
        'SELECT id, session_id, turn_seq, request_id, run_purpose, agent_name, prompt_name, prompt_version, prompt_sha256, model_name, raw_model_output, validated_output_json, status FROM agent_runs WHERE session_id = $1 ORDER BY started_at ASC',
        [sessionId],
      ),
      this.database.query<SnapshotRecord>(
        'SELECT id, session_id, snapshot_seq, state_version, source_turn_seq, source_run_id, structured_brief_json, current_problem_definition_json, detected_gaps_json, next_question_text, agent_status, completion_reason, warnings_json FROM session_snapshots WHERE session_id = $1 ORDER BY snapshot_seq ASC',
        [sessionId],
      ),
      this.database.query<Record<string, unknown>>(
        'SELECT * FROM session_events WHERE session_id = $1 ORDER BY event_seq ASC',
        [sessionId],
      ),
    ]);

    return {
      session,
      turns: turns.rows,
      runs: runs.rows,
      snapshots: snapshots.rows,
      events: events.rows,
    };
  }

  async getRequestExecutionStatus(requestId: string): Promise<RequestExecutionLookup> {
    const startSession = await this.findSessionByStartRequestId(requestId);

    if (startSession) {
      const problemDefinitionRun = await this.findLatestAgentRunStatus(requestId, 'problem_definition');

      if (problemDefinitionRun) {
        return toRequestExecutionFromRun(requestId, 'proposal_start', problemDefinitionRun);
      }

      if (
        startSession.status === 'waiting_for_user' ||
        startSession.status === 'completed' ||
        startSession.current_turn_seq > 0
      ) {
        return {
          request_id: requestId,
          request_kind: 'proposal_start',
          status: 'completed',
          session_id: startSession.id,
        };
      }

      if (startSession.status === 'blocked' || startSession.status === 'failed') {
        return {
          request_id: requestId,
          request_kind: 'proposal_start',
          status: 'failed',
          session_id: startSession.id,
          error_code: 'session_blocked',
          safe_message: 'The session was blocked before the first turn could be returned',
          retryable: true,
        };
      }

      return {
        request_id: requestId,
        request_kind: 'proposal_start',
        status: 'pending',
        session_id: startSession.id,
      };
    }

    const replyTurn = await this.findTurnByAnswerRequestId(requestId);

    if (replyTurn) {
      const problemDefinitionRun = await this.findLatestAgentRunStatus(requestId, 'problem_definition');

      if (problemDefinitionRun) {
        return toRequestExecutionFromRun(requestId, 'proposal_reply', problemDefinitionRun);
      }

      if (replyTurn.status === 'resolved') {
        return {
          request_id: requestId,
          request_kind: 'proposal_reply',
          status: 'completed',
          session_id: replyTurn.session_id,
        };
      }

      if (replyTurn.status === 'failed') {
        return {
          request_id: requestId,
          request_kind: 'proposal_reply',
          status: 'failed',
          session_id: replyTurn.session_id,
          error_code: 'reply_processing_failed',
          safe_message: 'The reply was persisted but the turn failed before completing',
          retryable: true,
        };
      }

      return {
        request_id: requestId,
        request_kind: 'proposal_reply',
        status: 'pending',
        session_id: replyTurn.session_id,
      };
    }

    return {
      request_id: requestId,
      request_kind: 'unknown',
      status: 'not_found',
    };
  }

  private async findLatestAgentRunStatus(
    requestId: string,
    runPurpose: AgentRunRecord['run_purpose'],
  ): Promise<AgentRunStatusLookup | null> {
    const result = await this.database.query<AgentRunStatusLookup>(
      [
        'SELECT session_id, status, error_code, error_message',
        'FROM agent_runs',
        'WHERE request_id = $1 AND run_purpose = $2',
        'ORDER BY started_at DESC',
        'LIMIT 1',
      ].join(' '),
      [requestId, runPurpose],
    );

    return result.rows[0] ?? null;
  }

  private async getNextSnapshotSeq(client: PoolClient, sessionId: string): Promise<number> {
    const result = await client.query<{ next_seq: number }>(
      'SELECT COALESCE(MAX(snapshot_seq), -1) + 1 AS next_seq FROM session_snapshots WHERE session_id = $1',
      [sessionId],
    );

    return Number(result.rows[0]?.next_seq ?? 0);
  }

  private async getNextEventSeq(client: PoolClient, sessionId: string): Promise<number> {
    const result = await client.query<{ next_seq: number }>(
      'SELECT COALESCE(MAX(event_seq), 0) + 1 AS next_seq FROM session_events WHERE session_id = $1',
      [sessionId],
    );

    return Number(result.rows[0]?.next_seq ?? 1);
  }
}

async function runQuery<T extends QueryResultRow>(
  executor: SqlExecutor,
  text: string,
  values: unknown[] = [],
): Promise<QueryResult<T>> {
  return (executor as PoolClient).query<T>(text, values);
}

function toJson(value: unknown): string {
  return JSON.stringify(value);
}

function toRequestExecutionFromRun(
  requestId: string,
  requestKind: RequestExecutionLookup['request_kind'],
  run: AgentRunStatusLookup,
): RequestExecutionLookup {
  if (run.status === 'completed') {
    return {
      request_id: requestId,
      request_kind: requestKind,
      status: 'completed',
      session_id: run.session_id,
    };
  }

  return {
    request_id: requestId,
    request_kind: requestKind,
    status: 'failed',
    session_id: run.session_id,
    error_code: run.error_code ?? 'request_failed',
    safe_message: run.error_message ?? 'The request failed while executing the workflow',
    retryable: run.status === 'model_failed',
  };
}
