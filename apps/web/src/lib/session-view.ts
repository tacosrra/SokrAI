import type {
  AgentRun,
  AgentStatus,
  AlphaGap,
  AlphaModule,
  BasicAlphaReport,
  ChatTurn,
  ConversationTurn,
  GeneratedSection,
  ModuleChat,
  ProblemDefinitionState,
  SectionKind,
  SessionAuditView,
  SessionStatus,
  Snapshot,
  Stage,
  StructuredBrief,
} from '../domain/contracts';

type FieldSource = 'problem_definition' | 'structured_brief' | 'missing';
type ProgressStepState = 'complete' | 'current' | 'upcoming';

export type PhaseId =
  | 'intake'
  | 'problem'
  | 'solution'
  | 'data_ai_privacy'
  | 'medical_device_triage'
  | 'resources_pilot_viability'
  | 'report'
  | 'pdf_export';

export type PhaseStatus =
  | 'complete'
  | 'current'
  | 'ready'
  | 'locked'
  | 'not_applicable'
  | 'recovering'
  | 'error';

export type PhasePrimaryAction =
  | 'none'
  | 'answer_question'
  | 'start_solution'
  | 'start_data_ai_privacy'
  | 'start_medical_device_triage'
  | 'start_resources_pilot_viability'
  | 'prepare_report'
  | 'download_pdf'
  | 'review_report'
  | 'recover';

export interface ConversationHistoryTurn {
  id: string;
  turn_seq: number;
  question_text: string;
  answer_text: string | null;
  status: 'awaiting_user' | 'processing' | 'resolved' | 'failed';
}

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

export interface PhaseStep {
  id: PhaseId;
  label: string;
  status: PhaseStatus;
  progress: number;
  openGapsCount: number;
  resolvedGapsCount: number;
  lockedReason: string | null;
  primaryAction: PhasePrimaryAction;
  explanation: string;
}

export interface PhaseProgress {
  percent: number;
  completedPhases: number;
  totalApplicablePhases: number;
  currentPhaseId: PhaseId;
  currentPhaseLabel: string;
  isComplete: boolean;
  steps: PhaseStep[];
}

export interface DeriveSessionPresentationOptions {
  report?: BasicAlphaReport | null;
  /** True while the frontend is waiting for the local PDF download request to finish. */
  isDownloadingReportPdf?: boolean;
  /**
   * Frontend-only, in-memory signal set after a successful PDF download in the
   * current browser session. It is not backend-persisted export state and must
   * not be treated as a source of truth after reload/resume.
   */
  hasDownloadedReportPdf?: boolean;
  isRecovering?: boolean;
  lastKnownPhaseId?: PhaseId | null;
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
  medicalDeviceTriageModuleChat: ModuleChat | null;
  resourcesPilotViabilityModuleChat: ModuleChat | null;
  latestProblemSection: GeneratedSection | null;
  latestSolutionSection: GeneratedSection | null;
  latestDataAiPrivacySection: GeneratedSection | null;
  latestMedicalDeviceTriageSection: GeneratedSection | null;
  latestResourcesPilotViabilitySection: GeneratedSection | null;
  detectedGaps: string[];
  latestDiagnosis: string[];
  currentQuestion: string;
  currentSolutionQuestion: string;
  currentDataAiPrivacyQuestion: string;
  currentMedicalDeviceTriageQuestion: string;
  currentResourcesPilotViabilityQuestion: string;
  completionReason: string;
  warnings: string[];
  turns: ConversationTurn[];
  conversationHistoryTurns: ConversationHistoryTurn[];
  conversationHistoryByPhase: Partial<Record<PhaseId, ConversationHistoryTurn[]>>;
  latestRun: AgentRun | null;
  latestSnapshot: Snapshot | null;
  runCount: number;
  snapshotCount: number;
  eventCount: number;
  checklist: SessionChecklistItem[];
  progress: SessionProgress;
  phaseProgress: PhaseProgress;
}

const PHASE_ORDER: PhaseId[] = [
  'intake',
  'problem',
  'solution',
  'data_ai_privacy',
  'medical_device_triage',
  'resources_pilot_viability',
  'report',
  'pdf_export',
];

