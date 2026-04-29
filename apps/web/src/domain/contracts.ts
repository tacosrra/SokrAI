export type Stage = 'problem_definition';

export type AgentStatus = 'continue' | 'done' | 'blocked';

export type SessionStatus =
  | 'active'
  | 'waiting_for_user'
  | 'completed'
  | 'blocked'
  | 'failed';

export interface StructuredBrief {
  project_title: string;
  goal: string;
  target_user: string;
  problem_owner: string;
  problem_statement: string;
  evidence_of_problem: string;
  current_alternatives: string;
  scope: string;
  constraints_known: string[];
  assumptions: string[];
  ambiguities: string[];
  missing_information: string[];
}

export interface ProblemDefinitionState {
  problem_owner: string;
  problem_statement: string;
  evidence_of_problem: string;
  scope: string;
  current_alternatives: string;
  assumptions: string[];
  ambiguities_remaining: string[];
}

export interface ProposalStartFile {
  file_name: string;
  mime_type: 'application/pdf';
  content_base64: string;
}

export interface ProposalStartRequest {
  request_id?: string;
  user_id?: string;
  project_title: string;
  goal: string;
  proposal_text?: string;
  document_text?: string;
  file?: ProposalStartFile;
  metadata?: Record<string, unknown>;
}

export interface ProposalStartResponse {
  session_id: string;
  stage: Stage;
  structured_brief: StructuredBrief;
  detected_gaps: string[];
  next_question: string;
  agent_status: AgentStatus;
  warnings: string[];
}

export interface ProposalReplyRequest {
  request_id?: string;
  session_id: string;
  answer: string;
}

export interface ProposalReplyResponse {
  session_id: string;
  stage: Stage;
  agent_status: AgentStatus;
  updated_problem_definition: ProblemDefinitionState;
  diagnosis: string[];
  next_question: string;
  completion_reason: string;
  warnings: string[];
}

export interface ErrorResponse {
  error_code: string;
  safe_message: string;
  request_id: string;
  session_id?: string;
  retryable: boolean;
}

export interface RequestExecutionResponse {
  request_id: string;
  request_kind: 'proposal_start' | 'proposal_reply' | 'unknown';
  status: 'pending' | 'completed' | 'failed' | 'not_found';
  session_id?: string;
  error_code?: string;
  safe_message?: string;
  retryable?: boolean;
}

export interface SessionRecord {
  id: string;
  project_title: string;
  goal: string;
  current_stage: Stage;
  current_agent: 'problem_definition_agent';
  status: SessionStatus;
  current_turn_seq: number;
  state_version: number;
  latest_structured_brief_json: StructuredBrief;
  latest_problem_definition_json: ProblemDefinitionState | null;
  latest_snapshot_id: string | null;
  latest_successful_run_id: string | null;
  completion_reason: string | null;
}

export interface ConversationTurn {
  id: string;
  session_id: string;
  turn_seq: number;
  question_text: string;
  answer_text: string | null;
  status: 'awaiting_user' | 'processing' | 'resolved' | 'failed';
  agent_status: AgentStatus | null;
  diagnosis_json: string[];
  updated_problem_definition_json: ProblemDefinitionState | null;
  completion_reason: string | null;
}

export interface AgentRun {
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
  status:
    | 'completed'
    | 'validation_failed'
    | 'repair_failed'
    | 'model_failed'
    | 'controlled_error';
}

export interface Snapshot {
  id: string;
  session_id: string;
  snapshot_seq: number;
  state_version: number;
  source_turn_seq: number | null;
  source_run_id: string | null;
  structured_brief_json: StructuredBrief;
  current_problem_definition_json: ProblemDefinitionState | null;
  detected_gaps_json: string[];
  next_question_text: string | null;
  agent_status: AgentStatus;
  completion_reason: string | null;
  warnings_json: string[];
}

export interface SessionEvent {
  id: string;
  session_id: string;
  turn_seq: number | null;
  run_id: string | null;
  event_seq: number;
  event_type: string;
  actor_type: string;
  request_id: string | null;
  payload_json: Record<string, unknown>;
  created_at?: string;
}

export interface SessionAuditView {
  session: SessionRecord;
  turns: ConversationTurn[];
  runs: AgentRun[];
  snapshots: Snapshot[];
  events: SessionEvent[];
}

export interface RecentSession {
  sessionId: string;
  projectTitle: string;
  goal: string;
  status: SessionStatus;
  updatedAt: string;
  currentQuestion: string;
}
