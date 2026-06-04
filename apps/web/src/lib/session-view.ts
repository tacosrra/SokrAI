import type {
  AgentRun,
  AgentStatus,
  AlphaGap,
  ConversationTurn,
  GeneratedSection,
  ModuleChat,
  ProblemDefinitionState,
  SessionAuditView,
  SessionStatus,
  Snapshot,
  Stage,
  StructuredBrief,
} from '../domain/contracts';

type FieldSource = 'problem_definition' | 'structured_brief' | 'missing';
type ProgressStepState = 'complete' | 'current' | 'upcoming';

export interface SessionChecklistItem {
  id:
    | 'target_user'
    | 'problem_owner'
    | 'problem_statement'
    | 'evidence_of_problem'
    | 'scope'
    | 'current_alternatives';
  label: string;
  value: string;
  isComplete: boolean;
  source: FieldSource;
}

export interface SessionProgressStep {
  id: 'intake' | 'brief' | 'clarification' | 'definition';
  label: string;
  state: ProgressStepState;
}

export interface SessionProgress {
  percent: number;
  completedItems: number;
  totalItems: number;
  title: string;
  description: string;
  steps: SessionProgressStep[];
}

export interface SessionPresentation {
  sessionId: string;
  projectTitle: string;
  goal: string;
  stage: Stage;
  status: SessionStatus;
  agentStatus: AgentStatus;
  structuredBrief: StructuredBrief;
  problemDefinition: ProblemDefinitionState | null;
  gaps: AlphaGap[];
  problemModuleChat: ModuleChat | null;
  solutionModuleChat: ModuleChat | null;
  dataAiPrivacyModuleChat: ModuleChat | null;
  latestProblemSection: GeneratedSection | null;
  latestSolutionSection: GeneratedSection | null;
  latestDataAiPrivacySection: GeneratedSection | null;
  detectedGaps: string[];
  latestDiagnosis: string[];
  currentQuestion: string;
  currentSolutionQuestion: string;
  currentDataAiPrivacyQuestion: string;
  completionReason: string;
  warnings: string[];
  turns: ConversationTurn[];
  latestRun: AgentRun | null;
  latestSnapshot: Snapshot | null;
  runCount: number;
  snapshotCount: number;
  eventCount: number;
  checklist: SessionChecklistItem[];
  progress: SessionProgress;
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

function valueOrEmpty(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

function pickFieldValue(
  problemDefinitionValue: string | null | undefined,
  briefValue: string | null | undefined,
): Pick<SessionChecklistItem, 'value' | 'isComplete' | 'source'> {
  const problemDefinition = valueOrEmpty(problemDefinitionValue);

  if (problemDefinition.length > 0) {
    return {
      value: problemDefinition,
      isComplete: true,
      source: 'problem_definition',
    };
  }

  const structuredBrief = valueOrEmpty(briefValue);

  if (structuredBrief.length > 0) {
    return {
      value: structuredBrief,
      isComplete: true,
      source: 'structured_brief',
    };
  }

  return {
    value: 'Pendiente de aclaración',
    isComplete: false,
    source: 'missing',
  };
}

function deriveChecklist(
  structuredBrief: StructuredBrief,
  problemDefinition: ProblemDefinitionState | null,
): SessionChecklistItem[] {
  return [
    {
      id: 'target_user',
      label: 'Usuario afectado',
      ...pickFieldValue(undefined, structuredBrief.target_user),
    },
    {
      id: 'problem_owner',
      label: 'Problem owner',
      ...pickFieldValue(problemDefinition?.problem_owner, structuredBrief.problem_owner),
    },
    {
      id: 'problem_statement',
      label: 'Problema',
      ...pickFieldValue(
        problemDefinition?.problem_statement,
        structuredBrief.problem_statement,
      ),
    },
    {
      id: 'evidence_of_problem',
      label: 'Evidencia',
      ...pickFieldValue(
        problemDefinition?.evidence_of_problem,
        structuredBrief.evidence_of_problem,
      ),
    },
    {
      id: 'scope',
      label: 'Alcance',
      ...pickFieldValue(problemDefinition?.scope, structuredBrief.scope),
    },
    {
      id: 'current_alternatives',
      label: 'Alternativas',
      ...pickFieldValue(
        problemDefinition?.current_alternatives,
        structuredBrief.current_alternatives,
      ),
    },
  ];
}

function deriveProgress(
  checklist: SessionChecklistItem[],
  status: SessionStatus,
): SessionProgress {
  const completedItems = checklist.filter((item) => item.isComplete).length;
  const totalItems = checklist.length;
  const percent = Math.round((completedItems / totalItems) * 100);
  const allCoreFieldsDefined = completedItems === totalItems;

  const steps: SessionProgressStep[] = [
    {
      id: 'intake',
      label: 'Intake',
      state: 'complete',
    },
    {
      id: 'brief',
      label: 'Structured brief',
      state: 'complete',
    },
    {
      id: 'clarification',
      label: 'Clarificación',
      state:
        status === 'completed' || allCoreFieldsDefined ? 'complete' : 'current',
    },
    {
      id: 'definition',
      label: 'Definición',
      state:
        status === 'completed'
          ? 'complete'
          : allCoreFieldsDefined
            ? 'current'
            : 'upcoming',
    },
  ];

  if (status === 'completed') {
    return {
      percent: 100,
      completedItems,
      totalItems,
      title: 'Definición del problema completada',
      description:
        'La sesión cerró el carril y dejó todas las categorías listas para revisión.',
      steps,
    };
  }

  if (allCoreFieldsDefined) {
    return {
      percent,
      completedItems,
      totalItems,
      title: 'Categorías clave ya cubiertas',
      description:
        'La información troncal está presente; queda cerrar el turno o completar el lane.',
      steps,
    };
  }

  const remainingItems = totalItems - completedItems;

  return {
    percent,
    completedItems,
    totalItems,
    title: `${completedItems} de ${totalItems} categorías definidas`,
    description: `Faltan ${remainingItems} categorías por aclarar antes de cerrar el carril.`,
    steps,
  };
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
  const structuredBrief =
    latestSnapshot?.structured_brief_json ?? audit.session.latest_structured_brief_json;
  const problemDefinition =
    latestSnapshot?.current_problem_definition_json ??
    audit.session.latest_problem_definition_json;
  const checklist = deriveChecklist(structuredBrief, problemDefinition);
  const gaps = audit.gaps;
  const problemModuleChat = audit.module_chats.find((chat) => chat.module === 'problem') ?? null;
  const solutionModuleChat = audit.module_chats.find((chat) => chat.module === 'solution') ?? null;
  const dataAiPrivacyModuleChat = audit.module_chats.find((chat) => chat.module === 'data_ai_privacy') ?? null;
  const activeSolutionTurn = solutionModuleChat?.turns.find((turn) =>
    turn.turn_id === solutionModuleChat.active_turn_id,
  ) ?? null;
  const activeDataAiPrivacyTurn = dataAiPrivacyModuleChat?.turns.find((turn) =>
    turn.turn_id === dataAiPrivacyModuleChat.active_turn_id,
  ) ?? null;
  const latestProblemSection = [...audit.generated_sections]
    .reverse()
    .find((section) =>
      section.section_kind === 'problem' &&
      ['draft', 'generated', 'accepted', 'needs_revision'].includes(section.section_status),
    ) ?? null;
  const latestSolutionSection = [...audit.generated_sections]
    .reverse()
    .find((section) =>
      section.section_kind === 'solution' &&
      ['draft', 'generated', 'accepted', 'needs_revision'].includes(section.section_status),
    ) ?? null;
  const latestDataAiPrivacySection = [...audit.generated_sections]
    .reverse()
    .find((section) =>
      section.section_kind === 'data_ai_privacy' &&
      ['draft', 'generated', 'accepted', 'needs_revision'].includes(section.section_status),
    ) ?? null;
  const currentProblemQuestion = openTurn?.question_text ?? latestSnapshot?.next_question_text ?? '';
  const currentSolutionQuestion = activeSolutionTurn?.question_text ?? '';
  const currentDataAiPrivacyQuestion = activeDataAiPrivacyTurn?.question_text ?? '';

  return {
    sessionId: audit.session.id,
    projectTitle: audit.session.project_title,
    goal: audit.session.goal,
    stage: audit.session.current_stage,
    status: audit.session.status,
    agentStatus: latestSnapshot?.agent_status ?? fallbackAgentStatus(audit.session.status),
    structuredBrief,
    problemDefinition,
    gaps,
    problemModuleChat,
    solutionModuleChat,
    dataAiPrivacyModuleChat,
    latestProblemSection,
    latestSolutionSection,
    latestDataAiPrivacySection,
    detectedGaps: gaps.length > 0
      ? gaps.map((gap) => `${gap.field}: ${gap.description}`)
      : latestSnapshot?.detected_gaps_json ?? [],
    latestDiagnosis: latestResolvedTurn?.diagnosis_json ?? [],
    currentQuestion: currentDataAiPrivacyQuestion || currentSolutionQuestion || currentProblemQuestion,
    currentSolutionQuestion,
    currentDataAiPrivacyQuestion,
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
    checklist,
    progress: deriveProgress(checklist, audit.session.status),
  };
}
