import type {
  AgentRun,
  AgentStatus,
  ConversationTurn,
  ErrorResponse,
  ProblemDefinitionState,
  ProposalReplyResponse,
  ProposalStartResponse,
  SessionAuditView,
  SessionEvent,
  SessionRecord,
  SessionStatus,
  Snapshot,
  StructuredBrief,
} from '../domain/contracts';

type JsonRecord = Record<string, unknown>;

const AGENT_STATUSES: AgentStatus[] = ['continue', 'done', 'blocked'];
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

function expectEnum<T extends string>(value: unknown, label: string, choices: readonly T[]): T {
  const stringValue = expectString(value, label);

  if (!choices.includes(stringValue as T)) {
    throw new Error(`Expected ${label} to be one of: ${choices.join(', ')}`);
  }

  return stringValue as T;
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
    model_name: expectString(record.model_name, `${label}.model_name`),
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
  const record = expectRecord(value, 'proposal start response');

  return {
    session_id: expectString(record.session_id, 'proposal start response.session_id'),
    stage: expectEnum(record.stage, 'proposal start response.stage', ['problem_definition']),
    structured_brief: parseStructuredBrief(
      record.structured_brief,
      'proposal start response.structured_brief',
    ),
    detected_gaps: expectStringArray(
      record.detected_gaps,
      'proposal start response.detected_gaps',
    ),
    next_question: expectString(record.next_question, 'proposal start response.next_question'),
    agent_status: expectEnum(
      record.agent_status,
      'proposal start response.agent_status',
      AGENT_STATUSES,
    ),
    warnings: expectStringArray(record.warnings, 'proposal start response.warnings'),
  };
}

export function parseProposalReplyResponse(value: unknown): ProposalReplyResponse {
  const record = expectRecord(value, 'proposal reply response');

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
    completion_reason: expectString(
      record.completion_reason,
      'proposal reply response.completion_reason',
    ),
    warnings: expectStringArray(record.warnings, 'proposal reply response.warnings'),
  };
}

export function parseErrorResponse(value: unknown): ErrorResponse {
  const record = expectRecord(value, 'error response');

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

export function parseSessionAuditView(value: unknown): SessionAuditView {
  const record = expectRecord(value, 'session audit view');

  return {
    session: parseSessionRecord(record.session),
    turns: expectArray(record.turns, 'session audit view.turns').map((item, index) =>
      parseConversationTurn(item, `session audit view.turns[${index}]`),
    ),
    runs: expectArray(record.runs, 'session audit view.runs').map((item, index) =>
      parseAgentRun(item, `session audit view.runs[${index}]`),
    ),
    snapshots: expectArray(record.snapshots, 'session audit view.snapshots').map((item, index) =>
      parseSnapshot(item, `session audit view.snapshots[${index}]`),
    ),
    events: expectArray(record.events, 'session audit view.events').map((item, index) =>
      parseSessionEvent(item, `session audit view.events[${index}]`),
    ),
  };
}
