import type { PoolClient, QueryResult, QueryResultRow } from 'pg';

import type {
  AlphaGap,
  GeneratedSection,
  ModuleChat,
  DocumentStatus,
  ProblemDefinitionState,
  ProposalDocument,
  ProposalDocumentSourceKind,
  ProposalSource,
  ProposalSourceKind,
  SourceSpan,
  StructuredBrief,
} from '../contracts/types';
import { isTerminalReplyFailureCode } from '../domain/session-retry';
import { AppError } from '../utils/errors';
import {
  mapChatTurn,
  mapGap,
  mapGeneratedSection,
  mapModuleChat,
  type AlphaGapRecord,
  type ChatTurnRecord,
  type GeneratedSectionRecord,
  type ModuleChatRecord,
} from './alpha-store';
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
}

export interface AgentRunRecord {
  id: string;
  session_id: string;
  turn_seq: number | null;
  request_id: string | null;
  run_purpose:
    | 'brief_extraction'
    | 'problem_definition'
    | 'solution_definition'
    | 'basic_report_compose'
    | 'data_ai_privacy_gap'
    | 'medical_device_triage'
    | 'resources_pilot_viability'
    | 'json_repair';
  agent_name: string;
  prompt_name: string;
  prompt_version: string;
  prompt_sha256: string;
  model_provider: string;
  model_name: string;
  model_params_json: Record<string, unknown>;
  raw_model_output: string | null;
  validated_output_json: Record<string, unknown> | null;
  status: 'completed' | 'validation_failed' | 'repair_failed' | 'model_failed' | 'controlled_error';
  error_code?: string | null;
  error_message?: string | null;
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
}

type AuditTimelineEvent = Record<string, unknown> & {
  event_stream: 'audit_events' | 'session_events';
  stream_event_seq: number;
  created_at?: unknown;
};

export interface ProposalDocumentRecord {
  id: string;
  proposal_id: string;
  source_kind: ProposalDocumentSourceKind;
  document_status: DocumentStatus;
  file_name: string | null;
  mime_type: string | null;
  sha256: string | null;
  pasted_text: string | null;
  normalized_text: string | null;
  source_refs_json: ProposalSource[];
  warnings_json: string[];
  metadata_json: Record<string, unknown>;
  created_at: string;
}

export interface ProposalSourceRecord {
  id: string;
  proposal_id: string;
  document_id: string | null;
  turn_id: string | null;
  section_id: string | null;
  source_kind: ProposalSourceKind;
  label: string;
  span_json: SourceSpan | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
}

export interface RequestExecutionLookup {
  request_id: string;
  request_kind:
    | 'proposal_start'
    | 'proposal_reply'
    | 'solution_start'
    | 'solution_reply'
    | 'data_ai_privacy_start'
    | 'data_ai_privacy_reply'
    | 'medical_device_triage_start'
    | 'medical_device_triage_reply'
    | 'resources_pilot_viability_start'
    | 'resources_pilot_viability_reply'
    | 'unknown';
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
  input_payload_json: Record<string, unknown>;
}

interface AlphaChatTurnStatusLookup {
  proposal_id: string;
  session_id: string;
  turn_status: 'awaiting_user' | 'processing' | 'resolved' | 'failed' | 'skipped';
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

