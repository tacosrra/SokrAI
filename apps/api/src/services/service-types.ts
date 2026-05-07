import type {
  ProblemDefinitionState,
  ProposalReplyRequest,
  ProposalReplyResponse,
  ProposalStartRequest,
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
  specialty?: 'default' | 'legal';
}

export interface ReplyContextCommand {
  context: WorkflowContext;
  payload: ProposalReplyRequest;
}

export interface RunProblemDefinitionCommand {
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
