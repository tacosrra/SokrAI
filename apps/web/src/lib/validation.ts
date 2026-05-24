import type {
  AgentRun,
  AgentStatus,
  AlphaGap,
  ChatStatus,
  ChatTurn,
  ChatTurnStatus,
  ConversationTurn,
  DocumentStatus,
  ErrorResponse,
  GeneratedSection,
  GapKind,
  GapOrigin,
  GapStatus,
  ModuleChat,
  ProblemDefinitionState,
  ProposalDocument,
  ProposalDocumentSourceKind,
  ProposalReplyResponse,
  ProposalSource,
  ProposalSourceKind,
  ProposalStartResponse,
  RequestExecutionResponse,
  SessionAuditView,
  SessionEvent,
  SessionRecord,
  SessionStatus,
  Snapshot,
  StructuredBrief,
} from '../domain/contracts';

type JsonRecord = Record<string, unknown>;

const WRAPPER_KEYS = ['body', 'data', 'payload', 'result', 'response', 'output', 'json'] as const;

const AGENT_STATUSES: AgentStatus[] = ['continue', 'done', 'blocked'];
const PROPOSAL_SOURCE_KINDS: ProposalSourceKind[] = [
  'pasted_text',
  'uploaded_file',
  'extracted_text',
  'user_answer',
  'generated_section',
];
const PROPOSAL_DOCUMENT_SOURCE_KINDS: ProposalDocumentSourceKind[] = [
  'pasted_text',
  'uploaded_file',
  'extracted_text',
];
const DOCUMENT_STATUSES: DocumentStatus[] = ['received', 'normalized', 'unsupported', 'failed'];
const GAP_KINDS: GapKind[] = [
  'missing_information',
  'ambiguous_information',
  'unsupported_claim',
  'needs_user_confirmation',
];
const GAP_STATUSES: GapStatus[] = ['open', 'in_progress', 'resolved', 'deferred', 'not_applicable'];
const CHAT_STATUSES: ChatStatus[] = [
  'not_started',
  'active',
  'waiting_for_user',
  'ready_to_generate',
  'completed',
  'blocked',
  'failed',
];
const CHAT_TURN_STATUSES: ChatTurnStatus[] = [
  'awaiting_user',
  'processing',
  'resolved',
  'failed',
  'skipped',
];
const GAP_ORIGINS: GapOrigin[] = [
  'structured_brief_field',
  'structured_brief_missing_information',
  'structured_brief_ambiguity',
  'proposal_source',
  'system_rule',
];
const SESSION_STATUSES: SessionStatus[] = [
  'active',
  'waiting_for_user',
  'completed',
  'blocked',
  'failed',
];

function expectRecord(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Expected ${label} to be an object`);
  }

  return value as JsonRecord;
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Expected ${label} to be a string`);
  }

  return value;
}

function expectNullableString(value: unknown, label: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return expectString(value, label);
}

function expectOptionalString(value: unknown, fallback: string, label: string): string {
  if (value === null || value === undefined) {
    return fallback;
  }

  return expectString(value, label);
}

function expectNumber(value: unknown, label: string): number {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);

    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  throw new Error(`Expected ${label} to be a number`);
}

function expectBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Expected ${label} to be a boolean`);
  }

  return value;
}

function expectArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Expected ${label} to be an array`);
  }

  return value;
}

function expectStringArray(value: unknown, label: string): string[] {
  return expectArray(value, label).map((item, index) =>
    expectString(item, `${label}[${index}]`),
  );
}

function expectOptionalStringArray(value: unknown, fallback: string[], label: string): string[] {
  if (value === null || value === undefined) {
    return fallback;
  }

  return expectStringArray(value, label);
}

function expectOptionalArray(value: unknown, fallback: unknown[], label: string): unknown[] {
  if (value === null || value === undefined) {
    return fallback;
  }

  return expectArray(value, label);
}

