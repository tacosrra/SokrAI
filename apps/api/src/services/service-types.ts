import type {
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
