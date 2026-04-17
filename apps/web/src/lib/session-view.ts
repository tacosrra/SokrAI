import type {
  AgentRun,
  AgentStatus,
  ConversationTurn,
  ProblemDefinitionState,
  SessionAuditView,
  SessionStatus,
  Snapshot,
  StructuredBrief,
} from '../domain/contracts';

export interface SessionPresentation {
  sessionId: string;
  projectTitle: string;
  goal: string;
  stage: 'problem_definition';
  status: SessionStatus;
  agentStatus: AgentStatus;
  structuredBrief: StructuredBrief;
  problemDefinition: ProblemDefinitionState | null;
  detectedGaps: string[];
  latestDiagnosis: string[];
  currentQuestion: string;
  completionReason: string;
  warnings: string[];
  turns: ConversationTurn[];
  latestRun: AgentRun | null;
  latestSnapshot: Snapshot | null;
  runCount: number;
  snapshotCount: number;
  eventCount: number;
}

function fallbackAgentStatus(status: SessionStatus): AgentStatus {
  if (status === 'completed') {
    return 'done';
  }

  if (status === 'blocked' || status === 'failed') {
    return 'blocked';
  }

  return 'continue';
}

export function deriveSessionPresentation(audit: SessionAuditView): SessionPresentation {
  const latestSnapshot = audit.snapshots[audit.snapshots.length - 1] ?? null;
  const latestRun = audit.runs[audit.runs.length - 1] ?? null;
  const latestResolvedTurn = [...audit.turns]
    .reverse()
    .find((turn) => turn.status === 'resolved' || turn.status === 'failed');
  const openTurn = [...audit.turns]
    .reverse()
    .find((turn) => turn.status === 'awaiting_user' || turn.status === 'processing');

  return {
    sessionId: audit.session.id,
    projectTitle: audit.session.project_title,
    goal: audit.session.goal,
    stage: audit.session.current_stage,
    status: audit.session.status,
    agentStatus: latestSnapshot?.agent_status ?? fallbackAgentStatus(audit.session.status),
    structuredBrief:
      latestSnapshot?.structured_brief_json ?? audit.session.latest_structured_brief_json,
    problemDefinition:
      latestSnapshot?.current_problem_definition_json ??
      audit.session.latest_problem_definition_json,
    detectedGaps: latestSnapshot?.detected_gaps_json ?? [],
    latestDiagnosis: latestResolvedTurn?.diagnosis_json ?? [],
    currentQuestion:
      openTurn?.question_text ?? latestSnapshot?.next_question_text ?? '',
    completionReason:
      latestResolvedTurn?.completion_reason ??
      latestSnapshot?.completion_reason ??
      audit.session.completion_reason ??
      '',
    warnings: latestSnapshot?.warnings_json ?? [],
    turns: audit.turns,
    latestRun,
    latestSnapshot,
    runCount: audit.runs.length,
    snapshotCount: audit.snapshots.length,
    eventCount: audit.events.length,
  };
}