function expectEnum<T extends string>(value: unknown, label: string, choices: readonly T[]): T {
  const stringValue = expectString(value, label);

  if (!choices.includes(stringValue as T)) {
    throw new Error(`Expected ${label} to be one of: ${choices.join(', ')}`);
  }

  return stringValue as T;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function looksLikeJsonString(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

function unwrapContractValue(value: unknown, seen = new Set<unknown>()): unknown {
  if (typeof value === 'string' && looksLikeJsonString(value)) {
    try {
      return unwrapContractValue(JSON.parse(value), seen);
    } catch {
      return value;
    }
  }

  if (Array.isArray(value)) {
    if (value.length === 1) {
      return unwrapContractValue(value[0], seen);
    }

    return value;
  }

  if (!isRecord(value) || seen.has(value)) {
    return value;
  }

  seen.add(value);

  for (const key of WRAPPER_KEYS) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      const unwrapped = unwrapContractValue(value[key], seen);

      if (unwrapped !== value[key]) {
        return unwrapped;
      }

      if (isRecord(unwrapped) || Array.isArray(unwrapped)) {
        return unwrapped;
      }
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(value, 'items') &&
    Array.isArray(value.items) &&
    value.items.length === 1
  ) {
    return unwrapContractValue(value.items[0], seen);
  }

  return value;
}

function parseStructuredBrief(value: unknown, label: string): StructuredBrief {
  const record = expectRecord(value, label);

  return {
    project_title: expectString(record.project_title, `${label}.project_title`),
    goal: expectString(record.goal, `${label}.goal`),
    target_user: expectString(record.target_user, `${label}.target_user`),
    problem_owner: expectString(record.problem_owner, `${label}.problem_owner`),
    problem_statement: expectString(record.problem_statement, `${label}.problem_statement`),
    evidence_of_problem: expectString(record.evidence_of_problem, `${label}.evidence_of_problem`),
    current_alternatives: expectString(
      record.current_alternatives,
      `${label}.current_alternatives`,
    ),
    scope: expectString(record.scope, `${label}.scope`),
    constraints_known: expectStringArray(record.constraints_known, `${label}.constraints_known`),
    assumptions: expectStringArray(record.assumptions, `${label}.assumptions`),
    ambiguities: expectStringArray(record.ambiguities, `${label}.ambiguities`),
    missing_information: expectStringArray(
      record.missing_information,
      `${label}.missing_information`,
    ),
  };
}

function hasProblemDefinitionShape(record: JsonRecord): boolean {
  return [
    'problem_owner',
    'problem_statement',
    'evidence_of_problem',
    'scope',
    'current_alternatives',
    'assumptions',
    'ambiguities_remaining',
  ].every((key) => Object.prototype.hasOwnProperty.call(record, key));
}

function parseProblemDefinitionState(
  value: unknown,
  label: string,
): ProblemDefinitionState | null {
  if (value === null || value === undefined) {
    return null;
  }

  const record = expectRecord(value, label);

  if (Object.keys(record).length === 0) {
    return null;
  }

  if (!hasProblemDefinitionShape(record)) {
    throw new Error(`Expected ${label} to match problem definition state`);
  }

  return {
    problem_owner: expectString(record.problem_owner, `${label}.problem_owner`),
    problem_statement: expectString(record.problem_statement, `${label}.problem_statement`),
    evidence_of_problem: expectString(
      record.evidence_of_problem,
      `${label}.evidence_of_problem`,
    ),
    scope: expectString(record.scope, `${label}.scope`),
    current_alternatives: expectString(
      record.current_alternatives,
      `${label}.current_alternatives`,
    ),
    assumptions: expectStringArray(record.assumptions, `${label}.assumptions`),
    ambiguities_remaining: expectStringArray(
      record.ambiguities_remaining,
      `${label}.ambiguities_remaining`,
    ),
  };
}

function parseSessionRecord(value: unknown): SessionRecord {
  const record = expectRecord(value, 'session');

  return {
    id: expectString(record.id, 'session.id'),
    project_title: expectString(record.project_title, 'session.project_title'),
    goal: expectString(record.goal, 'session.goal'),
    current_stage: expectEnum(record.current_stage, 'session.current_stage', ['problem_definition']),
    current_agent: expectEnum(record.current_agent, 'session.current_agent', [
      'problem_definition_agent',
    ]),
    status: expectEnum(record.status, 'session.status', SESSION_STATUSES),
    current_turn_seq: expectNumber(record.current_turn_seq, 'session.current_turn_seq'),
    state_version: expectNumber(record.state_version, 'session.state_version'),
    latest_structured_brief_json: parseStructuredBrief(
      record.latest_structured_brief_json,
      'session.latest_structured_brief_json',
    ),
    latest_problem_definition_json: parseProblemDefinitionState(
      record.latest_problem_definition_json,
      'session.latest_problem_definition_json',
    ),
    latest_snapshot_id: expectNullableString(record.latest_snapshot_id, 'session.latest_snapshot_id'),
    latest_successful_run_id: expectNullableString(
      record.latest_successful_run_id,
      'session.latest_successful_run_id',
    ),
    completion_reason: expectNullableString(record.completion_reason, 'session.completion_reason'),
  };
}

function parseProposalSource(value: unknown, label: string): ProposalSource {
  const record = expectRecord(value, label);
  const span =
    record.span === null || record.span === undefined
      ? undefined
      : expectRecord(record.span, `${label}.span`);

  return {
    source_id: expectString(record.source_id, `${label}.source_id`),
    source_kind: expectEnum(record.source_kind, `${label}.source_kind`, PROPOSAL_SOURCE_KINDS),
    label: expectString(record.label, `${label}.label`),
    document_id:
      record.document_id === null || record.document_id === undefined
        ? undefined
        : expectString(record.document_id, `${label}.document_id`),
    turn_id:
      record.turn_id === null || record.turn_id === undefined
        ? undefined
        : expectString(record.turn_id, `${label}.turn_id`),
    section_id:
      record.section_id === null || record.section_id === undefined
        ? undefined
        : expectString(record.section_id, `${label}.section_id`),
    span: span
      ? {
          start_char: expectNumber(span.start_char, `${label}.span.start_char`),
          end_char: expectNumber(span.end_char, `${label}.span.end_char`),
        }
      : undefined,
    created_at: expectString(record.created_at, `${label}.created_at`),
    metadata:
      record.metadata === null || record.metadata === undefined
        ? undefined
        : expectRecord(record.metadata, `${label}.metadata`),
  };
}

function parseProposalDocument(value: unknown, label: string): ProposalDocument {
  const record = expectRecord(value, label);

  return {
    document_id: expectString(record.document_id, `${label}.document_id`),
    proposal_id: expectString(record.proposal_id, `${label}.proposal_id`),
    source_kind: expectEnum(
      record.source_kind,
      `${label}.source_kind`,
      PROPOSAL_DOCUMENT_SOURCE_KINDS,
    ),
    document_status: expectEnum(record.document_status, `${label}.document_status`, DOCUMENT_STATUSES),
    file_name:
      record.file_name === null || record.file_name === undefined
        ? undefined
        : expectString(record.file_name, `${label}.file_name`),
    mime_type:
      record.mime_type === null || record.mime_type === undefined
        ? undefined
        : expectString(record.mime_type, `${label}.mime_type`),
    sha256:
      record.sha256 === null || record.sha256 === undefined
        ? undefined
        : expectString(record.sha256, `${label}.sha256`),
    pasted_text:
      record.pasted_text === null || record.pasted_text === undefined
        ? undefined
        : expectString(record.pasted_text, `${label}.pasted_text`),
    normalized_text:
      record.normalized_text === null || record.normalized_text === undefined
        ? undefined
        : expectString(record.normalized_text, `${label}.normalized_text`),
    source_refs: expectOptionalArray(record.source_refs, [], `${label}.source_refs`).map((item, index) =>
      parseProposalSource(item, `${label}.source_refs[${index}]`),
    ),
    warnings: expectOptionalStringArray(record.warnings, [], `${label}.warnings`),
    created_at: expectString(record.created_at, `${label}.created_at`),
    metadata:
      record.metadata === null || record.metadata === undefined
        ? undefined
        : expectRecord(record.metadata, `${label}.metadata`),
  };
}

function parseAuditRef(value: unknown, label: string) {
  const auditRef = expectRecord(value, label);

  return {
    kind: expectEnum(auditRef.kind, `${label}.kind`, [
      'agent_run',
      'audit_event',
      'snapshot',
      'chat_turn',
    ]),
    id: expectString(auditRef.id, `${label}.id`),
  };
}

function parseAlphaGap(value: unknown, label: string): AlphaGap {
  const record = expectRecord(value, label);
  const absence = expectRecord(record.absence, `${label}.absence`);

  return {
    gap_id: expectString(record.gap_id, `${label}.gap_id`),
    proposal_id: expectString(record.proposal_id, `${label}.proposal_id`),
    module: expectEnum(record.module, `${label}.module`, ['problem', 'solution']),
    gap_kind: expectEnum(record.gap_kind, `${label}.gap_kind`, GAP_KINDS),
    gap_status: expectEnum(record.gap_status, `${label}.gap_status`, GAP_STATUSES),
    origin: expectEnum(record.origin, `${label}.origin`, GAP_ORIGINS),
    field: expectString(record.field, `${label}.field`),
    description: expectString(record.description, `${label}.description`),
    absence: {
      is_absent: expectBoolean(absence.is_absent, `${label}.absence.is_absent`),
      checked_fields: expectStringArray(absence.checked_fields, `${label}.absence.checked_fields`),
      reason: expectString(absence.reason, `${label}.absence.reason`),
    },
    question_hint:
      record.question_hint === null || record.question_hint === undefined
        ? undefined
        : expectString(record.question_hint, `${label}.question_hint`),
    source_refs: expectOptionalArray(record.source_refs, [], `${label}.source_refs`).map((item, index) =>
      parseProposalSource(item, `${label}.source_refs[${index}]`),
    ),
    resolved_by_turn_id:
      record.resolved_by_turn_id === null || record.resolved_by_turn_id === undefined
        ? undefined
        : expectString(record.resolved_by_turn_id, `${label}.resolved_by_turn_id`),
    audit_refs: expectOptionalArray(record.audit_refs, [], `${label}.audit_refs`).map((item, index) =>
      parseAuditRef(item, `${label}.audit_refs[${index}]`),
    ),
    warnings: expectOptionalStringArray(record.warnings, [], `${label}.warnings`),
    created_at: expectString(record.created_at, `${label}.created_at`),
    updated_at: expectString(record.updated_at, `${label}.updated_at`),
  };
}

function parseChatTurn(value: unknown, label: string): ChatTurn {
  const record = expectRecord(value, label);

  return {
    turn_id: expectString(record.turn_id, `${label}.turn_id`),
    chat_id: expectString(record.chat_id, `${label}.chat_id`),
    proposal_id: expectString(record.proposal_id, `${label}.proposal_id`),
    module: expectEnum(record.module, `${label}.module`, ['problem', 'solution']),
    turn_seq: expectNumber(record.turn_seq, `${label}.turn_seq`),
    question_text: expectString(record.question_text, `${label}.question_text`),
    answer_text:
      record.answer_text === null || record.answer_text === undefined
        ? undefined
        : expectString(record.answer_text, `${label}.answer_text`),
    turn_status: expectEnum(record.turn_status, `${label}.turn_status`, CHAT_TURN_STATUSES),
    agent_status:
      record.agent_status === null || record.agent_status === undefined
        ? undefined
        : expectEnum(record.agent_status, `${label}.agent_status`, AGENT_STATUSES),
    diagnosis: expectOptionalStringArray(record.diagnosis, [], `${label}.diagnosis`),
    source_refs: expectOptionalArray(record.source_refs, [], `${label}.source_refs`).map((item, index) =>
      parseProposalSource(item, `${label}.source_refs[${index}]`),
    ),
    gap_refs: expectOptionalStringArray(record.gap_refs, [], `${label}.gap_refs`),
    audit_refs: expectOptionalArray(record.audit_refs, [], `${label}.audit_refs`).map((item, index) =>
      parseAuditRef(item, `${label}.audit_refs[${index}]`),
    ),
    warnings: expectOptionalStringArray(record.warnings, [], `${label}.warnings`),
    created_at: expectString(record.created_at, `${label}.created_at`),
    completed_at:
      record.completed_at === null || record.completed_at === undefined
        ? undefined
        : expectString(record.completed_at, `${label}.completed_at`),
  };
}

function parseModuleChat(value: unknown, label: string): ModuleChat {
  const record = expectRecord(value, label);

  return {
    chat_id: expectString(record.chat_id, `${label}.chat_id`),
    proposal_id: expectString(record.proposal_id, `${label}.proposal_id`),
    module: expectEnum(record.module, `${label}.module`, ['problem', 'solution']),
    chat_status: expectEnum(record.chat_status, `${label}.chat_status`, CHAT_STATUSES),
    turns: expectOptionalArray(record.turns, [], `${label}.turns`).map((item, index) =>
      parseChatTurn(item, `${label}.turns[${index}]`),
    ),
    active_turn_id:
      record.active_turn_id === null || record.active_turn_id === undefined
        ? undefined
        : expectString(record.active_turn_id, `${label}.active_turn_id`),
    started_at: expectString(record.started_at, `${label}.started_at`),
    completed_at:
      record.completed_at === null || record.completed_at === undefined
        ? undefined
        : expectString(record.completed_at, `${label}.completed_at`),
    warnings: expectOptionalStringArray(record.warnings, [], `${label}.warnings`),
  };
}

function parseGeneratedSection(value: unknown, label: string): GeneratedSection {
  const record = expectRecord(value, label);

  return {
    section_id: expectString(record.section_id, `${label}.section_id`),
    proposal_id: expectString(record.proposal_id, `${label}.proposal_id`),
    section_kind: expectEnum(record.section_kind, `${label}.section_kind`, ['problem', 'solution']),
    section_status: expectEnum(record.section_status, `${label}.section_status`, [
      'draft',
      'generated',
      'accepted',
      'needs_revision',
      'superseded',
    ]),
    section_version: expectNumber(record.section_version, `${label}.section_version`),
    title: expectString(record.title, `${label}.title`),
    content_markdown: expectString(record.content_markdown, `${label}.content_markdown`),
    source_refs: expectOptionalArray(record.source_refs, [], `${label}.source_refs`).map((item, index) =>
      parseProposalSource(item, `${label}.source_refs[${index}]`),
    ),
    gap_refs: expectOptionalStringArray(record.gap_refs, [], `${label}.gap_refs`),
    generated_by_run_id:
      record.generated_by_run_id === null || record.generated_by_run_id === undefined
        ? undefined
        : expectString(record.generated_by_run_id, `${label}.generated_by_run_id`),
    supersedes_section_id:
      record.supersedes_section_id === null || record.supersedes_section_id === undefined
        ? undefined
        : expectString(record.supersedes_section_id, `${label}.supersedes_section_id`),
    warnings: expectOptionalStringArray(record.warnings, [], `${label}.warnings`),
    created_at: expectString(record.created_at, `${label}.created_at`),
  };
}

function parseConversationTurn(value: unknown, label: string): ConversationTurn {
  const record = expectRecord(value, label);

  return {
    id: expectString(record.id, `${label}.id`),
    session_id: expectString(record.session_id, `${label}.session_id`),
    turn_seq: expectNumber(record.turn_seq, `${label}.turn_seq`),
    question_text: expectString(record.question_text, `${label}.question_text`),
    answer_text: expectNullableString(record.answer_text, `${label}.answer_text`),
    status: expectEnum(record.status, `${label}.status`, [
      'awaiting_user',
      'processing',
      'resolved',
      'failed',
    ]),
    agent_status:
      record.agent_status === null || record.agent_status === undefined
        ? null
        : expectEnum(record.agent_status, `${label}.agent_status`, AGENT_STATUSES),
    diagnosis_json: expectStringArray(record.diagnosis_json, `${label}.diagnosis_json`),
    updated_problem_definition_json: parseProblemDefinitionState(
      record.updated_problem_definition_json,
      `${label}.updated_problem_definition_json`,
    ),
    completion_reason: expectNullableString(
      record.completion_reason,
      `${label}.completion_reason`,
    ),
  };
}

function parseAgentRun(value: unknown, label: string): AgentRun {
  const record = expectRecord(value, label);

  return {
    id: expectString(record.id, `${label}.id`),
    session_id: expectString(record.session_id, `${label}.session_id`),
    turn_seq:
      record.turn_seq === null || record.turn_seq === undefined
        ? null
        : expectNumber(record.turn_seq, `${label}.turn_seq`),
    request_id: expectNullableString(record.request_id, `${label}.request_id`),
    run_purpose: expectEnum(record.run_purpose, `${label}.run_purpose`, [
      'brief_extraction',
      'problem_definition',
      'json_repair',
    ]),
    agent_name: expectString(record.agent_name, `${label}.agent_name`),
    prompt_name: expectString(record.prompt_name, `${label}.prompt_name`),
    prompt_version: expectString(record.prompt_version, `${label}.prompt_version`),
    prompt_sha256: expectString(record.prompt_sha256, `${label}.prompt_sha256`),
    model_provider: expectString(record.model_provider, `${label}.model_provider`),
    model_name: expectString(record.model_name, `${label}.model_name`),
    model_params_json: expectRecord(record.model_params_json, `${label}.model_params_json`),
    raw_model_output: expectNullableString(
      record.raw_model_output,
      `${label}.raw_model_output`,
    ),
    validated_output_json:
      record.validated_output_json === null || record.validated_output_json === undefined
        ? null
        : expectRecord(record.validated_output_json, `${label}.validated_output_json`),
    status: expectEnum(record.status, `${label}.status`, [
      'completed',
      'validation_failed',
      'repair_failed',
      'model_failed',
      'controlled_error',
    ]),
  };
}

function parseSnapshot(value: unknown, label: string): Snapshot {
  const record = expectRecord(value, label);

  return {
    id: expectString(record.id, `${label}.id`),
    session_id: expectString(record.session_id, `${label}.session_id`),
    snapshot_seq: expectNumber(record.snapshot_seq, `${label}.snapshot_seq`),
    state_version: expectNumber(record.state_version, `${label}.state_version`),
    source_turn_seq:
      record.source_turn_seq === null || record.source_turn_seq === undefined
        ? null
        : expectNumber(record.source_turn_seq, `${label}.source_turn_seq`),
    source_run_id: expectNullableString(record.source_run_id, `${label}.source_run_id`),
    structured_brief_json: parseStructuredBrief(
      record.structured_brief_json,
      `${label}.structured_brief_json`,
    ),
    current_problem_definition_json: parseProblemDefinitionState(
      record.current_problem_definition_json,
      `${label}.current_problem_definition_json`,
    ),
    detected_gaps_json: expectStringArray(record.detected_gaps_json, `${label}.detected_gaps_json`),
    next_question_text: expectNullableString(record.next_question_text, `${label}.next_question_text`),
    agent_status: expectEnum(record.agent_status, `${label}.agent_status`, AGENT_STATUSES),
    completion_reason: expectNullableString(record.completion_reason, `${label}.completion_reason`),
    warnings_json: expectStringArray(record.warnings_json, `${label}.warnings_json`),
  };
}

function parseSessionEvent(value: unknown, label: string): SessionEvent {
  const record = expectRecord(value, label);

  return {
    id: expectString(record.id, `${label}.id`),
    session_id: expectString(record.session_id, `${label}.session_id`),
    turn_seq:
      record.turn_seq === null || record.turn_seq === undefined
        ? null
        : expectNumber(record.turn_seq, `${label}.turn_seq`),
    run_id: expectNullableString(record.run_id, `${label}.run_id`),
    event_seq: expectNumber(record.event_seq, `${label}.event_seq`),
    event_type: expectString(record.event_type, `${label}.event_type`),
    actor_type: expectString(record.actor_type, `${label}.actor_type`),
    request_id: expectNullableString(record.request_id, `${label}.request_id`),
    payload_json:
      record.payload_json === null || record.payload_json === undefined
        ? {}
        : expectRecord(record.payload_json, `${label}.payload_json`),
    created_at: record.created_at ? expectString(record.created_at, `${label}.created_at`) : undefined,
  };
}

export function parseProposalStartResponse(value: unknown): ProposalStartResponse {
  const record = expectRecord(
    unwrapContractValue(value),
    'proposal start response',
  );

  return {
    session_id: expectString(record.session_id, 'proposal start response.session_id'),
    stage: expectEnum(record.stage, 'proposal start response.stage', ['problem_definition']),
    structured_brief: parseStructuredBrief(
      record.structured_brief,
      'proposal start response.structured_brief',
    ),
    detected_gaps: expectOptionalStringArray(
      record.detected_gaps,
      [],
      'proposal start response.detected_gaps',
    ),
    next_question: expectString(record.next_question, 'proposal start response.next_question'),
    agent_status: expectEnum(
      record.agent_status,
      'proposal start response.agent_status',
      AGENT_STATUSES,
    ),
    warnings: expectOptionalStringArray(record.warnings, [], 'proposal start response.warnings'),
  };
}

export function parseProposalReplyResponse(value: unknown): ProposalReplyResponse {
  const record = expectRecord(
    unwrapContractValue(value),
    'proposal reply response',
  );

  return {
    session_id: expectString(record.session_id, 'proposal reply response.session_id'),
    stage: expectEnum(record.stage, 'proposal reply response.stage', ['problem_definition']),
    agent_status: expectEnum(
      record.agent_status,
      'proposal reply response.agent_status',
      AGENT_STATUSES,
    ),
    updated_problem_definition: parseProblemDefinitionState(
      record.updated_problem_definition,
      'proposal reply response.updated_problem_definition',
    )!,
    diagnosis: expectStringArray(record.diagnosis, 'proposal reply response.diagnosis'),
    next_question: expectString(record.next_question, 'proposal reply response.next_question'),
    completion_reason: expectOptionalString(
      record.completion_reason,
      '',
      'proposal reply response.completion_reason',
    ),
    warnings: expectOptionalStringArray(record.warnings, [], 'proposal reply response.warnings'),
  };
}

export function parseErrorResponse(value: unknown): ErrorResponse {
  const record = expectRecord(unwrapContractValue(value), 'error response');

  return {
    error_code: expectString(record.error_code, 'error response.error_code'),
    safe_message: expectString(record.safe_message, 'error response.safe_message'),
    request_id: expectString(record.request_id, 'error response.request_id'),
    session_id:
      record.session_id === null || record.session_id === undefined
        ? undefined
        : expectString(record.session_id, 'error response.session_id'),
    retryable: expectBoolean(record.retryable, 'error response.retryable'),
  };
}

export function parseRequestExecutionResponse(value: unknown): RequestExecutionResponse {
  const record = expectRecord(
    unwrapContractValue(value),
    'request execution response',
  );

  return {
    request_id: expectString(record.request_id, 'request execution response.request_id'),
    request_kind: expectEnum(
      record.request_kind,
      'request execution response.request_kind',
      ['proposal_start', 'proposal_reply', 'unknown'],
    ),
    status: expectEnum(
      record.status,
      'request execution response.status',
      ['pending', 'completed', 'failed', 'not_found'],
    ),
    session_id:
      record.session_id === null || record.session_id === undefined
        ? undefined
        : expectString(record.session_id, 'request execution response.session_id'),
    error_code:
      record.error_code === null || record.error_code === undefined
        ? undefined
        : expectString(record.error_code, 'request execution response.error_code'),
    safe_message:
      record.safe_message === null || record.safe_message === undefined
        ? undefined
        : expectString(record.safe_message, 'request execution response.safe_message'),
    retryable:
      record.retryable === null || record.retryable === undefined
        ? undefined
        : expectBoolean(record.retryable, 'request execution response.retryable'),
  };
}

export function parseSessionAuditView(value: unknown): SessionAuditView {
  const record = expectRecord(unwrapContractValue(value), 'session audit view');

  return {
    session: parseSessionRecord(record.session),
    documents: expectArray(record.documents, 'session audit view.documents').map((item, index) =>
      parseProposalDocument(item, `session audit view.documents[${index}]`),
    ),
    sources: expectArray(record.sources, 'session audit view.sources').map((item, index) =>
      parseProposalSource(item, `session audit view.sources[${index}]`),
    ),
    gaps: expectArray(record.gaps, 'session audit view.gaps').map((item, index) =>
      parseAlphaGap(item, `session audit view.gaps[${index}]`),
    ),
    module_chats: expectOptionalArray(record.module_chats, [], 'session audit view.module_chats').map((item, index) =>
      parseModuleChat(item, `session audit view.module_chats[${index}]`),
    ),
    generated_sections: expectOptionalArray(record.generated_sections, [], 'session audit view.generated_sections').map((item, index) =>
      parseGeneratedSection(item, `session audit view.generated_sections[${index}]`),
    ),
    turns: expectOptionalArray(record.turns, [], 'session audit view.turns').map((item, index) =>
      parseConversationTurn(item, `session audit view.turns[${index}]`),
    ),
    runs: expectOptionalArray(record.runs, [], 'session audit view.runs').map((item, index) =>
      parseAgentRun(item, `session audit view.runs[${index}]`),
    ),
    snapshots: expectOptionalArray(record.snapshots, [], 'session audit view.snapshots').map((item, index) =>
      parseSnapshot(item, `session audit view.snapshots[${index}]`),
    ),
    events: expectOptionalArray(record.events, [], 'session audit view.events').map((item, index) =>
      parseSessionEvent(item, `session audit view.events[${index}]`),
    ),
  };
}
