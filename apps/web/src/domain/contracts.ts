export type Stage =
  | 'problem_definition'
  | 'solution_definition'
  | 'data_ai_privacy'
  | 'medical_device_triage'
  | 'resources_pilot_viability';

export type AgentStatus = 'continue' | 'done' | 'blocked';

export type SessionStatus =
  | 'active'
  | 'waiting_for_user'
  | 'completed'
  | 'blocked'
  | 'failed';

export type AlphaModule = 'problem' | 'solution' | 'data_ai_privacy' | 'medical_device_triage' | 'resources_pilot_viability';

export type ProposalStatus = 'draft' | 'active' | 'completed' | 'blocked' | 'failed' | 'archived';

export type ProposalSourceKind =
  | 'pasted_text'
  | 'uploaded_file'
  | 'extracted_text'
  | 'user_answer'
  | 'generated_section';

export type ProposalDocumentSourceKind = Extract<ProposalSourceKind, 'pasted_text' | 'uploaded_file' | 'extracted_text'>;

export type DocumentStatus = 'received' | 'normalized' | 'unsupported' | 'failed';

export type GapKind =
  | 'missing_information'
  | 'ambiguous_information'
  | 'unsupported_claim'
  | 'needs_user_confirmation';

export type GapStatus = 'open' | 'in_progress' | 'resolved' | 'deferred' | 'not_applicable';

export type GapOrigin =
  | 'structured_brief_field'
  | 'structured_brief_missing_information'
  | 'structured_brief_ambiguity'
  | 'proposal_source'
  | 'system_rule';

export type ChatStatus =
  | 'not_started'
  | 'active'
  | 'waiting_for_user'
  | 'ready_to_generate'
  | 'completed'
  | 'blocked'
  | 'failed';

export type ChatTurnStatus = 'awaiting_user' | 'processing' | 'resolved' | 'failed' | 'skipped';

export type SectionKind = 'problem' | 'solution' | 'data_ai_privacy' | 'medical_device_triage' | 'resources_pilot_viability';

export type SectionStatus = 'draft' | 'generated' | 'accepted' | 'needs_revision' | 'superseded';

export type ReportStatus = 'draft' | 'ready' | 'needs_revision';

export type AuditRefKind = 'agent_run' | 'audit_event' | 'snapshot' | 'chat_turn';

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

export interface SourceSpan {
  start_char: number;
  end_char: number;
}

export interface AuditRef {
  kind: AuditRefKind;
  id: string;
}

