import type {
  BasicAlphaReport,
  DataAiPrivacyReplyRequest,
  DataAiPrivacyReplyResponse,
  DataAiPrivacyStartRequest,
  DataAiPrivacyStartResponse,
  DataAiPrivacyState,
  MedicalDeviceTriageReplyRequest,
  MedicalDeviceTriageReplyResponse,
  MedicalDeviceTriageStartRequest,
  MedicalDeviceTriageStartResponse,
  MedicalDeviceTriageState,
  ProblemDefinitionState,
  ProposalReplyRequest,
  ProposalReplyResponse,
  ProposalStartRequest,
  SolutionDefinitionState,
  SolutionReplyRequest,
  SolutionReplyResponse,
  SolutionStartRequest,
  StructuredBrief,
} from '../contracts/types';

export interface WorkflowContext {
  requestId: string;
  workflowVersion: string;
  workflowExecutionId?: string;
}

export interface StartContextResponse {
  session_id: string;
  stage: 'problem_definition';
  structured_brief: StructuredBrief;
  detected_gaps: string[];
  warnings: string[];
}

export interface ProblemDefinitionRunResponse extends ProposalReplyResponse {
  structured_brief: StructuredBrief;
  detected_gaps: string[];
  run_id: string;
  snapshot_id: string;
}

export interface StartContextCommand {
  context: WorkflowContext;
  payload: ProposalStartRequest;
}

export interface ReplyContextCommand {
  context: WorkflowContext;
  payload: ProposalReplyRequest;
}

export interface SolutionStartContextCommand {
  context: WorkflowContext;
  payload: SolutionStartRequest;
}

export interface SolutionReplyContextCommand {
  context: WorkflowContext;
  payload: SolutionReplyRequest;
}

export interface DataAiPrivacyStartContextCommand {
  context: WorkflowContext;
  payload: DataAiPrivacyStartRequest;
}

export interface DataAiPrivacyReplyContextCommand {
  context: WorkflowContext;
  payload: DataAiPrivacyReplyRequest;
}

export interface MedicalDeviceTriageStartContextCommand {
  context: WorkflowContext;
  payload: MedicalDeviceTriageStartRequest;
}

export interface MedicalDeviceTriageReplyContextCommand {
  context: WorkflowContext;
  payload: MedicalDeviceTriageReplyRequest;
}

export interface RunProblemDefinitionCommand {
  context: WorkflowContext;
  sessionId: string;
  trigger: 'start' | 'reply';
}

export interface RunSolutionDefinitionCommand {
  context: WorkflowContext;
  sessionId: string;
  trigger: 'start' | 'reply';
}

export interface RunDataAiPrivacyCommand {
  context: WorkflowContext;
  sessionId: string;
  trigger: 'start' | 'reply';
}

export interface RunMedicalDeviceTriageCommand {
  context: WorkflowContext;
  sessionId: string;
  trigger: 'start' | 'reply';
}

export interface ComposeBasicReportCommand {
  context: WorkflowContext;
  sessionId: string;
}

export type BasicReportResponse = BasicAlphaReport;

export interface AgentResponseState {
  structuredBrief: StructuredBrief;
  updatedProblemDefinition: ProblemDefinitionState;
  detectedGaps: string[];
  response: ProposalReplyResponse;
}

export interface SolutionDefinitionRunResponse extends SolutionReplyResponse {
  run_id: string;
}

export interface SolutionAgentResponseState {
  updatedSolutionDefinition: SolutionDefinitionState;
  detectedGaps: string[];
  response: SolutionReplyResponse;
}

export interface DataAiPrivacyRunResponse extends DataAiPrivacyReplyResponse {
  run_id: string;
}

export interface DataAiPrivacyAgentResponseState {
  updatedDataAiPrivacy: DataAiPrivacyState;
  detectedGaps: string[];
  response: DataAiPrivacyReplyResponse;
}

export type DataAiPrivacyStartServiceResponse = DataAiPrivacyStartResponse;

export interface MedicalDeviceTriageRunResponse extends MedicalDeviceTriageReplyResponse {
  run_id: string;
}

export interface MedicalDeviceTriageAgentResponseState {
  updatedMedicalDeviceTriage: MedicalDeviceTriageState;
  detectedGaps: string[];
  response: MedicalDeviceTriageReplyResponse;
}

export type MedicalDeviceTriageStartServiceResponse = MedicalDeviceTriageStartResponse;
