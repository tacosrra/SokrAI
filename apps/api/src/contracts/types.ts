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

export type AlphaModule = 'problem' | 'solution' | 'data_ai_privacy' | 'medical_device_triage';

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

export type SectionKind = 'problem' | 'solution' | 'data_ai_privacy' | 'medical_device_triage';

export type SectionStatus = 'draft' | 'generated' | 'accepted' | 'needs_revision' | 'superseded';

export type ReportStatus = 'draft' | 'ready' | 'needs_revision';

export type AuditRefKind = 'agent_run' | 'audit_event' | 'snapshot' | 'chat_turn';

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
  agent_status?: 'continue' | 'done' | 'blocked';
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

export interface BasicReportComposeRequest {
  request_id?: string;
  workflow_version?: string;
  workflow_execution_id?: string;
  session_id: string;
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

export interface SolutionDefinitionTurn {
  agent_status: 'continue' | 'done' | 'blocked';
  diagnosis: string[];
  updated_solution_definition: SolutionDefinitionState;
  next_question: string;
  completion_reason: string;
}

export type RegulatoryProfileId = 'hospital_clinic_v1';

export type RegulatoryFamilyId = 'gdpr' | 'cybersecurity_act' | 'ehds' | 'mdr' | 'eu_ai_act' | 'htar';

export interface RegulatoryFamily {
  family_id: RegulatoryFamilyId;
  label: string;
  scope_note: string;
}

export interface RegulatoryProfile {
  profile_id: RegulatoryProfileId;
  profile_version: string;
  display_name: string;
  families: RegulatoryFamily[];
  allowed_outputs: Array<'gaps' | 'questions' | 'uncertainty' | 'requires competent human review'>;
  forbidden_outputs: string[];
  review_statement: 'requires competent human review';
}

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

export interface DataAiPrivacyTurn {
  agent_status: 'continue' | 'done' | 'blocked';
  diagnosis: string[];
  updated_data_ai_privacy: DataAiPrivacyState;
  next_question: string;
  completion_reason: string;
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

export interface MedicalDeviceTriageTurn {
  agent_status: 'continue' | 'done' | 'blocked';
  diagnosis: string[];
  updated_medical_device_triage: MedicalDeviceTriageState;
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

export interface SolutionStartRequest {
  request_id?: string;
  session_id: string;
}

export interface SolutionStartResponse {
  session_id: string;
  stage: 'solution_definition';
  agent_status: 'continue' | 'done' | 'blocked';
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
  agent_status: 'continue' | 'done' | 'blocked';
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
  agent_status: 'continue' | 'done' | 'blocked';
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
  agent_status: 'continue' | 'done' | 'blocked';
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
  agent_status: 'continue' | 'done' | 'blocked';
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
  agent_status: 'continue' | 'done' | 'blocked';
  updated_medical_device_triage: MedicalDeviceTriageState;
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
    | 'unknown';
  status: 'pending' | 'completed' | 'failed' | 'not_found';
  session_id?: string;
  error_code?: string;
  safe_message?: string;
  retryable?: boolean;
}
