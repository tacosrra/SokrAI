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

export interface ProblemDefinitionTurn {
  agent_status: 'continue' | 'done' | 'blocked';
  diagnosis: string[];
  updated_problem_definition: ProblemDefinitionState;
  next_question: string;
  completion_reason: string;
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
  stage: 'problem_definition';
  structured_brief: StructuredBrief;
  detected_gaps: string[];
  next_question: string;
  agent_status: 'continue' | 'done' | 'blocked';
  warnings: string[];
}

export interface ProposalReplyRequest {
  request_id?: string;
  session_id: string;
  answer: string;
}

export interface ProposalReplyResponse {
  session_id: string;
  stage: 'problem_definition';
  agent_status: 'continue' | 'done' | 'blocked';
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
