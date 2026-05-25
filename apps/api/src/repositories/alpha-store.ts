import type { PoolClient, QueryResult, QueryResultRow } from 'pg';

import {
  assertAlphaGap,
  assertAlphaProposal,
  assertBasicAlphaReport,
  assertChatTurn,
  assertGeneratedSection,
  assertModuleChat,
  assertProposalDocument,
  assertProposalSource,
} from '../contracts/schema-registry';
import type {
  AlphaGap,
  AlphaModule,
  AlphaProposal,
  AuditRef,
  BasicAlphaReport,
  ChatStatus,
  ChatTurn,
  ChatTurnStatus,
  DocumentStatus,
  GapAbsence,
  GapKind,
  GapOrigin,
  GapStatus,
  GeneratedSection,
  ModuleChat,
  ProposalDocument,
  ProposalDocumentSourceKind,
  ProposalSource,
  ProposalSourceKind,
  ProposalStatus,
  ReportStatus,
  SectionKind,
  SectionStatus,
  SourceSpan,
  StructuredBrief,
} from '../contracts/types';
import { AppError } from '../utils/errors';
import { Database, type SqlExecutor } from './database';

export interface ProposalRecord {
  id: string;
  session_id: string | null;
  user_id: string | null;
  proposal_status: ProposalStatus;
  project_title: string;
  goal: string;
  structured_brief_json: StructuredBrief;
  audit_refs_json: AuditRef[];
  warnings_json: string[];
  schema_version: string;
  metadata_json: Record<string, unknown>;
  created_at: string | Date;
  updated_at: string | Date;
}

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
  created_at: string | Date;
}

export interface ProposalSourceRecord {
  id: string;
  proposal_id: string;
  source_kind: ProposalSourceKind;
  label: string;
  document_id: string | null;
  turn_id: string | null;
  section_id: string | null;
  span_json: SourceSpan | null;
  metadata_json: Record<string, unknown>;
  created_at: string | Date;
}

export interface AlphaGapRecord {
  id: string;
  proposal_id: string;
  module: AlphaModule;
  gap_kind: GapKind;
  gap_status: GapStatus;
  origin: GapOrigin;
  field: string;
  description: string;
  absence_json: GapAbsence;
  question_hint: string | null;
  source_refs_json: ProposalSource[];
  resolved_by_turn_id: string | null;
  audit_refs_json: AuditRef[];
  warnings_json: string[];
  created_at: string | Date;
  updated_at: string | Date;
}

export interface ModuleChatRecord {
  id: string;
  proposal_id: string;
  module: AlphaModule;
  chat_status: ChatStatus;
  active_turn_id: string | null;
  warnings_json: string[];
  started_at: string | Date;
  completed_at: string | Date | null;
}

export interface ChatTurnRecord {
  id: string;
  chat_id: string;
  proposal_id: string;
  module: AlphaModule;
  turn_seq: number;
  question_text: string;
  answer_text: string | null;
  answer_request_id: string | null;
  turn_status: ChatTurnStatus;
  agent_status: 'continue' | 'done' | 'blocked' | null;
  diagnosis_json: string[];
  source_refs_json: ProposalSource[];
  gap_refs_json: string[];
  audit_refs_json: AuditRef[];
  warnings_json: string[];
  created_at: string | Date;
  completed_at: string | Date | null;
}

export interface GeneratedSectionRecord {
  id: string;
  proposal_id: string;
  section_kind: SectionKind;
  section_status: SectionStatus;
  section_version: number;
  title: string;
  content_markdown: string;
  source_refs_json: ProposalSource[];
  gap_refs_json: string[];
  generated_by_run_id: string | null;
  supersedes_section_id: string | null;
  warnings_json: string[];
  created_at: string | Date;
}

export interface BasicReportRecord {
  id: string;
  proposal_id: string;
  report_status: ReportStatus;
  schema_version: string;
  structured_brief_json: StructuredBrief;
  current_gaps_json: AlphaGap[];
  problem_section_id: string;
  solution_section_id: string;
  internal_sources_json: ProposalSource[];
  audit_refs_json: AuditRef[];
  warnings_json: string[];
  generated_at: string | Date;
}

export interface AuditEventRecord {
  id: string;
  proposal_id: string;
  session_id: string | null;
  run_id: string | null;
  turn_id: string | null;
  event_seq: number;
  event_type: string;
  actor_type: 'user' | 'workflow' | 'agent' | 'system';
  request_id: string | null;
  payload_json: Record<string, unknown>;
  created_at: string | Date;
}

/**
 * Repository for the Alpha persistence model.
 *
 * Mutating methods accept an explicit SqlExecutor so proposal-start can persist
 * Alpha rows in the same transaction as the legacy resumable session state.
 * Returned records are mapped back through contract validators before leaving
 * this boundary.
 */
export class AlphaStore {
  constructor(private readonly database: Database) {}

  getDatabase(): Database {
    return this.database;
  }