const PHASE_DETAILS: Record<PhaseId, Pick<PhaseStep, 'label' | 'explanation'>> = {
  intake: {
    label: 'Intake / propuesta',
    explanation: 'Contexto inicial normalizado y listo para guiar la entrevista.',
  },
  problem: {
    label: 'Problema',
    explanation: 'Aclara quién vive el problema, evidencia, alcance y alternativas actuales.',
  },
  solution: {
    label: 'Solución',
    explanation: 'Describe qué cambiaría, quién la usaría, cómo funcionaría y sus límites.',
  },
  data_ai_privacy: {
    label: 'Datos / IA / privacidad',
    explanation: 'Identifica datos sensibles, rol de IA, controles, validación y revisión humana.',
  },
  medical_device_triage: {
    label: 'Medical-device triage',
    explanation: 'Registra señales o incertidumbre que requieren revisión competente.',
  },
  resources_pilot_viability: {
    label: 'Recursos / piloto / viabilidad',
    explanation: 'Captura recursos, dependencias, entorno piloto, métricas y riesgos operativos.',
  },
  report: {
    label: 'Informe',
    explanation: 'Prepara el resumen estructurado para revisión antes de exportar.',
  },
  pdf_export: {
    label: 'PDF / export',
    explanation: 'Genera el artefacto local de demo cuando el informe está listo.',
  },
};

const PHASE_GAP_MODULE: Partial<Record<PhaseId, AlphaModule>> = {
  problem: 'problem',
  solution: 'solution',
  data_ai_privacy: 'data_ai_privacy',
  medical_device_triage: 'medical_device_triage',
  resources_pilot_viability: 'resources_pilot_viability',
};

export const CONVERSATIONAL_PHASE_IDS = Object.keys(PHASE_GAP_MODULE) as PhaseId[];

export function getPhaseLabel(phaseId: PhaseId): string {
  return PHASE_DETAILS[phaseId]?.label ?? phaseId;
}

const COMPLETE_SECTION_STATUSES = ['generated', 'accepted'] as const;
const VISIBLE_SECTION_STATUSES = ['draft', ...COMPLETE_SECTION_STATUSES, 'needs_revision'] as const;

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