    return result.rows[0] ? mapSessionRecord(result.rows[0]) : null;
  }

  async findLatestSnapshot(sessionId: string): Promise<SnapshotRecord | null> {
    const result = await this.database.query<SnapshotRecord>(
      [
        'SELECT id, session_id, snapshot_seq, state_version, source_turn_seq, source_run_id, structured_brief_json,',
        '       current_problem_definition_json, detected_gaps_json, next_question_text, agent_status, completion_reason, warnings_json',
        'FROM session_snapshots',
        'WHERE session_id = $1',
        'ORDER BY snapshot_seq DESC',
        'LIMIT 1',
      ].join(' '),
      [sessionId],
    );

    return result.rows[0] ? mapSnapshotRecord(result.rows[0]) : null;
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

    return mapSessionRecord(session);
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

    return mapSessionRecord(session);
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
  ): Promise<ConversationTurnRecord[]> {
    const queryable = executor ?? this.database;
    const result = await runQuery<ConversationTurnRecord>(
      queryable,
      [
        'SELECT *',
        'FROM conversation_turns',
        'WHERE session_id = $1 AND status = \'resolved\'',
        'ORDER BY turn_seq DESC',
        'LIMIT $2',
      ].join(' '),
      [sessionId, limit],
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
    },
  ): Promise<SessionRecord> {
    const result = await client.query<SessionRecord>(
      [
        'INSERT INTO proposal_sessions (',
        '  start_request_id, user_id, project_title, goal, raw_input_text, raw_input_file_name,',
        '  raw_input_file_sha256, normalized_text, metadata_json, status,',
        '  latest_structured_brief_json, latest_problem_definition_json',
        ') VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)',
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
      ],
    );

    return mapSessionRecord(result.rows[0]);
  }

  async listProposalDocuments(sessionId: string): Promise<ProposalDocument[]> {
    const result = await this.database.query<ProposalDocumentRecord>(
      [
        'SELECT id, proposal_id, source_kind, document_status, file_name, mime_type, sha256,',
        '       pasted_text, normalized_text, source_refs_json, warnings_json, metadata_json, created_at',
        'FROM proposal_documents',
        'WHERE proposal_id = (SELECT id FROM proposals WHERE session_id = $1 LIMIT 1)',
        'ORDER BY created_at ASC, id ASC',
      ].join(' '),
      [sessionId],
    );

    return result.rows.map(toProposalDocument);
  }

  async listProposalSources(sessionId: string): Promise<ProposalSource[]> {
    const result = await this.database.query<ProposalSourceRecord>(
      [
        'SELECT id, proposal_id, document_id, turn_id, section_id, source_kind, label, span_json, metadata_json, created_at',
        'FROM proposal_sources',
        'WHERE proposal_id = (SELECT id FROM proposals WHERE session_id = $1 LIMIT 1)',
        'ORDER BY created_at ASC,',
        '  CASE label',
        '    WHEN \'Proposal text\' THEN 1',
        '    WHEN \'Pasted supporting text\' THEN 2',
        '    ELSE 3',
        '  END ASC,',
        '  id ASC',
      ].join(' '),
      [sessionId],
    );

    return result.rows.map(toProposalSource);
  }

  async recordAgentRun(
    client: PoolClient,
    params: {
      sessionId: string;
      turnSeq?: number;
      parentRunId?: string;
      requestId?: string;
      runPurpose: AgentRunRecord['run_purpose'];
      agentName: string;
      workflowName: string;
      workflowVersion: string;
      workflowExecutionId?: string;
      attemptNo?: number;
      promptName: string;
      promptVersion: string;
      promptSha256: string;
      modelProvider: string;
      modelName: string;
      modelParamsJson: Record<string, unknown>;
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
    },
  ): Promise<AgentRunRecord> {
    const result = await client.query<AgentRunRecord>(
      [
        'INSERT INTO agent_runs (',
        '  session_id, turn_seq, parent_run_id, request_id, run_purpose, agent_name, workflow_name, workflow_version,',
        '  workflow_execution_id, attempt_no, prompt_name, prompt_version, prompt_sha256, model_provider, model_name, model_params_json,',
        '  input_contract_name, input_contract_version, output_contract_name, output_contract_version,',
        '  input_payload_json, raw_model_output, validated_output_json, status, error_code, error_message, repair_attempted, metrics_json, finished_at',
        ') VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, NOW())',
        'RETURNING id, session_id, turn_seq, request_id, run_purpose, agent_name, prompt_name, prompt_version, prompt_sha256, model_provider, model_name, model_params_json, raw_model_output, validated_output_json, status',
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
        params.modelProvider,
        params.modelName,
        toJson(params.modelParamsJson),
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
    },
  ): Promise<SnapshotRecord> {
    const snapshotSeq = await this.getNextSnapshotSeq(client, params.sessionId);
    const result = await client.query<SnapshotRecord>(
      [
        'INSERT INTO session_snapshots (',
        '  session_id, snapshot_seq, state_version, based_on_snapshot_id, source_turn_seq, source_run_id, snapshot_kind,',
        '  current_stage, current_agent, session_status, structured_brief_json, current_problem_definition_json, detected_gaps_json,',
        '  next_question_text, agent_status, completion_reason, warnings_json, snapshot_hash',
        ') VALUES ($1, $2, $3, $4, $5, $6, $7, \'problem_definition\', \'problem_definition_agent\', $8, $9, $10, $11, $12, $13, $14, $15, $16)',
        'RETURNING id, session_id, snapshot_seq, state_version, source_turn_seq, source_run_id, structured_brief_json, current_problem_definition_json, detected_gaps_json, next_question_text, agent_status, completion_reason, warnings_json',
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
      ],
    );

    return mapSnapshotRecord(result.rows[0]);
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

    if (openTurn.status === 'processing') {
      throw new AppError(
        409,
        'reply_already_processing',
        'The current turn is already processing a user answer',
        true,
        params.sessionId,
      );
    }

    const result = await client.query<ConversationTurnRecord>(
      [
        'UPDATE conversation_turns',
        'SET answer_text = $2, answer_request_id = $3, answer_received_at = NOW(), status = \'processing\'',
        'WHERE id = $1 AND status = \'awaiting_user\'',
        'RETURNING *',
      ].join(' '),
      [openTurn.id, params.answer, params.requestId],
    );

    const updatedTurn = result.rows[0];

    if (!updatedTurn) {
      throw new AppError(
        409,
        'reply_already_processing',
        'The current turn is already processing a user answer',
        true,
        params.sessionId,
      );
    }

    return updatedTurn;
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

  async markTurnFailed(
    client: PoolClient,
    params: {
      sessionId: string;
      turnSeq: number;
      completionReason: string;
    },
  ): Promise<ConversationTurnRecord> {
    const result = await client.query<ConversationTurnRecord>(
      [
        'UPDATE conversation_turns',
        'SET agent_status = \'blocked\', completion_reason = $3, status = \'failed\', resolved_at = NOW()',
        'WHERE session_id = $1 AND turn_seq = $2',
        'RETURNING *',
      ].join(' '),
      [params.sessionId, params.turnSeq, params.completionReason],
    );

    const turn = result.rows[0];

    if (!turn) {
      throw new AppError(409, 'turn_not_found', 'The turn could not be marked failed', false, params.sessionId);
    }

    return turn;
  }

  async revertTurnForUserRetry(
    client: PoolClient,
    params: {
      sessionId: string;
      turnSeq: number;
    },
  ): Promise<ConversationTurnRecord | null> {
    const result = await client.query<ConversationTurnRecord>(
      [
        'UPDATE conversation_turns',
        'SET status = \'awaiting_user\',',
        '    agent_status = NULL,',
        '    completion_reason = NULL,',
        '    resolved_at = NULL,',
        '    answer_request_id = NULL',
        'WHERE session_id = $1 AND turn_seq = $2 AND status IN (\'failed\', \'processing\')',
        'RETURNING *',
      ].join(' '),
      [params.sessionId, params.turnSeq],
    );

    return result.rows[0] ?? null;
  }

  async tryUnblockSessionForUserRetry(
    client: PoolClient,
    sessionId: string,
  ): Promise<ConversationTurnRecord | null> {
    const session = await this.getSessionForUpdate(sessionId, client);

    if (session.status !== 'blocked') {
      return null;
    }

    const failedTurn = await client.query<ConversationTurnRecord>(
      [
        'SELECT *',
        'FROM conversation_turns',
        'WHERE session_id = $1 AND status = \'failed\'',
        'ORDER BY turn_seq DESC',
        'LIMIT 1',
      ].join(' '),
      [sessionId],
    );
    const turn = failedTurn.rows[0];

    if (!turn) {
      return null;
    }

    const latestFailedRun = await client.query<{ error_code: string | null }>(
      [
        'SELECT error_code',
        'FROM agent_runs',
        'WHERE session_id = $1 AND turn_seq = $2 AND run_purpose = $3',
        '  AND status IN (\'controlled_error\', \'model_failed\', \'validation_failed\', \'repair_failed\')',
        'ORDER BY finished_at DESC NULLS LAST, started_at DESC, id DESC',
        'LIMIT 1',
      ].join(' '),
      [sessionId, turn.turn_seq, 'problem_definition'],
    );
    const latestErrorCode = latestFailedRun.rows[0]?.error_code;

    if (latestErrorCode && isTerminalReplyFailureCode(latestErrorCode)) {
      return null;
    }

    const revertedTurn = await this.revertTurnForUserRetry(client, {
      sessionId,
      turnSeq: turn.turn_seq,
    });

    if (!revertedTurn) {
      return null;
    }

    await this.updateSessionHead(client, {
      sessionId,
      status: 'waiting_for_user',
      currentTurnSeq: session.current_turn_seq,
      stateVersion: session.state_version,
      latestStructuredBrief: session.latest_structured_brief_json,
      latestProblemDefinition: session.latest_problem_definition_json,
      latestSnapshotId: session.latest_snapshot_id ?? undefined,
      latestSuccessfulRunId: session.latest_successful_run_id ?? undefined,
      completionReason: session.completion_reason ?? undefined,
    });

    return revertedTurn;
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
        | 'session_blocked'
        | 'document_received'
        | 'document_extracted'
        | 'document_failed'
        | 'gap_detected';
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
    documents: ProposalDocument[];
    sources: ProposalSource[];
    gaps: AlphaGap[];
    module_chats: ModuleChat[];
    generated_sections: GeneratedSection[];
    turns: ConversationTurnRecord[];
    runs: AgentRunRecord[];
    snapshots: SnapshotRecord[];
    events: Array<Record<string, unknown>>;
  }> {
    const session = await this.getSession(sessionId);
    const [
      documents,
      sources,
      gaps,
      moduleChats,
      chatTurns,
      generatedSections,
      turns,
      runs,
      snapshots,
      sessionEvents,
      alphaEvents,
    ] = await Promise.all([
      this.listProposalDocuments(sessionId),
      this.listProposalSources(sessionId),
      this.database.query<AlphaGapRecord>(
        [
          'SELECT *',
          'FROM alpha_gaps',
          'WHERE proposal_id = (SELECT id FROM proposals WHERE session_id = $1 LIMIT 1)',
          'ORDER BY created_at ASC, id ASC',
        ].join(' '),
        [sessionId],
      ),
      this.database.query<ModuleChatRecord>(
        [
          'SELECT *',
          'FROM module_chats',
          'WHERE proposal_id = (SELECT id FROM proposals WHERE session_id = $1 LIMIT 1)',
          'ORDER BY started_at ASC, id ASC',
        ].join(' '),
        [sessionId],
      ),
      this.database.query<ChatTurnRecord>(
        [
          'SELECT *',
          'FROM chat_turns',
          'WHERE proposal_id = (SELECT id FROM proposals WHERE session_id = $1 LIMIT 1)',
          'ORDER BY turn_seq ASC, created_at ASC, id ASC',
        ].join(' '),
        [sessionId],
      ),
      this.database.query<GeneratedSectionRecord>(
        [
          'SELECT *',
          'FROM generated_sections',
          'WHERE proposal_id = (SELECT id FROM proposals WHERE session_id = $1 LIMIT 1)',
          'ORDER BY section_version ASC, created_at ASC, id ASC',
        ].join(' '),
        [sessionId],
      ),
      this.database.query<ConversationTurnRecord>(
        'SELECT * FROM conversation_turns WHERE session_id = $1 ORDER BY turn_seq ASC',
        [sessionId],
      ),
      this.database.query<AgentRunRecord>(
        'SELECT id, session_id, turn_seq, request_id, run_purpose, agent_name, prompt_name, prompt_version, prompt_sha256, model_provider, model_name, model_params_json, raw_model_output, validated_output_json, status FROM agent_runs WHERE session_id = $1 ORDER BY started_at ASC',
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
      this.database.query<Record<string, unknown>>(
        [
          'SELECT *',
          'FROM audit_events',
          'WHERE proposal_id = (SELECT id FROM proposals WHERE session_id = $1 LIMIT 1)',
          'ORDER BY event_seq ASC',
        ].join(' '),
        [sessionId],
      ),
    ]);

    return {
      session,
      documents,
      sources,
      gaps: gaps.rows.map(mapGap),
      module_chats: moduleChats.rows.map((chat) =>
        mapModuleChat(
          chat,
          chatTurns.rows
            .filter((turn) => turn.chat_id === chat.id)
            .map(mapChatTurn),
        ),
      ),
      generated_sections: generatedSections.rows.map(mapGeneratedSection),
      turns: turns.rows,
      runs: runs.rows.map(redactPublicAgentRun),
      snapshots: snapshots.rows.map(mapSnapshotRecord),
      events: buildAuditTimelineEvents(sessionEvents.rows, alphaEvents.rows),
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

    const orphanedProblemDefinitionRun = await this.findLatestAgentRunStatus(requestId, 'problem_definition');

    if (orphanedProblemDefinitionRun?.input_payload_json.trigger === 'reply') {
      return toRequestExecutionFromRun(requestId, 'proposal_reply', orphanedProblemDefinitionRun);
    }

    const solutionReplyTurn = await this.findAlphaTurnByAnswerRequestId(requestId, 'solution');

    if (solutionReplyTurn) {
      const solutionDefinitionRun = await this.findLatestAgentRunStatus(requestId, 'solution_definition');

      if (solutionDefinitionRun) {
        return toRequestExecutionFromRun(requestId, 'solution_reply', solutionDefinitionRun);
      }

      if (solutionReplyTurn.turn_status === 'resolved') {
        return {
          request_id: requestId,
          request_kind: 'solution_reply',
          status: 'completed',
          session_id: solutionReplyTurn.session_id,
        };
      }

      if (solutionReplyTurn.turn_status === 'failed') {
        return {
          request_id: requestId,
          request_kind: 'solution_reply',
          status: 'failed',
          session_id: solutionReplyTurn.session_id,
          error_code: 'solution_reply_processing_failed',
          safe_message: 'The solution reply was persisted but the turn failed before completing',
          retryable: true,
        };
      }

      return {
        request_id: requestId,
        request_kind: 'solution_reply',
        status: 'pending',
        session_id: solutionReplyTurn.session_id,
      };
    }

    const dataAiPrivacyReplyTurn = await this.findAlphaTurnByAnswerRequestId(requestId, 'data_ai_privacy');

    if (dataAiPrivacyReplyTurn) {
      const dataAiPrivacyRun = await this.findLatestAgentRunStatus(requestId, 'data_ai_privacy_gap');

      if (dataAiPrivacyRun) {
        return toRequestExecutionFromRun(requestId, 'data_ai_privacy_reply', dataAiPrivacyRun);
      }

      if (dataAiPrivacyReplyTurn.turn_status === 'resolved') {
        return {
          request_id: requestId,
          request_kind: 'data_ai_privacy_reply',
          status: 'completed',
          session_id: dataAiPrivacyReplyTurn.session_id,
        };
      }

      if (dataAiPrivacyReplyTurn.turn_status === 'failed') {
        return {
          request_id: requestId,
          request_kind: 'data_ai_privacy_reply',
          status: 'failed',
          session_id: dataAiPrivacyReplyTurn.session_id,
          error_code: 'data_ai_privacy_reply_processing_failed',
          safe_message: 'The data AI privacy reply was persisted but the turn failed before completing',
          retryable: true,
        };
      }

      return {
        request_id: requestId,
        request_kind: 'data_ai_privacy_reply',
        status: 'pending',
        session_id: dataAiPrivacyReplyTurn.session_id,
      };
    }

    const dataAiPrivacyRun = await this.findLatestAgentRunStatus(requestId, 'data_ai_privacy_gap');

    if (dataAiPrivacyRun) {
      return toRequestExecutionFromRun(requestId, 'data_ai_privacy_start', dataAiPrivacyRun);
    }

    const medicalDeviceTriageReplyTurn = await this.findAlphaTurnByAnswerRequestId(
      requestId,
      'medical_device_triage',
    );

    if (medicalDeviceTriageReplyTurn) {
      const medicalDeviceTriageRun = await this.findLatestAgentRunStatus(requestId, 'medical_device_triage');

      if (medicalDeviceTriageRun) {
        return toRequestExecutionFromRun(requestId, 'medical_device_triage_reply', medicalDeviceTriageRun);
      }

      if (medicalDeviceTriageReplyTurn.turn_status === 'resolved') {
        return {
          request_id: requestId,
          request_kind: 'medical_device_triage_reply',
          status: 'completed',
          session_id: medicalDeviceTriageReplyTurn.session_id,
        };
      }

      if (medicalDeviceTriageReplyTurn.turn_status === 'failed') {
        return {
          request_id: requestId,
          request_kind: 'medical_device_triage_reply',
          status: 'failed',
          session_id: medicalDeviceTriageReplyTurn.session_id,
          error_code: 'medical_device_triage_reply_processing_failed',
          safe_message: 'The medical-device triage reply was persisted but the turn failed before completing',
          retryable: true,
        };
      }

      return {
        request_id: requestId,
        request_kind: 'medical_device_triage_reply',
        status: 'pending',
        session_id: medicalDeviceTriageReplyTurn.session_id,
      };
    }

    const medicalDeviceTriageRun = await this.findLatestAgentRunStatus(requestId, 'medical_device_triage');

    if (medicalDeviceTriageRun) {
      return toRequestExecutionFromRun(requestId, 'medical_device_triage_start', medicalDeviceTriageRun);
    }

    const resourcesPilotViabilityReplyTurn = await this.findAlphaTurnByAnswerRequestId(
      requestId,
      'resources_pilot_viability',
    );

    if (resourcesPilotViabilityReplyTurn) {
      const resourcesPilotViabilityRun = await this.findLatestAgentRunStatus(requestId, 'resources_pilot_viability');

      if (resourcesPilotViabilityRun) {
        return toRequestExecutionFromRun(
          requestId,
          'resources_pilot_viability_reply',
          resourcesPilotViabilityRun,
        );
      }

      if (resourcesPilotViabilityReplyTurn.turn_status === 'resolved') {
        return {
          request_id: requestId,
          request_kind: 'resources_pilot_viability_reply',
          status: 'completed',
          session_id: resourcesPilotViabilityReplyTurn.session_id,
        };
      }

      if (resourcesPilotViabilityReplyTurn.turn_status === 'failed') {
        return {
          request_id: requestId,
          request_kind: 'resources_pilot_viability_reply',
          status: 'failed',
          session_id: resourcesPilotViabilityReplyTurn.session_id,
          error_code: 'resources_pilot_viability_reply_processing_failed',
          safe_message: 'The resources pilot viability reply was persisted but the turn failed before completing',
          retryable: true,
        };
      }

      return {
        request_id: requestId,
        request_kind: 'resources_pilot_viability_reply',
        status: 'pending',
        session_id: resourcesPilotViabilityReplyTurn.session_id,
      };
    }

    const resourcesPilotViabilityRun = await this.findLatestAgentRunStatus(requestId, 'resources_pilot_viability');

    if (resourcesPilotViabilityRun) {
      return toRequestExecutionFromRun(requestId, 'resources_pilot_viability_start', resourcesPilotViabilityRun);
    }

    const resourcesPilotViabilityStart = await this.findAlphaAuditEventRequestSession(
      requestId,
      'resources_pilot_viability_start_requested',
    );

    if (resourcesPilotViabilityStart) {
      return {
        request_id: requestId,
        request_kind: 'resources_pilot_viability_start',
        status: 'pending',
        session_id: resourcesPilotViabilityStart.session_id,
      };
    }

    const solutionDefinitionRun = await this.findLatestAgentRunStatus(requestId, 'solution_definition');

    if (solutionDefinitionRun) {
      return toRequestExecutionFromRun(requestId, 'solution_start', solutionDefinitionRun);
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
        'SELECT session_id, status, error_code, error_message, input_payload_json',
        'FROM agent_runs',
        'WHERE request_id = $1 AND run_purpose = $2',
        'ORDER BY started_at DESC',
        'LIMIT 1',
      ].join(' '),
      [requestId, runPurpose],
    );

    return result.rows[0] ?? null;
  }

  private async findAlphaTurnByAnswerRequestId(
    requestId: string,
    module: 'problem' | 'solution' | 'data_ai_privacy' | 'medical_device_triage' | 'resources_pilot_viability',
  ): Promise<AlphaChatTurnStatusLookup | null> {
    const result = await this.database.query<AlphaChatTurnStatusLookup>(
      [
        'SELECT chat_turns.proposal_id, COALESCE(proposals.session_id, chat_turns.proposal_id) AS session_id, chat_turns.turn_status',
        'FROM chat_turns',
        'LEFT JOIN proposals ON proposals.id = chat_turns.proposal_id',
        'WHERE chat_turns.answer_request_id = $1 AND chat_turns.module = $2',
        'LIMIT 1',
      ].join(' '),
      [requestId, module],
    );

    return result.rows[0] ?? null;
  }

  private async findAlphaAuditEventRequestSession(
    requestId: string,
    eventType: string,
  ): Promise<{ session_id: string } | null> {
    const result = await this.database.query<{ session_id: string }>(
      [
        'SELECT session_id',
        'FROM audit_events',
        'WHERE request_id = $1 AND event_type = $2 AND session_id IS NOT NULL',
        'ORDER BY created_at DESC, event_seq DESC',
        'LIMIT 1',
      ].join(' '),
      [requestId, eventType],
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

function mapSessionRecord(record: SessionRecord): SessionRecord {
  return {
    ...record,
    current_turn_seq: parseDatabaseInteger(record.current_turn_seq, 'proposal_sessions.current_turn_seq'),
    state_version: parseDatabaseInteger(record.state_version, 'proposal_sessions.state_version'),
  };
}

function mapSnapshotRecord(record: SnapshotRecord): SnapshotRecord {
  return {
    ...record,
    snapshot_seq: parseDatabaseInteger(record.snapshot_seq, 'session_snapshots.snapshot_seq'),
    state_version: parseDatabaseInteger(record.state_version, 'session_snapshots.state_version'),
    source_turn_seq:
      record.source_turn_seq == null
        ? null
        : parseDatabaseInteger(record.source_turn_seq, 'session_snapshots.source_turn_seq'),
  };
}

function parseDatabaseInteger(value: unknown, fieldName: string): number {
  if (value === null || value === undefined || value === '') {
    throw new AppError(500, 'invalid_database_integer', `Database returned an invalid integer for ${fieldName}`, false);
  }

  const parsed = typeof value === 'bigint' ? Number(value) : typeof value === 'number' ? value : Number(value);

  if (!Number.isSafeInteger(parsed)) {
    throw new AppError(500, 'invalid_database_integer', `Database returned an invalid integer for ${fieldName}`, false);
  }

  return parsed;
}

function buildAuditTimelineEvents(
  sessionEvents: Array<Record<string, unknown>>,
  auditEvents: Array<Record<string, unknown>>,
): AuditTimelineEvent[] {
  return [
    ...sessionEvents.map((event) => toAuditTimelineEvent(event, 'session_events')),
    ...auditEvents.map((event) => toAuditTimelineEvent(event, 'audit_events')),
  ].sort(compareAuditTimelineEvents);
}

function toAuditTimelineEvent(
  event: Record<string, unknown>,
  eventStream: AuditTimelineEvent['event_stream'],
): AuditTimelineEvent {
  return {
    ...event,
    event_stream: eventStream,
    stream_event_seq: Number(event.event_seq),
  };
}

function compareAuditTimelineEvents(left: AuditTimelineEvent, right: AuditTimelineEvent): number {
  const createdAtCompare = getCreatedAtMillis(left.created_at) - getCreatedAtMillis(right.created_at);

  if (createdAtCompare !== 0) {
    return createdAtCompare;
  }

  const streamCompare = left.event_stream.localeCompare(right.event_stream);

  if (streamCompare !== 0) {
    return streamCompare;
  }

  return left.stream_event_seq - right.stream_event_seq;
}

function getCreatedAtMillis(value: unknown): number {
  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

function toProposalDocument(record: ProposalDocumentRecord): ProposalDocument {
  return {
    document_id: record.id,
    proposal_id: record.proposal_id,
    source_kind: record.source_kind,
    document_status: record.document_status,
    file_name: record.file_name ?? undefined,
    mime_type: record.mime_type ?? undefined,
    sha256: record.sha256 ?? undefined,
    pasted_text: record.pasted_text ?? undefined,
    normalized_text: record.normalized_text ?? undefined,
    source_refs: record.source_refs_json.length > 0 ? record.source_refs_json : undefined,
    warnings: record.warnings_json,
    created_at: record.created_at,
    metadata: record.metadata_json,
  };
}

function toProposalSource(record: ProposalSourceRecord): ProposalSource {
  return {
    source_id: record.id,
    source_kind: record.source_kind,
    label: record.label,
    document_id: record.document_id ?? undefined,
    turn_id: record.turn_id ?? undefined,
    section_id: record.section_id ?? undefined,
    span: record.span_json ?? undefined,
    created_at: record.created_at,
    metadata: record.metadata_json,
  };
}

function redactPublicAgentRun(record: AgentRunRecord): AgentRunRecord {
  return {
    ...record,
    raw_model_output: null,
    validated_output_json: null,
  };
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