  async createProposal(
    executor: SqlExecutor,
    params: {
      proposalId?: string;
      sessionId?: string;
      userId?: string;
      proposalStatus: ProposalStatus;
      projectTitle: string;
      goal: string;
      structuredBrief: StructuredBrief;
      auditRefs?: AuditRef[];
      warnings?: string[];
      schemaVersion: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<AlphaProposal> {
    const result = await runQuery<ProposalRecord>(
      executor,
      [
        'INSERT INTO proposals (',
        '  id, session_id, user_id, proposal_status, project_title, goal, structured_brief_json,',
        '  audit_refs_json, warnings_json, schema_version, metadata_json',
        ') VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
        'RETURNING *',
      ].join(' '),
      [
        params.proposalId ?? null,
        params.sessionId ?? null,
        params.userId ?? null,
        params.proposalStatus,
        params.projectTitle,
        params.goal,
        toJson(params.structuredBrief),
        toJson(params.auditRefs ?? []),
        toJson(params.warnings ?? []),
        params.schemaVersion,
        toJson(params.metadata ?? {}),
      ],
    );

    return mapProposal(result.rows[0]);
  }

  async getProposal(proposalId: string, executor?: SqlExecutor): Promise<AlphaProposal> {
    return mapProposal(await this.getProposalRecord(proposalId, executor));
  }

  async findProposalBySessionId(sessionId: string, executor?: SqlExecutor): Promise<AlphaProposal | null> {
    const queryable = executor ?? this.database;
    const result = await runQuery<ProposalRecord>(
      queryable,
      'SELECT * FROM proposals WHERE session_id = $1 LIMIT 1',
      [sessionId],
    );
    const proposal = result.rows[0];

    return proposal ? mapProposal(proposal) : null;
  }

  async updateProposalStatus(
    executor: SqlExecutor,
    params: { proposalId: string; proposalStatus: ProposalStatus },
  ): Promise<AlphaProposal> {
    const result = await runQuery<ProposalRecord>(
      executor,
      'UPDATE proposals SET proposal_status = $2 WHERE id = $1 RETURNING *',
      [params.proposalId, params.proposalStatus],
    );

    const proposal = result.rows[0];
    if (!proposal) {
      throw new AppError(404, 'proposal_not_found', 'The requested proposal does not exist', false, params.proposalId);
    }

    return mapProposal(proposal);
  }

  async createDocument(
    executor: SqlExecutor,
    params: {
      proposalId: string;
      sourceKind: ProposalDocumentSourceKind;
      documentStatus: DocumentStatus;
      fileName?: string;
      mimeType?: string;
      sha256?: string;
      pastedText?: string;
      normalizedText?: string;
      sourceRefs?: ProposalSource[];
      warnings?: string[];
      metadata?: Record<string, unknown>;
    },
  ): Promise<ProposalDocument> {
    const result = await runQuery<ProposalDocumentRecord>(
      executor,
      [
        'INSERT INTO proposal_documents (',
        '  proposal_id, source_kind, document_status, file_name, mime_type, sha256, pasted_text,',
        '  normalized_text, source_refs_json, warnings_json, metadata_json',
        ') VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
        'RETURNING *',
      ].join(' '),
      [
        params.proposalId,
        params.sourceKind,
        params.documentStatus,
        params.fileName ?? null,
        params.mimeType ?? null,
        params.sha256 ?? null,
        params.pastedText ?? null,
        params.normalizedText ?? null,
        toJson(params.sourceRefs ?? []),
        toJson(params.warnings ?? []),
        toJson(params.metadata ?? {}),
      ],
    );

    return mapDocument(result.rows[0]);
  }

  async getDocument(documentId: string, executor?: SqlExecutor): Promise<ProposalDocument> {
    const queryable = executor ?? this.database;
    const result = await runQuery<ProposalDocumentRecord>(
      queryable,
      'SELECT * FROM proposal_documents WHERE id = $1 LIMIT 1',
      [documentId],
    );
    const document = result.rows[0];

    if (!document) {
      throw new AppError(404, 'document_not_found', 'The requested proposal document does not exist', false);
    }

    return mapDocument(document);
  }

  async listDocuments(proposalId: string, executor?: SqlExecutor): Promise<ProposalDocument[]> {
    const queryable = executor ?? this.database;
    const result = await runQuery<ProposalDocumentRecord>(
      queryable,
      'SELECT * FROM proposal_documents WHERE proposal_id = $1 ORDER BY created_at ASC, id ASC',
      [proposalId],
    );

    return result.rows.map(mapDocument);
  }

  async createSource(
    executor: SqlExecutor,
    params: {
      proposalId: string;
      sourceKind: ProposalSourceKind;
      label: string;
      documentId?: string;
      turnId?: string;
      sectionId?: string;
      span?: SourceSpan;
      metadata?: Record<string, unknown>;
    },
  ): Promise<ProposalSource> {
    const result = await runQuery<ProposalSourceRecord>(
      executor,
      [
        'INSERT INTO proposal_sources (proposal_id, source_kind, label, document_id, turn_id, section_id, span_json, metadata_json)',
        'VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        'RETURNING *',
      ].join(' '),
      [
        params.proposalId,
        params.sourceKind,
        params.label,
        params.documentId ?? null,
        params.turnId ?? null,
        params.sectionId ?? null,
        params.span ? toJson(params.span) : null,
        toJson(params.metadata ?? {}),
      ],
    );

    return mapSource(result.rows[0]);
  }

  async listSources(proposalId: string, executor?: SqlExecutor): Promise<ProposalSource[]> {
    const queryable = executor ?? this.database;
    const result = await runQuery<ProposalSourceRecord>(
      queryable,
      'SELECT * FROM proposal_sources WHERE proposal_id = $1 ORDER BY created_at ASC, id ASC',
      [proposalId],
    );

    return result.rows.map(mapSource);
  }

  async createGap(
    executor: SqlExecutor,
    params: {
      proposalId: string;
      module: AlphaModule;
      gapKind: GapKind;
      gapStatus: GapStatus;
      origin: GapOrigin;
      field: string;
      description: string;
      absence: GapAbsence;
      questionHint?: string;
      sourceRefs?: ProposalSource[];
      resolvedByTurnId?: string;
      auditRefs?: AuditRef[];
      warnings?: string[];
    },
  ): Promise<AlphaGap> {
    const result = await runQuery<AlphaGapRecord>(
      executor,
      [
        'INSERT INTO alpha_gaps (',
        '  proposal_id, module, gap_kind, gap_status, origin, field, description, absence_json, question_hint,',
        '  source_refs_json, resolved_by_turn_id, audit_refs_json, warnings_json',
        ') VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)',
        'RETURNING *',
      ].join(' '),
      [
        params.proposalId,
        params.module,
        params.gapKind,
        params.gapStatus,
        params.origin,
        params.field,
        params.description,
        toJson(params.absence),
        params.questionHint ?? null,
        toJson(params.sourceRefs ?? []),
        params.resolvedByTurnId ?? null,
        toJson(params.auditRefs ?? []),
        toJson(params.warnings ?? []),
      ],
    );

    return mapGap(result.rows[0]);
  }

  async updateGapStatus(
    executor: SqlExecutor,
    params: { gapId: string; gapStatus: GapStatus; resolvedByTurnId?: string },
  ): Promise<AlphaGap> {
    const result = await runQuery<AlphaGapRecord>(
      executor,
      'UPDATE alpha_gaps SET gap_status = $2, resolved_by_turn_id = COALESCE($3, resolved_by_turn_id) WHERE id = $1 RETURNING *',
      [params.gapId, params.gapStatus, params.resolvedByTurnId ?? null],
    );
    const gap = result.rows[0];

    if (!gap) {
      throw new AppError(404, 'gap_not_found', 'The requested Alpha gap does not exist', false);
    }

    return mapGap(gap);
  }

  async listGaps(proposalId: string, executor?: SqlExecutor): Promise<AlphaGap[]> {
    const queryable = executor ?? this.database;
    const result = await runQuery<AlphaGapRecord>(
      queryable,
      'SELECT * FROM alpha_gaps WHERE proposal_id = $1 ORDER BY created_at ASC, id ASC',
      [proposalId],
    );

    return result.rows.map(mapGap);
  }

  async createModuleChat(
    executor: SqlExecutor,
    params: {
      proposalId: string;
      module: AlphaModule;
      chatStatus: ChatStatus;
      activeTurnId?: string;
      warnings?: string[];
    },
  ): Promise<ModuleChat> {
    const result = await runQuery<ModuleChatRecord>(
      executor,
      [
        'INSERT INTO module_chats (proposal_id, module, chat_status, active_turn_id, warnings_json)',
        'VALUES ($1, $2, $3, $4, $5)',
        'RETURNING *',
      ].join(' '),
      [params.proposalId, params.module, params.chatStatus, params.activeTurnId ?? null, toJson(params.warnings ?? [])],
    );

    return mapModuleChat(result.rows[0], []);
  }

  async getModuleChat(chatId: string, executor?: SqlExecutor): Promise<ModuleChat> {
    const queryable = executor ?? this.database;
    const result = await runQuery<ModuleChatRecord>(
      queryable,
      'SELECT * FROM module_chats WHERE id = $1 LIMIT 1',
      [chatId],
    );
    const chat = result.rows[0];

    if (!chat) {
      throw new AppError(404, 'chat_not_found', 'The requested module chat does not exist', false);
    }

    return mapModuleChat(chat, await this.listChatTurns(chat.id, queryable));
  }

  async findModuleChatByProposalAndModule(
    proposalId: string,
    module: AlphaModule,
    executor?: SqlExecutor,
  ): Promise<ModuleChat | null> {
    const queryable = executor ?? this.database;
    const result = await runQuery<ModuleChatRecord>(
      queryable,
      'SELECT * FROM module_chats WHERE proposal_id = $1 AND module = $2 LIMIT 1',
      [proposalId, module],
    );
    const chat = result.rows[0];

    if (!chat) {
      return null;
    }

    return mapModuleChat(chat, await this.listChatTurns(chat.id, queryable));
  }

  async updateModuleChatStatus(
    executor: SqlExecutor,
    params: { chatId: string; chatStatus: ChatStatus; activeTurnId?: string | null },
  ): Promise<ModuleChat> {
    const result = await runQuery<ModuleChatRecord>(
      executor,
      [
        'UPDATE module_chats',
        'SET chat_status = $2,',
        '  active_turn_id = CASE WHEN $3 THEN $4 ELSE active_turn_id END,',
        '  completed_at = CASE WHEN $2 = \'completed\' THEN COALESCE(completed_at, NOW()) ELSE completed_at END',
        'WHERE id = $1',
        'RETURNING *',
      ].join(' '),
      [params.chatId, params.chatStatus, params.activeTurnId !== undefined, params.activeTurnId ?? null],
    );
    const chat = result.rows[0];

    if (!chat) {
      throw new AppError(404, 'chat_not_found', 'The requested module chat does not exist', false);
    }

    return mapModuleChat(chat, await this.listChatTurns(chat.id, executor));
  }

  async createChatTurn(
    executor: SqlExecutor,
    params: {
      chatId: string;
      proposalId: string;
      module: AlphaModule;
      turnSeq: number;
      questionText: string;
      turnStatus: ChatTurnStatus;
      agentStatus?: 'continue' | 'done' | 'blocked';
      diagnosis?: string[];
      sourceRefs?: ProposalSource[];
      gapRefs?: string[];
      auditRefs?: AuditRef[];
      warnings?: string[];
    },
  ): Promise<ChatTurn> {
    try {
      const result = await runQuery<ChatTurnRecord>(
        executor,
        [
          'INSERT INTO chat_turns (',
          '  chat_id, proposal_id, module, turn_seq, question_text, turn_status, agent_status, diagnosis_json,',
          '  source_refs_json, gap_refs_json, audit_refs_json, warnings_json',
          ') VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)',
          'RETURNING *',
        ].join(' '),
        [
          params.chatId,
          params.proposalId,
          params.module,
          params.turnSeq,
          params.questionText,
          params.turnStatus,
          params.agentStatus ?? null,
          toJson(params.diagnosis ?? []),
          toJson(params.sourceRefs ?? []),
          toJson(params.gapRefs ?? []),
          toJson(params.auditRefs ?? []),
          toJson(params.warnings ?? []),
        ],
      );

      return mapChatTurn(result.rows[0]);
    } catch (error) {
      throw toAlphaPersistenceError(error, params.proposalId, {
        uq_chat_turns_open_turn: [
          409,
          'alpha_open_turn_conflict',
          'The Alpha chat already has an open turn',
        ],
        chat_turns_chat_id_turn_seq_key: [
          409,
          'alpha_turn_sequence_conflict',
          'The Alpha chat turn sequence already exists',
        ],
      });
    }
  }

  async updateChatTurnAnswer(
    executor: SqlExecutor,
    params: { turnId: string; answerText: string; answerRequestId?: string },
  ): Promise<ChatTurn> {
    const result = await runQuery<ChatTurnRecord>(
      executor,
      [
        'UPDATE chat_turns',
        'SET answer_text = $2, answer_request_id = COALESCE($3, answer_request_id), turn_status = \'processing\'',
        'WHERE id = $1',
        'RETURNING *',
      ].join(' '),
      [params.turnId, params.answerText, params.answerRequestId ?? null],
    );
    const turn = result.rows[0];

    if (!turn) {
      throw new AppError(404, 'chat_turn_not_found', 'The requested chat turn does not exist', false);
    }

    return mapChatTurn(turn);
  }

  async findChatTurnByAnswerRequestId(
    requestId: string,
    executor?: SqlExecutor,
  ): Promise<ChatTurn | null> {
    const queryable = executor ?? this.database;
    const result = await runQuery<ChatTurnRecord>(
      queryable,
      'SELECT * FROM chat_turns WHERE answer_request_id = $1 LIMIT 1',
      [requestId],
    );

    return result.rows[0] ? mapChatTurn(result.rows[0]) : null;
  }

  async resolveChatTurn(
    executor: SqlExecutor,
    params: {
      turnId: string;
      turnStatus?: Extract<ChatTurnStatus, 'resolved' | 'failed' | 'skipped'>;
      agentStatus?: 'continue' | 'done' | 'blocked';
      diagnosis?: string[];
      sourceRefs?: ProposalSource[];
      gapRefs?: string[];
      auditRefs?: AuditRef[];
      warnings?: string[];
    },
  ): Promise<ChatTurn> {
    const result = await runQuery<ChatTurnRecord>(
      executor,
      [
        'UPDATE chat_turns',
        'SET turn_status = $2, agent_status = $3, diagnosis_json = $4, source_refs_json = $5,',
        '    gap_refs_json = $6, audit_refs_json = $7, warnings_json = $8, completed_at = NOW()',
        'WHERE id = $1',
        'RETURNING *',
      ].join(' '),
      [
        params.turnId,
        params.turnStatus ?? 'resolved',
        params.agentStatus ?? null,
        toJson(params.diagnosis ?? []),
        toJson(params.sourceRefs ?? []),
        toJson(params.gapRefs ?? []),
        toJson(params.auditRefs ?? []),
        toJson(params.warnings ?? []),
      ],
    );
    const turn = result.rows[0];

    if (!turn) {
      throw new AppError(404, 'chat_turn_not_found', 'The requested chat turn does not exist', false);
    }

    return mapChatTurn(turn);
  }

  async listChatTurns(chatId: string, executor?: SqlExecutor): Promise<ChatTurn[]> {
    const queryable = executor ?? this.database;
    const result = await runQuery<ChatTurnRecord>(
      queryable,
      'SELECT * FROM chat_turns WHERE chat_id = $1 ORDER BY turn_seq ASC',
      [chatId],
    );

    return result.rows.map(mapChatTurn);
  }

  async createGeneratedSection(
    executor: SqlExecutor,
    params: {
      proposalId: string;
      sectionKind: SectionKind;
      sectionStatus: SectionStatus;
      title: string;
      contentMarkdown: string;
      sourceRefs?: ProposalSource[];
      gapRefs?: string[];
      generatedByRunId?: string;
      supersedesSectionId?: string;
      sectionVersion?: number;
      warnings?: string[];
    },
  ): Promise<GeneratedSection> {
    try {
      const sectionVersion =
        params.sectionVersion ?? await this.getNextSectionVersion(executor, params.proposalId, params.sectionKind);
      const result = await runQuery<GeneratedSectionRecord>(
        executor,
        [
          'INSERT INTO generated_sections (',
          '  proposal_id, section_kind, section_status, section_version, title, content_markdown, source_refs_json,',
          '  gap_refs_json, generated_by_run_id, supersedes_section_id, warnings_json',
          ') VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
          'RETURNING *',
        ].join(' '),
        [
          params.proposalId,
          params.sectionKind,
          params.sectionStatus,
          sectionVersion,
          params.title,
          params.contentMarkdown,
          toJson(params.sourceRefs ?? []),
          toJson(params.gapRefs ?? []),
          params.generatedByRunId ?? null,
          params.supersedesSectionId ?? null,
          toJson(params.warnings ?? []),
        ],
      );

      return mapGeneratedSection(result.rows[0]);
    } catch (error) {
      throw toAlphaPersistenceError(error, params.proposalId, {
        uq_generated_sections_proposal_kind_version: [
          409,
          'alpha_section_version_conflict',
          'The generated section version already exists',
        ],
        uq_generated_sections_current: [
          409,
          'alpha_current_section_conflict',
          'A current generated section already exists',
        ],
      });
    }
  }

  async supersedeGeneratedSection(
    executor: SqlExecutor,
    params: { sectionId: string; replacementSectionId?: string },
  ): Promise<GeneratedSection> {
    const result = await runQuery<GeneratedSectionRecord>(
      executor,
      'UPDATE generated_sections SET section_status = \'superseded\', supersedes_section_id = COALESCE($2, supersedes_section_id) WHERE id = $1 RETURNING *',
      [params.sectionId, params.replacementSectionId ?? null],
    );
    const section = result.rows[0];

    if (!section) {
      throw new AppError(404, 'section_not_found', 'The requested generated section does not exist', false);
    }

    return mapGeneratedSection(section);
  }

  async listGeneratedSections(proposalId: string, executor?: SqlExecutor): Promise<GeneratedSection[]> {
    const queryable = executor ?? this.database;
    const result = await runQuery<GeneratedSectionRecord>(
      queryable,
      'SELECT * FROM generated_sections WHERE proposal_id = $1 ORDER BY section_version ASC, created_at ASC, id ASC',
      [proposalId],
    );

    return result.rows.map(mapGeneratedSection);
  }

  async findCurrentGeneratedSection(
    proposalId: string,
    sectionKind: SectionKind,
    executor?: SqlExecutor,
  ): Promise<GeneratedSection | null> {
    const queryable = executor ?? this.database;
    const result = await runQuery<GeneratedSectionRecord>(
      queryable,
      [
        'SELECT *',
        'FROM generated_sections',
        'WHERE proposal_id = $1',
        '  AND section_kind = $2',
        '  AND section_status IN (\'draft\', \'generated\', \'accepted\', \'needs_revision\')',
        'ORDER BY section_version DESC, created_at DESC, id DESC',
        'LIMIT 1',
      ].join(' '),
      [proposalId, sectionKind],
    );

    return result.rows[0] ? mapGeneratedSection(result.rows[0]) : null;
  }

  async createBasicReport(
    executor: SqlExecutor,
    params: {
      proposalId: string;
      reportStatus: ReportStatus;
      schemaVersion: string;
      structuredBrief: StructuredBrief;
      currentGaps?: AlphaGap[];
      problemSectionId: string;
      solutionSectionId: string;
      internalSources?: ProposalSource[];
      auditRefs?: AuditRef[];
      warnings?: string[];
    },
  ): Promise<BasicAlphaReport> {
    const result = await runQuery<BasicReportRecord>(
      executor,
      [
        'INSERT INTO basic_reports (',
        '  proposal_id, report_status, schema_version, structured_brief_json, current_gaps_json,',
        '  problem_section_id, solution_section_id, internal_sources_json, audit_refs_json, warnings_json',
        ') VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
        'RETURNING *',
      ].join(' '),
      [
        params.proposalId,
        params.reportStatus,
        params.schemaVersion,
        toJson(params.structuredBrief),
        toJson(params.currentGaps ?? []),
        params.problemSectionId,
        params.solutionSectionId,
        toJson(params.internalSources ?? []),
        toJson(params.auditRefs ?? []),
        toJson(params.warnings ?? []),
      ],
    );

    return this.mapBasicReportRecord(result.rows[0], executor);
  }

  async getBasicReport(proposalId: string, executor?: SqlExecutor): Promise<BasicAlphaReport> {
    const queryable = executor ?? this.database;
    const result = await runQuery<BasicReportRecord>(
      queryable,
      'SELECT * FROM basic_reports WHERE proposal_id = $1 LIMIT 1',
      [proposalId],
    );
    const report = result.rows[0];

    if (!report) {
      throw new AppError(404, 'report_not_found', 'The requested Alpha report does not exist', false);
    }

    return this.mapBasicReportRecord(report, queryable);
  }

  async appendAuditEvent(
    executor: SqlExecutor,
    params: {
      proposalId: string;
      sessionId?: string;
      runId?: string;
      turnId?: string;
      eventType: string;
      actorType: 'user' | 'workflow' | 'agent' | 'system';
      requestId?: string;
      payloadJson?: Record<string, unknown>;
    },
  ): Promise<AuditEventRecord> {
    if (executor instanceof Database) {
      return executor.withTransaction((client) => this.appendAuditEvent(client, params));
    }

    try {
      await runQuery(executor, 'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [params.proposalId]);
      const eventSeq = await this.getNextAuditEventSeq(executor, params.proposalId);
      const result = await runQuery<AuditEventRecord>(
        executor,
        [
          'INSERT INTO audit_events (proposal_id, session_id, run_id, turn_id, event_seq, event_type, actor_type, request_id, payload_json)',
          'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
          'RETURNING *',
        ].join(' '),
        [
          params.proposalId,
          params.sessionId ?? null,
          params.runId ?? null,
          params.turnId ?? null,
          eventSeq,
          params.eventType,
          params.actorType,
          params.requestId ?? null,
          toJson(params.payloadJson ?? {}),
        ],
      );

      return normalizeAuditEvent(result.rows[0]);
    } catch (error) {
      if (isPgConstraint(error, 'audit_events_proposal_id_event_seq_key')) {
        throw new AppError(
          409,
          'alpha_audit_sequence_conflict',
          'The Alpha audit event sequence conflicted while appending an event',
          true,
          params.proposalId,
        );
      }

      throw error;
    }
  }

  async listAuditEvents(proposalId: string, executor?: SqlExecutor): Promise<AuditEventRecord[]> {
    const queryable = executor ?? this.database;
    const result = await runQuery<AuditEventRecord>(
      queryable,
      'SELECT * FROM audit_events WHERE proposal_id = $1 ORDER BY event_seq ASC',
      [proposalId],
    );

    return result.rows.map(normalizeAuditEvent);
  }

  async getAlphaProposalAggregate(proposalId: string, executor?: SqlExecutor): Promise<AlphaProposal> {
    const queryable = executor ?? this.database;
    const proposal = await this.getProposalRecord(proposalId, queryable);
    const [documents, sources, gaps, chats, generatedSections, auditEvents] = await Promise.all([
      this.listDocuments(proposalId, queryable),
      this.listSources(proposalId, queryable),
      this.listGaps(proposalId, queryable),
      this.listModuleChats(proposalId, queryable),
      this.listGeneratedSections(proposalId, queryable),
      this.listAuditEvents(proposalId, queryable),
    ]);

    return assertAlphaProposal({
      ...mapProposal(proposal),
      documents,
      sources,
      gaps,
      module_chats: chats,
      generated_sections: generatedSections,
      audit_refs: [
        ...proposal.audit_refs_json,
        ...auditEvents.map((event): AuditRef => ({ kind: 'audit_event', id: event.id })),
      ],
    });
  }

  private async getProposalRecord(proposalId: string, executor?: SqlExecutor): Promise<ProposalRecord> {
    const queryable = executor ?? this.database;
    const result = await runQuery<ProposalRecord>(
      queryable,
      'SELECT * FROM proposals WHERE id = $1 LIMIT 1',
      [proposalId],
    );
    const proposal = result.rows[0];

    if (!proposal) {
      throw new AppError(404, 'proposal_not_found', 'The requested proposal does not exist', false, proposalId);
    }

    return proposal;
  }

  private async listModuleChats(proposalId: string, executor: SqlExecutor): Promise<ModuleChat[]> {
    const result = await runQuery<ModuleChatRecord>(
      executor,
      'SELECT * FROM module_chats WHERE proposal_id = $1 ORDER BY started_at ASC, id ASC',
      [proposalId],
    );

    return Promise.all(
      result.rows.map(async (chat) => mapModuleChat(chat, await this.listChatTurns(chat.id, executor))),
    );
  }

  private async getGeneratedSection(sectionId: string, executor: SqlExecutor): Promise<GeneratedSection> {
    const result = await runQuery<GeneratedSectionRecord>(
      executor,
      'SELECT * FROM generated_sections WHERE id = $1 LIMIT 1',
      [sectionId],
    );
    const section = result.rows[0];

    if (!section) {
      throw new AppError(404, 'section_not_found', 'The requested generated section does not exist', false);
    }

    return mapGeneratedSection(section);
  }

  private async mapBasicReportRecord(record: BasicReportRecord, executor: SqlExecutor): Promise<BasicAlphaReport> {
    const [problemSection, solutionSection] = await Promise.all([
      this.getGeneratedSection(record.problem_section_id, executor),
      this.getGeneratedSection(record.solution_section_id, executor),
    ]);

    return assertBasicAlphaReport({
      report_id: record.id,
      proposal_id: record.proposal_id,
      report_status: record.report_status,
      schema_version: record.schema_version,
      structured_brief: record.structured_brief_json,
      current_gaps: record.current_gaps_json,
      problem_section: problemSection,
      solution_section: solutionSection,
      internal_sources: record.internal_sources_json,
      audit_refs: record.audit_refs_json,
      warnings: record.warnings_json,
      generated_at: toIso(record.generated_at),
    });
  }

  private async getNextAuditEventSeq(executor: SqlExecutor, proposalId: string): Promise<number> {
    const result = await runQuery<{ next_seq: string }>(
      executor,
      'SELECT COALESCE(MAX(event_seq), 0) + 1 AS next_seq FROM audit_events WHERE proposal_id = $1',
      [proposalId],
    );

    return Number(result.rows[0]?.next_seq ?? 1);
  }

  private async getNextSectionVersion(
    executor: SqlExecutor,
    proposalId: string,
    sectionKind: SectionKind,
  ): Promise<number> {
    const result = await runQuery<{ next_version: string }>(
      executor,
      [
        'SELECT COALESCE(MAX(section_version), 0) + 1 AS next_version',
        'FROM generated_sections',
        'WHERE proposal_id = $1 AND section_kind = $2',
      ].join(' '),
      [proposalId, sectionKind],
    );

    return Number(result.rows[0]?.next_version ?? 1);
  }
}

async function runQuery<T extends QueryResultRow>(
  executor: SqlExecutor,
  text: string,
  values: unknown[] = [],
): Promise<QueryResult<T>> {
  return (executor.query as (queryText: string, queryValues?: unknown[]) => Promise<QueryResult<T>>)(text, values);
}

function mapProposal(record: ProposalRecord): AlphaProposal {
  return assertAlphaProposal({
    proposal_id: record.id,
    ...(record.user_id ? { user_id: record.user_id } : {}),
    proposal_status: record.proposal_status,
    project_title: record.project_title,
    goal: record.goal,
    structured_brief: record.structured_brief_json,
    documents: [],
    sources: [],
    gaps: [],
    module_chats: [],
    generated_sections: [],
    audit_refs: record.audit_refs_json,
    warnings: record.warnings_json,
    schema_version: record.schema_version,
    created_at: toIso(record.created_at),
    updated_at: toIso(record.updated_at),
    ...(Object.keys(record.metadata_json).length > 0 ? { metadata: record.metadata_json } : {}),
  });
}

function mapDocument(record: ProposalDocumentRecord): ProposalDocument {
  return assertProposalDocument({
    document_id: record.id,
    proposal_id: record.proposal_id,
    source_kind: record.source_kind,
    document_status: record.document_status,
    ...(record.file_name ? { file_name: record.file_name } : {}),
    ...(record.mime_type ? { mime_type: record.mime_type } : {}),
    ...(record.sha256 ? { sha256: record.sha256 } : {}),
    ...(record.pasted_text ? { pasted_text: record.pasted_text } : {}),
    ...(record.normalized_text ? { normalized_text: record.normalized_text } : {}),
    ...(record.source_refs_json.length > 0 ? { source_refs: record.source_refs_json } : {}),
    warnings: record.warnings_json,
    created_at: toIso(record.created_at),
    ...(Object.keys(record.metadata_json).length > 0 ? { metadata: record.metadata_json } : {}),
  });
}

function mapSource(record: ProposalSourceRecord): ProposalSource {
  return assertProposalSource({
    source_id: record.id,
    source_kind: record.source_kind,
    label: record.label,
    ...(record.document_id ? { document_id: record.document_id } : {}),
    ...(record.turn_id ? { turn_id: record.turn_id } : {}),
    ...(record.section_id ? { section_id: record.section_id } : {}),
    ...(record.span_json ? { span: record.span_json } : {}),
    created_at: toIso(record.created_at),
    ...(Object.keys(record.metadata_json).length > 0 ? { metadata: record.metadata_json } : {}),
  });
}

export function mapGap(record: AlphaGapRecord): AlphaGap {
  return assertAlphaGap({
    gap_id: record.id,
    proposal_id: record.proposal_id,
    module: record.module,
    gap_kind: record.gap_kind,
    gap_status: record.gap_status,
    origin: record.origin,
    field: record.field,
    description: record.description,
    absence: record.absence_json,
    ...(record.question_hint ? { question_hint: record.question_hint } : {}),
    source_refs: record.source_refs_json,
    ...(record.resolved_by_turn_id ? { resolved_by_turn_id: record.resolved_by_turn_id } : {}),
    audit_refs: record.audit_refs_json,
    warnings: record.warnings_json,
    created_at: toIso(record.created_at),
    updated_at: toIso(record.updated_at),
  });
}

export function mapModuleChat(record: ModuleChatRecord, turns: ChatTurn[]): ModuleChat {
  return assertModuleChat({
    chat_id: record.id,
    proposal_id: record.proposal_id,
    module: record.module,
    chat_status: record.chat_status,
    turns,
    ...(record.active_turn_id ? { active_turn_id: record.active_turn_id } : {}),
    started_at: toIso(record.started_at),
    ...(record.completed_at ? { completed_at: toIso(record.completed_at) } : {}),
    warnings: record.warnings_json,
  });
}

export function mapChatTurn(record: ChatTurnRecord): ChatTurn {
  return assertChatTurn({
    turn_id: record.id,
    chat_id: record.chat_id,
    proposal_id: record.proposal_id,
    module: record.module,
    turn_seq: record.turn_seq,
    question_text: record.question_text,
    ...(record.answer_text ? { answer_text: record.answer_text } : {}),
    turn_status: record.turn_status,
    ...(record.agent_status ? { agent_status: record.agent_status } : {}),
    diagnosis: record.diagnosis_json,
    source_refs: record.source_refs_json,
    gap_refs: record.gap_refs_json,
    audit_refs: record.audit_refs_json,
    warnings: record.warnings_json,
    created_at: toIso(record.created_at),
    ...(record.completed_at ? { completed_at: toIso(record.completed_at) } : {}),
  });
}

export function mapGeneratedSection(record: GeneratedSectionRecord): GeneratedSection {
  return assertGeneratedSection({
    section_id: record.id,
    proposal_id: record.proposal_id,
    section_kind: record.section_kind,
    section_status: record.section_status,
    section_version: record.section_version,
    title: record.title,
    content_markdown: record.content_markdown,
    source_refs: record.source_refs_json,
    gap_refs: record.gap_refs_json,
    ...(record.generated_by_run_id ? { generated_by_run_id: record.generated_by_run_id } : {}),
    ...(record.supersedes_section_id ? { supersedes_section_id: record.supersedes_section_id } : {}),
    warnings: record.warnings_json,
    created_at: toIso(record.created_at),
  });
}

function normalizeAuditEvent(record: AuditEventRecord): AuditEventRecord {
  return {
    ...record,
    id: String(record.id),
    event_seq: Number(record.event_seq),
    created_at: toIso(record.created_at),
  };
}

function toIso(value: string | Date): string {
  return new Date(value).toISOString();
}

function toJson(value: unknown): string {
  return JSON.stringify(value);
}

function toAlphaPersistenceError(
  error: unknown,
  proposalId: string,
  constraints: Record<string, [number, string, string]>,
): AppError | unknown {
  const constraint = getPgConstraint(error);
  if (constraint && constraints[constraint]) {
    const [statusCode, errorCode, safeMessage] = constraints[constraint];
    return new AppError(statusCode, errorCode, safeMessage, false, proposalId, { constraint });
  }

  return error;
}

function isPgConstraint(error: unknown, constraintName: string): boolean {
  return getPgConstraint(error) === constraintName;
}

function getPgConstraint(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('constraint' in error)) {
    return null;
  }

  const constraint = (error as { constraint?: unknown }).constraint;
  return typeof constraint === 'string' ? constraint : null;
}