function deriveProblemProgress(
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

function isCompleteSection(section: GeneratedSection | null): boolean {
  return Boolean(section && COMPLETE_SECTION_STATUSES.includes(section.section_status as typeof COMPLETE_SECTION_STATUSES[number]));
}

function findLatestVisibleSection(
  sections: GeneratedSection[],
  sectionKind: SectionKind,
): GeneratedSection | null {
  return [...sections]
    .reverse()
    .find((section) =>
      section.section_kind === sectionKind &&
      VISIBLE_SECTION_STATUSES.includes(section.section_status as typeof VISIBLE_SECTION_STATUSES[number]),
    ) ?? null;
}

function mapChatTurnToHistoryTurn(turn: ChatTurn): ConversationHistoryTurn {
  return {
    id: turn.turn_id,
    turn_seq: turn.turn_seq,
    question_text: turn.question_text,
    answer_text: turn.answer_text ?? null,
    status: turn.turn_status === 'skipped' ? 'resolved' : turn.turn_status,
  };
}

function mapConversationTurnToHistoryTurn(turn: ConversationTurn): ConversationHistoryTurn {
  return {
    id: turn.id,
    turn_seq: turn.turn_seq,
    question_text: turn.question_text,
    answer_text: turn.answer_text,
    status: turn.status,
  };
}

function resolveModuleChatForPhase(
  phaseId: PhaseId,
  moduleChats: {
    problem: ModuleChat | null;
    solution: ModuleChat | null;
    data_ai_privacy: ModuleChat | null;
    medical_device_triage: ModuleChat | null;
    resources_pilot_viability: ModuleChat | null;
  },
): ModuleChat | null {
  switch (phaseId) {
    case 'problem':
      return moduleChats.problem;
    case 'solution':
      return moduleChats.solution;
    case 'data_ai_privacy':
      return moduleChats.data_ai_privacy;
    case 'medical_device_triage':
      return moduleChats.medical_device_triage;
    case 'resources_pilot_viability':
      return moduleChats.resources_pilot_viability;
    default:
      return null;
  }
}

function resolveActiveModuleChatForHistory(params: {
  currentPhaseId: PhaseId;
  currentResourcesPilotViabilityQuestion: string;
  currentMedicalDeviceTriageQuestion: string;
  currentDataAiPrivacyQuestion: string;
  currentSolutionQuestion: string;
  problemModuleChat: ModuleChat | null;
  solutionModuleChat: ModuleChat | null;
  dataAiPrivacyModuleChat: ModuleChat | null;
  medicalDeviceTriageModuleChat: ModuleChat | null;
  resourcesPilotViabilityModuleChat: ModuleChat | null;
}): ModuleChat | null {
  if (
    params.currentResourcesPilotViabilityQuestion ||
    params.currentPhaseId === 'resources_pilot_viability'
  ) {
    return params.resourcesPilotViabilityModuleChat;
  }

  if (
    params.currentMedicalDeviceTriageQuestion ||
    params.currentPhaseId === 'medical_device_triage'
  ) {
    return params.medicalDeviceTriageModuleChat;
  }

  if (params.currentDataAiPrivacyQuestion || params.currentPhaseId === 'data_ai_privacy') {
    return params.dataAiPrivacyModuleChat;
  }

  if (params.currentSolutionQuestion || params.currentPhaseId === 'solution') {
    return params.solutionModuleChat;
  }

  return params.problemModuleChat;
}

export function deriveConversationHistoryForPhase(
  phaseId: PhaseId,
  params: {
    auditTurns: ConversationTurn[];
    problemModuleChat: ModuleChat | null;
    solutionModuleChat: ModuleChat | null;
    dataAiPrivacyModuleChat: ModuleChat | null;
    medicalDeviceTriageModuleChat: ModuleChat | null;
    resourcesPilotViabilityModuleChat: ModuleChat | null;
  },
): ConversationHistoryTurn[] {
  if (!CONVERSATIONAL_PHASE_IDS.includes(phaseId)) {
    return [];
  }

  const moduleChat = resolveModuleChatForPhase(phaseId, {
    problem: params.problemModuleChat,
    solution: params.solutionModuleChat,
    data_ai_privacy: params.dataAiPrivacyModuleChat,
    medical_device_triage: params.medicalDeviceTriageModuleChat,
    resources_pilot_viability: params.resourcesPilotViabilityModuleChat,
  });

  if (moduleChat && moduleChat.turns.length > 0) {
    return moduleChat.turns.map(mapChatTurnToHistoryTurn);
  }

  if (phaseId === 'problem') {
    return params.auditTurns.map(mapConversationTurnToHistoryTurn);
  }

  return [];
}

export function deriveConversationHistoryByPhase(params: {
  auditTurns: ConversationTurn[];
  problemModuleChat: ModuleChat | null;
  solutionModuleChat: ModuleChat | null;
  dataAiPrivacyModuleChat: ModuleChat | null;
  medicalDeviceTriageModuleChat: ModuleChat | null;
  resourcesPilotViabilityModuleChat: ModuleChat | null;
}): Partial<Record<PhaseId, ConversationHistoryTurn[]>> {
  const historyByPhase: Partial<Record<PhaseId, ConversationHistoryTurn[]>> = {};

  for (const phaseId of CONVERSATIONAL_PHASE_IDS) {
    const turns = deriveConversationHistoryForPhase(phaseId, params);

    if (turns.length > 0) {
      historyByPhase[phaseId] = turns;
    }
  }

  return historyByPhase;
}

export function deriveConversationHistoryTurns(params: {
  auditTurns: ConversationTurn[];
  currentPhaseId: PhaseId;
  currentResourcesPilotViabilityQuestion: string;
  currentMedicalDeviceTriageQuestion: string;
  currentDataAiPrivacyQuestion: string;
  currentSolutionQuestion: string;
  problemModuleChat: ModuleChat | null;
  solutionModuleChat: ModuleChat | null;
  dataAiPrivacyModuleChat: ModuleChat | null;
  medicalDeviceTriageModuleChat: ModuleChat | null;
  resourcesPilotViabilityModuleChat: ModuleChat | null;
}): ConversationHistoryTurn[] {
  const activeModuleChat = resolveActiveModuleChatForHistory(params);

  if (activeModuleChat && activeModuleChat.turns.length > 0) {
    return activeModuleChat.turns.map(mapChatTurnToHistoryTurn);
  }

  if (params.currentPhaseId === 'problem' || !activeModuleChat) {
    return params.auditTurns.map(mapConversationTurnToHistoryTurn);
  }

  return deriveConversationHistoryForPhase(params.currentPhaseId, params);
}

function isRetryableFailedConversationTurn(
  turn: SessionAuditView['turns'][number],
): boolean {
  return turn.status === 'failed' && Boolean(turn.answer_text?.trim());
}

function effectiveSessionStatus(audit: SessionAuditView): SessionStatus {
  if (audit.session.status === 'blocked') {
    const retryableTurn = audit.turns.find(isRetryableFailedConversationTurn);

    if (retryableTurn) {
      return 'waiting_for_user';
    }
  }

  return audit.session.status;
}

function isRetryableFailedModuleTurn(turn: ModuleChat['turns'][number]): boolean {
  return turn.turn_status === 'failed' && Boolean(turn.answer_text?.trim());
}

function findActiveModuleTurn(chat: ModuleChat | null) {
  if (!chat) {
    return null;
  }

  const activeTurn = chat.turns.find((turn) =>
    turn.turn_id === chat.active_turn_id &&
    (turn.turn_status === 'awaiting_user' || turn.turn_status === 'processing'),
  );

  if (activeTurn) {
    return activeTurn;
  }

  if (chat.chat_status === 'failed') {
    return [...chat.turns].reverse().find((turn) => isRetryableFailedModuleTurn(turn)) ?? null;
  }

  return null;
}

function moduleChatWeight(chat: ModuleChat): number {
  switch (chat.chat_status) {
    case 'waiting_for_user':
    case 'active':
      return 4;
    case 'ready_to_generate':
      return 3;
    case 'completed':
      return 2;
    case 'blocked':
    case 'failed':
      return 1;
    default:
      return 0;
  }
}

function findModuleChat(chats: ModuleChat[], module: AlphaModule): ModuleChat | null {
  const matchingChats = chats.filter((chat) => chat.module === module);

  return matchingChats.sort((left, right) => {
    const weightDelta = moduleChatWeight(right) - moduleChatWeight(left);

    if (weightDelta !== 0) {
      return weightDelta;
    }

    return right.started_at.localeCompare(left.started_at);
  })[0] ?? null;
}

function countModuleGaps(gaps: AlphaGap[], module: AlphaModule) {
  const moduleGaps = gaps.filter((gap) => gap.module === module);

  return {
    openGapsCount: moduleGaps.filter((gap) =>
      gap.gap_status === 'open' || gap.gap_status === 'in_progress',
    ).length,
    resolvedGapsCount: moduleGaps.filter((gap) => gap.gap_status === 'resolved').length,
  };
}

function phaseProgressValue(status: PhaseStatus, fallback = 0): number {
  switch (status) {
    case 'complete':
    case 'not_applicable':
      return 100;
    case 'current':
    case 'recovering':
      return Math.max(fallback, 50);
    case 'ready':
    case 'error':
    case 'locked':
      return fallback;
  }
}

function createPhaseStep(
  id: PhaseId,
  status: PhaseStatus,
  options?: {
    progress?: number;
    openGapsCount?: number;
    resolvedGapsCount?: number;
    lockedReason?: string | null;
    primaryAction?: PhasePrimaryAction;
    explanation?: string;
  },
): PhaseStep {
  const details = PHASE_DETAILS[id];

  return {
    id,
    label: details.label,
    status,
    progress: phaseProgressValue(status, options?.progress),
    openGapsCount: options?.openGapsCount ?? 0,
    resolvedGapsCount: options?.resolvedGapsCount ?? 0,
    lockedReason: options?.lockedReason ?? null,
    primaryAction: options?.primaryAction ?? 'none',
    explanation: options?.explanation ?? details.explanation,
  };
}

function stepIsComplete(step: PhaseStep): boolean {
  return step.status === 'complete' || step.status === 'not_applicable';
}

function hasExplicitMedicalDeviceNotApplicable(audit: SessionAuditView): boolean {
  // Only explicit audited run/event payloads may skip triage; absence of data is not a not-applicable fact.
  const valuesToInspect: unknown[] = [
    ...audit.runs
      .filter((run) => run.run_purpose === 'medical_device_triage' && run.status === 'completed')
      .map((run) => run.validated_output_json),
    ...audit.events.map((event) => event.payload_json),
  ];

  return valuesToInspect.some((value) => readTriageStatus(value) === 'not_applicable');
}

function readTriageStatus(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (record.triage_status === 'not_applicable') {
    return 'not_applicable';
  }

  if (record.activation_result === 'not_applicable') {
    return 'not_applicable';
  }

  return (
    readTriageStatus(record.updated_medical_device_triage) ??
    readTriageStatus(record.medical_device_triage) ??
    readTriageStatus(record.state)
  );
}

function isOrphanModuleChat(chat: ModuleChat | null, activeQuestion: string): boolean {
  if (!chat || activeQuestion.trim().length > 0) {
    return false;
  }

  const hasOpenTurn = chat.turns.some(
    (turn) => turn.turn_status === 'awaiting_user' || turn.turn_status === 'processing',
  );

  if (hasOpenTurn) {
    return false;
  }

  return chat.chat_status === 'active' || chat.chat_status === 'waiting_for_user';
}

function deriveModulePhaseStep(params: {
  id: Exclude<PhaseId, 'intake' | 'report' | 'pdf_export'>;
  chat: ModuleChat | null;
  section: GeneratedSection | null;
  prerequisiteComplete: boolean;
  lockedReason: string;
  activeQuestion: string;
  readyAction: PhasePrimaryAction;
  problemProgressPercent?: number;
  notApplicable?: boolean;
  forceComplete?: boolean;
}): PhaseStep {
  const gapCounts = { openGapsCount: 0, resolvedGapsCount: 0 };

  if (params.notApplicable) {
    return createPhaseStep(params.id, 'not_applicable', {
      ...gapCounts,
      explanation: 'El triaje auditado indicó que esta fase no aplica para la propuesta.',
    });
  }

  if (!params.prerequisiteComplete) {
    return createPhaseStep(params.id, 'locked', {
      ...gapCounts,
      lockedReason: params.lockedReason,
    });
  }

  const hasRetryableFailedChat =
    params.chat?.chat_status === 'failed' &&
    params.chat.turns.some((turn) => isRetryableFailedModuleTurn(turn));

  if (
    !hasRetryableFailedChat &&
    (
      params.chat?.chat_status === 'blocked' ||
      params.chat?.chat_status === 'failed' ||
      params.section?.section_status === 'needs_revision'
    )
  ) {
    return createPhaseStep(params.id, 'error', {
      ...gapCounts,
      primaryAction: 'recover',
      explanation: 'La fase necesita revisión o recuperación antes de continuar.',
    });
  }

  if (params.forceComplete) {
    return createPhaseStep(params.id, 'complete', gapCounts);
  }

  if (isOrphanModuleChat(params.chat, params.activeQuestion)) {
    return createPhaseStep(params.id, 'ready', {
      ...gapCounts,
      progress: params.problemProgressPercent,
      primaryAction: params.readyAction,
      explanation: 'El inicio de esta fase se interrumpió. Puedes reintentarlo.',
    });
  }

  if (params.activeQuestion) {
    return createPhaseStep(params.id, 'current', {
      ...gapCounts,
      progress: params.problemProgressPercent,
      primaryAction: 'answer_question',
    });
  }

  if (isCompleteSection(params.section) || params.chat?.chat_status === 'completed') {
    return createPhaseStep(params.id, 'complete', gapCounts);
  }

  if (params.chat?.chat_status === 'active' || params.chat?.chat_status === 'waiting_for_user') {
    return createPhaseStep(params.id, 'current', {
      ...gapCounts,
      progress: params.problemProgressPercent,
      primaryAction: 'answer_question',
    });
  }

  if (params.chat?.chat_status === 'ready_to_generate') {
    return createPhaseStep(params.id, 'current', {
      ...gapCounts,
      progress: params.problemProgressPercent,
    });
  }

  return createPhaseStep(params.id, params.id === 'problem' ? 'current' : 'ready', {
    ...gapCounts,
    progress: params.problemProgressPercent,
    primaryAction: params.id === 'problem' ? 'answer_question' : params.readyAction,
  });
}

function derivePhaseProgress(input: {
  audit: SessionAuditView;
  problemProgress: SessionProgress;
  report: BasicAlphaReport | null;
  isDownloadingReportPdf: boolean;
  hasDownloadedReportPdf: boolean;
  isRecovering: boolean;
  lastKnownPhaseId: PhaseId | null;
  currentProblemQuestion: string;
  currentSolutionQuestion: string;
  currentDataAiPrivacyQuestion: string;
  currentMedicalDeviceTriageQuestion: string;
  currentResourcesPilotViabilityQuestion: string;
  moduleChats: Record<AlphaModule, ModuleChat | null>;
  sections: Record<SectionKind, GeneratedSection | null>;
}): PhaseProgress {
  const problemGapCounts = countModuleGaps(input.audit.gaps, 'problem');
  const solutionGapCounts = countModuleGaps(input.audit.gaps, 'solution');
  const dataGapCounts = countModuleGaps(input.audit.gaps, 'data_ai_privacy');
  const medicalGapCounts = countModuleGaps(input.audit.gaps, 'medical_device_triage');
  const resourcesGapCounts = countModuleGaps(input.audit.gaps, 'resources_pilot_viability');
  const medicalNotApplicable = hasExplicitMedicalDeviceNotApplicable(input.audit);

  const intake = createPhaseStep('intake', 'complete');
  const problem = deriveModulePhaseStep({
    id: 'problem',
    chat: input.moduleChats.problem,
    section: input.sections.problem,
    prerequisiteComplete: true,
    lockedReason: '',
    activeQuestion: input.currentProblemQuestion,
    readyAction: 'answer_question',
    problemProgressPercent: input.problemProgress.percent,
    forceComplete: input.audit.session.status === 'completed' && input.problemProgress.percent === 100,
  });
  const problemComplete = stepIsComplete(problem);
  const solution = deriveModulePhaseStep({
    id: 'solution',
    chat: input.moduleChats.solution,
    section: input.sections.solution,
    prerequisiteComplete: problemComplete,
    lockedReason: 'Completa la fase de problema antes de iniciar solución.',
    activeQuestion: input.currentSolutionQuestion,
    readyAction: 'start_solution',
  });
  const solutionComplete = stepIsComplete(solution);
  const dataAiPrivacy = deriveModulePhaseStep({
    id: 'data_ai_privacy',
    chat: input.moduleChats.data_ai_privacy,
    section: input.sections.data_ai_privacy,
    prerequisiteComplete: solutionComplete,
    lockedReason: 'Completa la fase de solución antes de revisar datos, IA y privacidad.',
    activeQuestion: input.currentDataAiPrivacyQuestion,
    readyAction: 'start_data_ai_privacy',
  });
  const dataComplete = stepIsComplete(dataAiPrivacy);
  const medicalDeviceTriage = deriveModulePhaseStep({
    id: 'medical_device_triage',
    chat: input.moduleChats.medical_device_triage,
    section: input.sections.medical_device_triage,
    prerequisiteComplete: dataComplete,
    lockedReason: 'Completa datos, IA y privacidad antes del triaje medical-device.',
    activeQuestion: input.currentMedicalDeviceTriageQuestion,
    readyAction: 'start_medical_device_triage',
    notApplicable: medicalNotApplicable,
  });
  const medicalComplete = stepIsComplete(medicalDeviceTriage);
  const resourcesPilotViability = deriveModulePhaseStep({
    id: 'resources_pilot_viability',
    chat: input.moduleChats.resources_pilot_viability,
    section: input.sections.resources_pilot_viability,
    prerequisiteComplete: dataComplete && medicalComplete,
    lockedReason: 'Completa datos/IA/privacidad y el triaje medical-device antes de recursos/piloto.',
    activeQuestion: input.currentResourcesPilotViabilityQuestion,
    readyAction: 'start_resources_pilot_viability',
  });

  const moduleSteps = new Map<PhaseId, PhaseStep>([
    ['problem', { ...problem, ...problemGapCounts }],
    ['solution', { ...solution, ...solutionGapCounts }],
    ['data_ai_privacy', { ...dataAiPrivacy, ...dataGapCounts }],
    ['medical_device_triage', { ...medicalDeviceTriage, ...medicalGapCounts }],
    ['resources_pilot_viability', { ...resourcesPilotViability, ...resourcesGapCounts }],
  ]);

  const reportPrerequisites = [
    moduleSteps.get('problem')!,
    moduleSteps.get('solution')!,
    moduleSteps.get('data_ai_privacy')!,
    moduleSteps.get('medical_device_triage')!,
    moduleSteps.get('resources_pilot_viability')!,
  ];
  const missingReportPrerequisites = reportPrerequisites
    .filter((step) => !stepIsComplete(step))
    .map((step) => step.label);
  const failedReportRun = input.audit.runs.some((run) =>
    run.run_purpose === 'basic_report_compose' &&
    run.status !== 'completed',
  );
  const reportStatus: PhaseStatus =
    input.report?.report_status === 'ready'
      ? 'complete'
      : input.report?.report_status === 'needs_revision' || failedReportRun
        ? 'error'
        : missingReportPrerequisites.length === 0
          ? 'ready'
          : 'locked';
  const report = createPhaseStep('report', reportStatus, {
    lockedReason:
      reportStatus === 'locked'
        ? `Faltan fases previas: ${missingReportPrerequisites.join(', ')}.`
        : null,
    primaryAction:
      reportStatus === 'ready'
        ? 'prepare_report'
        : reportStatus === 'complete'
          ? 'review_report'
          : reportStatus === 'error'
            ? 'recover'
            : 'none',
  });
  const pdfStatus: PhaseStatus =
    input.report?.report_status !== 'ready'
      ? 'locked'
      : input.hasDownloadedReportPdf
        ? 'complete'
        : input.isDownloadingReportPdf
          ? 'current'
          : 'ready';
  const pdfExport = createPhaseStep('pdf_export', pdfStatus, {
    lockedReason: pdfStatus === 'locked' ? 'Prepara el informe antes de exportar PDF.' : null,
    primaryAction: pdfStatus === 'ready' || pdfStatus === 'current' ? 'download_pdf' : 'none',
  });

  let steps = PHASE_ORDER.map((phaseId) => {
    if (phaseId === 'intake') {
      return intake;
    }

    if (phaseId === 'report') {
      return report;
    }

    if (phaseId === 'pdf_export') {
      return pdfExport;
    }

    return moduleSteps.get(phaseId)!;
  });

  // Product precedence: deepest active module question wins, then ready phases,
  // then PDF/export after report completion; recovery keeps the last known phase.
  const activeQuestionPhaseId =
    input.currentResourcesPilotViabilityQuestion ? 'resources_pilot_viability'
      : input.currentMedicalDeviceTriageQuestion ? 'medical_device_triage'
      : input.currentDataAiPrivacyQuestion ? 'data_ai_privacy'
      : input.currentSolutionQuestion ? 'solution'
      : input.currentProblemQuestion ? 'problem'
      : null;
  const nextReadyPhaseId = steps.find((step) => step.status === 'ready')?.id ?? null;
  const currentPhaseId =
    input.isRecovering && input.lastKnownPhaseId
      ? input.lastKnownPhaseId
      : activeQuestionPhaseId ??
        nextReadyPhaseId ??
        (report.status === 'complete' && pdfExport.status !== 'complete' ? 'pdf_export' : null) ??
        steps.find((step) => step.status === 'current' || step.status === 'error')?.id ??
        'pdf_export';

  steps = steps.map((step) => {
    if (step.id !== currentPhaseId) {
      return step;
    }

    if (input.isRecovering) {
      return {
        ...step,
        status: 'recovering',
        primaryAction: 'recover',
        progress: phaseProgressValue('recovering', step.progress),
      };
    }

    if (
      effectiveSessionStatus(input.audit) === 'blocked' ||
      effectiveSessionStatus(input.audit) === 'failed'
    ) {
      return {
        ...step,
        status: 'error',
        primaryAction: 'recover',
        progress: phaseProgressValue('error', step.progress),
      };
    }

    if (step.status === 'ready') {
      return {
        ...step,
        status: 'current',
        progress: phaseProgressValue('current', step.progress),
      };
    }

    return step;
  });

  const applicableSteps = steps.filter((step) => step.status !== 'not_applicable');
  const completedPhases = applicableSteps.filter((step) => step.status === 'complete').length;
  const totalApplicablePhases = applicableSteps.length;
  const percent = Math.round((completedPhases / totalApplicablePhases) * 100);
  const currentPhase = steps.find((step) => step.id === currentPhaseId) ?? steps[steps.length - 1];

  return {
    percent,
    completedPhases,
    totalApplicablePhases,
    currentPhaseId,
    currentPhaseLabel: currentPhase.label,
    isComplete: completedPhases === totalApplicablePhases,
    steps,
  };
}

export function deriveSessionPresentation(
  audit: SessionAuditView,
  options: DeriveSessionPresentationOptions = {},
): SessionPresentation {
  const latestSnapshot = audit.snapshots[audit.snapshots.length - 1] ?? null;
  const latestRun = audit.runs[audit.runs.length - 1] ?? null;
  const sessionStatus = effectiveSessionStatus(audit);
  const latestResolvedTurn = [...audit.turns]
    .reverse()
    .find((turn) => turn.status === 'resolved' || turn.status === 'failed');
  const openTurn = [...audit.turns]
    .reverse()
    .find((turn) =>
      turn.status === 'awaiting_user' ||
      turn.status === 'processing' ||
      isRetryableFailedConversationTurn(turn),
    );
  const structuredBrief =
    latestSnapshot?.structured_brief_json ?? audit.session.latest_structured_brief_json;
  const problemDefinition =
    latestSnapshot?.current_problem_definition_json ??
    audit.session.latest_problem_definition_json;
  const checklist = deriveChecklist(structuredBrief, problemDefinition);
  const gaps = audit.gaps;
  const problemModuleChat = findModuleChat(audit.module_chats, 'problem');
  const solutionModuleChat = findModuleChat(audit.module_chats, 'solution');
  const dataAiPrivacyModuleChat = findModuleChat(audit.module_chats, 'data_ai_privacy');
  const medicalDeviceTriageModuleChat = findModuleChat(audit.module_chats, 'medical_device_triage');
  const resourcesPilotViabilityModuleChat = findModuleChat(audit.module_chats, 'resources_pilot_viability');
  const activeSolutionTurn = findActiveModuleTurn(solutionModuleChat);
  const activeDataAiPrivacyTurn = findActiveModuleTurn(dataAiPrivacyModuleChat);
  const activeMedicalDeviceTriageTurn = findActiveModuleTurn(medicalDeviceTriageModuleChat);
  const activeResourcesPilotViabilityTurn = findActiveModuleTurn(resourcesPilotViabilityModuleChat);
  const latestProblemSection = findLatestVisibleSection(audit.generated_sections, 'problem');
  const latestSolutionSection = findLatestVisibleSection(audit.generated_sections, 'solution');
  const latestDataAiPrivacySection = findLatestVisibleSection(audit.generated_sections, 'data_ai_privacy');
  const latestMedicalDeviceTriageSection = findLatestVisibleSection(audit.generated_sections, 'medical_device_triage');
  const latestResourcesPilotViabilitySection = findLatestVisibleSection(audit.generated_sections, 'resources_pilot_viability');
  const currentProblemQuestion = openTurn?.question_text ?? latestSnapshot?.next_question_text ?? '';
  const currentSolutionQuestion = activeSolutionTurn?.question_text ?? '';
  const currentDataAiPrivacyQuestion = activeDataAiPrivacyTurn?.question_text ?? '';
  const currentMedicalDeviceTriageQuestion = activeMedicalDeviceTriageTurn?.question_text ?? '';
  const currentResourcesPilotViabilityQuestion = activeResourcesPilotViabilityTurn?.question_text ?? '';
  const problemProgress = deriveProblemProgress(checklist, sessionStatus);
  const phaseProgress = derivePhaseProgress({
    audit,
    problemProgress,
    report: options.report ?? null,
    isDownloadingReportPdf: options.isDownloadingReportPdf ?? false,
    hasDownloadedReportPdf: options.hasDownloadedReportPdf ?? false,
    isRecovering: options.isRecovering ?? false,
    lastKnownPhaseId: options.lastKnownPhaseId ?? null,
    currentProblemQuestion,
    currentSolutionQuestion,
    currentDataAiPrivacyQuestion,
    currentMedicalDeviceTriageQuestion,
    currentResourcesPilotViabilityQuestion,
    moduleChats: {
      problem: problemModuleChat,
      solution: solutionModuleChat,
      data_ai_privacy: dataAiPrivacyModuleChat,
      medical_device_triage: medicalDeviceTriageModuleChat,
      resources_pilot_viability: resourcesPilotViabilityModuleChat,
    },
    sections: {
      problem: latestProblemSection,
      solution: latestSolutionSection,
      data_ai_privacy: latestDataAiPrivacySection,
      medical_device_triage: latestMedicalDeviceTriageSection,
      resources_pilot_viability: latestResourcesPilotViabilitySection,
    },
  });
  const conversationHistoryByPhase = deriveConversationHistoryByPhase({
    auditTurns: audit.turns,
    problemModuleChat,
    solutionModuleChat,
    dataAiPrivacyModuleChat,
    medicalDeviceTriageModuleChat,
    resourcesPilotViabilityModuleChat,
  });
  const conversationHistoryTurns = deriveConversationHistoryTurns({
    auditTurns: audit.turns,
    currentPhaseId: phaseProgress.currentPhaseId,
    currentResourcesPilotViabilityQuestion,
    currentMedicalDeviceTriageQuestion,
    currentDataAiPrivacyQuestion,
    currentSolutionQuestion,
    problemModuleChat,
    solutionModuleChat,
    dataAiPrivacyModuleChat,
    medicalDeviceTriageModuleChat,
    resourcesPilotViabilityModuleChat,
  });

  return {
    sessionId: audit.session.id,
    projectTitle: audit.session.project_title,
    goal: audit.session.goal,
    stage: audit.session.current_stage,
    status: sessionStatus,
    agentStatus: latestSnapshot?.agent_status ?? fallbackAgentStatus(sessionStatus),
    structuredBrief,
    problemDefinition,
    gaps,
    problemModuleChat,
    solutionModuleChat,
    dataAiPrivacyModuleChat,
    medicalDeviceTriageModuleChat,
    resourcesPilotViabilityModuleChat,
    latestProblemSection,
    latestSolutionSection,
    latestDataAiPrivacySection,
    latestMedicalDeviceTriageSection,
    latestResourcesPilotViabilitySection,
    detectedGaps: gaps.length > 0
      ? gaps.map((gap) => `${gap.field}: ${gap.description}`)
      : latestSnapshot?.detected_gaps_json ?? [],
    latestDiagnosis: latestResolvedTurn?.diagnosis_json ?? [],
    currentQuestion:
      currentResourcesPilotViabilityQuestion ||
      currentMedicalDeviceTriageQuestion ||
      currentDataAiPrivacyQuestion ||
      currentSolutionQuestion ||
      currentProblemQuestion,
    currentSolutionQuestion,
    currentDataAiPrivacyQuestion,
    currentMedicalDeviceTriageQuestion,
    currentResourcesPilotViabilityQuestion,
    completionReason:
      latestResolvedTurn?.completion_reason ??
      latestSnapshot?.completion_reason ??
      audit.session.completion_reason ??
      '',
    warnings: latestSnapshot?.warnings_json ?? [],
    turns: audit.turns,
    conversationHistoryTurns,
    conversationHistoryByPhase,
    latestRun,
    latestSnapshot,
    runCount: audit.runs.length,
    snapshotCount: audit.snapshots.length,
    eventCount: audit.events.length,
    checklist,
    progress: problemProgress,
    phaseProgress,
  };
}