export interface ProposalSource {
  source_id: string;
  source_kind: ProposalSourceKind;
  label: string;
  document_id?: string;
  turn_id?: string;
  section_id?: string;
  span?: SourceSpan;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export interface ProposalDocument {
  document_id: string;
  proposal_id: string;
  source_kind: ProposalDocumentSourceKind;
  document_status: DocumentStatus;
  file_name?: string;
  mime_type?: string;
  sha256?: string;
  pasted_text?: string;
  normalized_text?: string;
  source_refs?: ProposalSource[];
  warnings: string[];
  created_at: string;
  metadata?: Record<string, unknown>;
}

export interface GapAbsence {
  is_absent: boolean;
  checked_fields: string[];
  reason: string;
}

export interface AlphaGap {
  gap_id: string;
  proposal_id: string;
  module: AlphaModule;
  gap_kind: GapKind;
  gap_status: GapStatus;
  origin: GapOrigin;
  field: string;
  description: string;
  absence: GapAbsence;
  question_hint?: string;
  source_refs: ProposalSource[];
  resolved_by_turn_id?: string;
  audit_refs: AuditRef[];
  warnings: string[];
  created_at: string;
  updated_at: string;
}

export interface ChatTurn {
  turn_id: string;
  chat_id: string;
  proposal_id: string;
  module: AlphaModule;
  turn_seq: number;
  question_text: string;
  answer_text?: string;
  turn_status: ChatTurnStatus;
  agent_status?: AgentStatus;
  diagnosis: string[];
  source_refs: ProposalSource[];
  gap_refs: string[];
  audit_refs: AuditRef[];
  warnings: string[];
  created_at: string;
  completed_at?: string;
}

export interface ModuleChat {
  chat_id: string;
  proposal_id: string;
  module: AlphaModule;
  chat_status: ChatStatus;
  turns: ChatTurn[];
  active_turn_id?: string;
  started_at: string;
  completed_at?: string;
  warnings: string[];
}

export interface GeneratedSection {
  section_id: string;
  proposal_id: string;
  section_kind: SectionKind;
  section_status: SectionStatus;
  section_version: number;
  title: string;
  content_markdown: string;
  source_refs: ProposalSource[];
  gap_refs: string[];
  generated_by_run_id?: string;
  supersedes_section_id?: string;
  warnings: string[];
  created_at: string;
}

export interface AlphaProposal {
  proposal_id: string;
  user_id?: string;
  proposal_status: ProposalStatus;
  project_title: string;
  goal: string;
  structured_brief: StructuredBrief;
  documents: ProposalDocument[];
  sources: ProposalSource[];
  gaps: AlphaGap[];
  module_chats: ModuleChat[];
  generated_sections: GeneratedSection[];
  audit_refs: AuditRef[];
  warnings: string[];
  schema_version: string;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown>;
}

export interface BasicAlphaReport {
  report_id: string;
  proposal_id: string;
  report_status: ReportStatus;
  schema_version: string;
  structured_brief: StructuredBrief;
  current_gaps: AlphaGap[];
  problem_section: GeneratedSection;
  solution_section: GeneratedSection;
  internal_sources: ProposalSource[];
  audit_refs: AuditRef[];
  warnings: string[];
  generated_at: string;
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

export interface SolutionDefinitionState {
  solution_summary: string;
  target_user: string;
  how_it_works: string;
  workflow_change: string;
  current_solutions: string;
  value_differential: string;
  scope_limits: string;
  assumptions: string[];
  ambiguities_remaining: string[];
}

export type RegulatoryProfileId = 'hospital_clinic_v1';

export interface DataAiPrivacyState {
  personal_or_health_data: string;
  data_sources: string;
  ai_system_role: string;
  validation_evidence: string;
  privacy_governance: string;
  cybersecurity_controls: string;
  regulatory_context: string;
  human_review_plan: string;
  assumptions: string[];
  uncertainties: string[];
  requires_competent_human_review: boolean;
}

export type MedicalDeviceTriageStatus = 'applicable' | 'not_applicable' | 'uncertain';

export interface MedicalDeviceTriageState {
  triage_status: MedicalDeviceTriageStatus;
  activation_signals: string[];
  uncertainties: string[];
  intended_use_claims: string[];
  clinical_decision_role: string;
  evidence_needed: string[];
  human_review_plan: string;
  needs_human_review: boolean;
  requires_competent_human_review: boolean;
}

export interface ResourcesPilotViabilityState {
  human_resources: string;
  technical_resources: string;
  pilot_environment: string;
  dependencies: string[];
  indicators_metrics: string[];
  constraints: string[];
  operational_risks: string[];
  assumptions: string[];
  uncertainties: string[];
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

export interface SolutionStartRequest {
  request_id?: string;
  session_id: string;
}

export interface SolutionStartResponse {
  session_id: string;
  stage: 'solution_definition';
  agent_status: AgentStatus;
  updated_solution_definition: SolutionDefinitionState;
  diagnosis: string[];
  next_question: string;
  completion_reason: string;
  warnings: string[];
}

export interface SolutionReplyRequest {
  request_id?: string;
  session_id: string;
  answer: string;
}

export interface SolutionReplyResponse {
  session_id: string;
  stage: 'solution_definition';
  agent_status: AgentStatus;
  updated_solution_definition: SolutionDefinitionState;
  diagnosis: string[];
  next_question: string;
  completion_reason: string;
  warnings: string[];
}

export interface DataAiPrivacyStartRequest {
  request_id?: string;
  session_id: string;
  profile_id?: RegulatoryProfileId;
}

export interface DataAiPrivacyStartResponse {
  session_id: string;
  stage: 'data_ai_privacy';
  profile_id: RegulatoryProfileId;
  agent_status: AgentStatus;
  updated_data_ai_privacy: DataAiPrivacyState;
  diagnosis: string[];
  next_question: string;
  completion_reason: string;
  warnings: string[];
}

export interface DataAiPrivacyReplyRequest {
  request_id?: string;
  session_id: string;
  answer: string;
}

export interface DataAiPrivacyReplyResponse {
  session_id: string;
  stage: 'data_ai_privacy';
  profile_id: RegulatoryProfileId;
  agent_status: AgentStatus;
  updated_data_ai_privacy: DataAiPrivacyState;
  diagnosis: string[];
  next_question: string;
  completion_reason: string;
  warnings: string[];
}

export interface MedicalDeviceTriageStartRequest {
  request_id?: string;
  session_id: string;
  profile_id?: RegulatoryProfileId;
}

export interface MedicalDeviceTriageStartResponse {
  session_id: string;
  stage: 'medical_device_triage';
  profile_id: RegulatoryProfileId;
  activation_result: MedicalDeviceTriageStatus;
  agent_status: AgentStatus;
  updated_medical_device_triage: MedicalDeviceTriageState;
  diagnosis: string[];
  next_question: string;
  completion_reason: string;
  warnings: string[];
}

export interface MedicalDeviceTriageReplyRequest {
  request_id?: string;
  session_id: string;
  answer: string;
}

export interface MedicalDeviceTriageReplyResponse {
  session_id: string;
  stage: 'medical_device_triage';
  profile_id: RegulatoryProfileId;
  activation_result: MedicalDeviceTriageStatus;
  agent_status: AgentStatus;
  updated_medical_device_triage: MedicalDeviceTriageState;
  diagnosis: string[];
  next_question: string;
  completion_reason: string;
  warnings: string[];
}

export interface ResourcesPilotViabilityStartRequest {
  request_id?: string;
  session_id: string;
}

export interface ResourcesPilotViabilityStartResponse {
  session_id: string;
  stage: 'resources_pilot_viability';
  agent_status: AgentStatus;
  updated_resources_pilot_viability: ResourcesPilotViabilityState;
  diagnosis: string[];
  next_question: string;
  completion_reason: string;
  warnings: string[];
}

export interface ResourcesPilotViabilityReplyRequest {
  request_id?: string;
  session_id: string;
  answer: string;
}

export interface ResourcesPilotViabilityReplyResponse {
  session_id: string;
  stage: 'resources_pilot_viability';
  agent_status: AgentStatus;
  updated_resources_pilot_viability: ResourcesPilotViabilityState;
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
  event_stream: 'audit_events' | 'session_events';
  stream_event_seq: number;
  event_type: string;
  actor_type: string;
  request_id: string | null;
  payload_json: Record<string, unknown>;
  created_at?: string;
}

export interface SessionAuditView {
  session: SessionRecord;
  documents: ProposalDocument[];
  sources: ProposalSource[];
  gaps: AlphaGap[];
  module_chats: ModuleChat[];
  generated_sections: GeneratedSection[];
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
