import type {
  AlphaGap,
  GeneratedSection,
  ProposalSource,
  SolutionDefinitionState,
  SolutionDefinitionTurn,
} from '../contracts/types';
import { enforceSingleQuestion, isVagueAnswer } from './problem-definition';

const FORBIDDEN_TOPIC_PATTERNS = [
  /\bbusiness plan\b/i,
  /\bmarket\b/i,
  /\bpricing\b/i,
  /\brevenue\b/i,
  /\bcommercial/i,
  /\bcost\b/i,
  /\bbudget\b/i,
  /\blegal\b/i,
  /\bregulator/i,
  /\bmedical device\b/i,
  /\bpdf\b/i,
  /\brag\b/i,
  /\bretrieval\b/i,
  /\bscore\b/i,
  /\branking\b/i,
  /\bapproval\b/i,
];

const SOLUTION_CLARIFICATION_DIAGNOSIS_TERMS = [
  'not clear',
  'unclear',
  'needs detail',
  'needs details',
  'needs clarification',
  'clarify',
  'who exactly',
  'missing detail',
  'missing information',
  'not specified',
  'falta',
  'no esta claro',
  'no queda claro',
  'necesita detalle',
  'necesita aclar',
  'requiere aclar',
  'quien exactamente',
  'ambiguo',
  'ambigua',
  'no se especific',
];

const SOLUTION_FIELD_PRIORITY = [
  'solution_summary',
  'target_user',
  'how_it_works',
  'workflow_change',
  'current_solutions',
  'value_differential',
  'scope_limits',
  'assumptions',
] as const;

const MIN_SOLUTION_SUMMARY_LENGTH = 12;
const MIN_TARGET_USER_LENGTH = 3;
const MIN_HOW_IT_WORKS_LENGTH = 12;
const MIN_WORKFLOW_CHANGE_LENGTH = 12;
const MIN_CURRENT_SOLUTIONS_LENGTH = 8;
const MIN_VALUE_DIFFERENTIAL_LENGTH = 8;
const MIN_SCOPE_LIMITS_LENGTH = 8;
const MIN_ASSUMPTIONS_COUNT = 1;
const MAX_OPEN_AMBIGUITIES_FOR_COMPLETION = 1;

export interface SolutionGapStatusChange {
  gapId: string;
  gapStatus: 'in_progress' | 'resolved';
  resolvedByTurnId?: string;
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

function hasEnoughText(value: string, minLength: number): boolean {
  return value.trim().length >= minLength;
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase();
}

function containsAny(value: string, terms: string[]): boolean {
  const normalized = normalizeForSearch(value);
  return terms.some((term) => normalized.includes(normalizeForSearch(term)));
}

function diagnosisRequestsSolutionClarification(diagnosis: string[]): boolean {
  return containsAny(diagnosis.join(' '), SOLUTION_CLARIFICATION_DIAGNOSIS_TERMS);
}

function solutionStateContainsForbiddenTopic(state: SolutionDefinitionState): boolean {
  const values = [
    state.solution_summary,
    state.target_user,
    state.how_it_works,
    state.workflow_change,
    state.current_solutions,
    state.value_differential,
    state.scope_limits,
    ...state.assumptions,
    ...state.ambiguities_remaining,
  ];

  return values.some((value) =>
    FORBIDDEN_TOPIC_PATTERNS.some((pattern) => pattern.test(value)),
  );
}

function isAllowedSolutionSource(source: ProposalSource): boolean {
  return source.source_kind === 'pasted_text' ||
    source.source_kind === 'uploaded_file' ||
    source.source_kind === 'extracted_text' ||
    source.source_kind === 'user_answer' ||
    source.source_kind === 'generated_section';
}

function sortSolutionGaps(left: AlphaGap, right: AlphaGap): number {
  const leftPriority = SOLUTION_FIELD_PRIORITY.indexOf(left.field as (typeof SOLUTION_FIELD_PRIORITY)[number]);
  const rightPriority = SOLUTION_FIELD_PRIORITY.indexOf(right.field as (typeof SOLUTION_FIELD_PRIORITY)[number]);
  const normalizedLeft = leftPriority === -1 ? SOLUTION_FIELD_PRIORITY.length : leftPriority;
  const normalizedRight = rightPriority === -1 ? SOLUTION_FIELD_PRIORITY.length : rightPriority;

  if (normalizedLeft !== normalizedRight) {
    return normalizedLeft - normalizedRight;
  }

  return left.created_at.localeCompare(right.created_at) || left.gap_id.localeCompare(right.gap_id);
}

function hasResolvedSolutionGapField(gap: AlphaGap, solutionDefinition: SolutionDefinitionState): boolean {
  const missing = computeSolutionMissingInformation(solutionDefinition);

  if (missing.includes(gap.field)) {
    return false;
  }

  if (gap.origin === 'structured_brief_ambiguity') {
    const normalizedDescription = gap.description.toLocaleLowerCase();
    return !solutionDefinition.ambiguities_remaining.some((ambiguity) =>
      normalizedDescription.includes(ambiguity.toLocaleLowerCase()) ||
      ambiguity.toLocaleLowerCase().includes(normalizedDescription),
    );
  }

  return SOLUTION_FIELD_PRIORITY.includes(gap.field as (typeof SOLUTION_FIELD_PRIORITY)[number]);
}

export function emptySolutionDefinition(): SolutionDefinitionState {
  return {
    solution_summary: '',
    target_user: '',
    how_it_works: '',
    workflow_change: '',
    current_solutions: '',
    value_differential: '',
    scope_limits: '',
    assumptions: [],
    ambiguities_remaining: [],
  };
}

export function computeSolutionMissingInformation(solutionDefinition: SolutionDefinitionState): string[] {
  const missing: string[] = [];

  if (isBlank(solutionDefinition.solution_summary)) {
    missing.push('solution_summary');
  }

  if (isBlank(solutionDefinition.target_user)) {
    missing.push('target_user');
  }

  if (isBlank(solutionDefinition.how_it_works)) {
    missing.push('how_it_works');
  }

  if (isBlank(solutionDefinition.workflow_change)) {
    missing.push('workflow_change');
  }

  if (isBlank(solutionDefinition.current_solutions)) {
    missing.push('current_solutions');
  }

  if (isBlank(solutionDefinition.value_differential)) {
    missing.push('value_differential');
  }

  if (isBlank(solutionDefinition.scope_limits)) {
    missing.push('scope_limits');
  }

  if (solutionDefinition.assumptions.length === 0) {
    missing.push('assumptions');
  }

  return missing;
}

export function evaluateSolutionCompletion(solutionDefinition: SolutionDefinitionState): boolean {
  // Alpha v1 completion is a deterministic guardrail for safe section rendering,
  // not a qualitative score of the proposed solution.
  return (
    hasEnoughText(solutionDefinition.solution_summary, MIN_SOLUTION_SUMMARY_LENGTH) &&
    hasEnoughText(solutionDefinition.target_user, MIN_TARGET_USER_LENGTH) &&
    hasEnoughText(solutionDefinition.how_it_works, MIN_HOW_IT_WORKS_LENGTH) &&
    hasEnoughText(solutionDefinition.workflow_change, MIN_WORKFLOW_CHANGE_LENGTH) &&
    hasEnoughText(solutionDefinition.current_solutions, MIN_CURRENT_SOLUTIONS_LENGTH) &&
    hasEnoughText(solutionDefinition.value_differential, MIN_VALUE_DIFFERENTIAL_LENGTH) &&
    hasEnoughText(solutionDefinition.scope_limits, MIN_SCOPE_LIMITS_LENGTH) &&
    solutionDefinition.assumptions.length >= MIN_ASSUMPTIONS_COUNT &&
    solutionDefinition.ambiguities_remaining.length <= MAX_OPEN_AMBIGUITIES_FOR_COMPLETION
  );
}

export function buildSolutionFallbackQuestion(solutionDefinition: SolutionDefinitionState): string {
  const missing = computeSolutionMissingInformation(solutionDefinition);

  if (missing.includes('solution_summary')) {
    return 'Que hace la solucion propuesta en terminos concretos, sin entrar en costes ni regulacion?';
  }

  if (missing.includes('target_user')) {
    return 'Que usuario o equipo usara directamente esta solucion y en que momento del trabajo?';
  }

  if (missing.includes('how_it_works')) {
    return 'Como funciona la solucion a nivel operativo, paso a paso, usando solo lo que ya sabeis?';
  }

  if (missing.includes('workflow_change')) {
    return 'Que cambia en el flujo de trabajo actual cuando se usa esta solucion?';
  }

  if (missing.includes('current_solutions')) {
    return 'Que soluciones o alternativas se usan hoy y que limitacion concreta mantiene abierta esta propuesta?';
  }

  if (missing.includes('value_differential')) {
    return 'Que diferencia de valor aporta esta solucion frente a las alternativas actuales?';
  }

  if (missing.includes('scope_limits')) {
    return 'Que queda dentro y fuera del alcance de esta solucion en esta primera version?';
  }

  if (missing.includes('assumptions')) {
    return 'Que supuesto importante sobre la solucion sigue sin validar?';
  }

  const firstAmbiguity = solutionDefinition.ambiguities_remaining[0];

  if (firstAmbiguity) {
    return `Puedes concretar este punto de la solucion que sigue ambiguo: ${firstAmbiguity}?`;
  }

  return 'Que detalle falta para que la solucion quede claramente definida sin inventar informacion?';
}

export function selectSolutionGapRefs(
  gaps: AlphaGap[],
  solutionDefinition: SolutionDefinitionState,
): string[] {
  const missing = computeSolutionMissingInformation(solutionDefinition);

  return gaps
    .filter((gap) =>
      gap.module === 'solution' &&
      (gap.gap_status === 'open' || gap.gap_status === 'in_progress') &&
      !hasResolvedSolutionGapField(gap, solutionDefinition) &&
      (
        missing.includes(gap.field) ||
        gap.origin === 'structured_brief_ambiguity' ||
        gap.gap_kind === 'needs_user_confirmation'
      ),
    )
    .sort(sortSolutionGaps)
    .slice(0, 3)
    .map((gap) => gap.gap_id);
}

export function classifySolutionGapStatuses(
  gaps: AlphaGap[],
  solutionDefinition: SolutionDefinitionState,
  answeredTurnId?: string,
): SolutionGapStatusChange[] {
  const candidateGapRefs = new Set(selectSolutionGapRefs(gaps, solutionDefinition));
  const changes: SolutionGapStatusChange[] = [];

  for (const gap of gaps.filter((item) => item.module === 'solution').sort(sortSolutionGaps)) {
    if (gap.gap_status === 'resolved' || gap.gap_status === 'deferred' || gap.gap_status === 'not_applicable') {
      continue;
    }

    if (answeredTurnId && hasResolvedSolutionGapField(gap, solutionDefinition)) {
      changes.push({
        gapId: gap.gap_id,
        gapStatus: 'resolved',
        resolvedByTurnId: answeredTurnId,
      });
      continue;
    }

    if (candidateGapRefs.has(gap.gap_id) && gap.gap_status === 'open') {
      changes.push({
        gapId: gap.gap_id,
        gapStatus: 'in_progress',
      });
    }
  }

  return changes;
}

export function buildSolutionSectionSourceRefs(
  initialSources: ProposalSource[],
  userAnswerSources: ProposalSource[],
  problemSection?: GeneratedSection | null,
): ProposalSource[] {
  const sourcesById = new Map<string, ProposalSource>();

  for (const source of [...initialSources, ...userAnswerSources, ...(problemSection?.source_refs ?? [])]) {
    if (isAllowedSolutionSource(source)) {
      sourcesById.set(source.source_id, source);
    }
  }

  return Array.from(sourcesById.values());
}

export function renderSolutionSection(
  solutionDefinition: SolutionDefinitionState,
  params: { sourceCount: number; gapCount: number },
): { title: string; contentMarkdown: string; warnings: string[] } {
  const warnings: string[] = [];
  const assumptions = solutionDefinition.assumptions.length > 0
    ? solutionDefinition.assumptions.map((assumption) => `- ${assumption}`).join('\n')
    : '- No explicit persisted solution assumptions.';
  const ambiguities = solutionDefinition.ambiguities_remaining.length > 0
    ? solutionDefinition.ambiguities_remaining.map((ambiguity) => `- ${ambiguity}`).join('\n')
    : '- No relevant open solution ambiguities.';

  if (params.sourceCount === 0) {
    warnings.push('Solution section has no internal source references');
  }

  if (params.gapCount === 0) {
    warnings.push('Solution section has no resolved gap references');
  }

  return {
    title: 'Solution definition',
    contentMarkdown: [
      '## Solution summary',
      solutionDefinition.solution_summary,
      '',
      '## Target user',
      solutionDefinition.target_user,
      '',
      '## How it works',
      solutionDefinition.how_it_works,
      '',
      '## Workflow change',
      solutionDefinition.workflow_change,
      '',
      '## Current solutions',
      solutionDefinition.current_solutions,
      '',
      '## Value differential',
      solutionDefinition.value_differential,
      '',
      '## Scope and limits',
      solutionDefinition.scope_limits,
      '',
      '## Assumptions',
      assumptions,
      '',
      '## Remaining ambiguities',
      ambiguities,
    ].join('\n'),
    warnings,
  };
}

export function enforceSolutionTurnGuardrails(
  turn: SolutionDefinitionTurn,
  latestAnswer?: string,
  options: { isInitialRun?: boolean } = {},
): {
  turn: SolutionDefinitionTurn;
  warnings: string[];
  updatedSolutionDefinition: SolutionDefinitionState;
  detectedGaps: string[];
  latestAnswerWasVague: boolean;
} {
  const warnings: string[] = [];
  const nextQuestion = enforceSingleQuestion(turn.next_question);
  const normalizedTurn: SolutionDefinitionTurn = {
    ...turn,
    diagnosis: turn.diagnosis.slice(0, 3),
    next_question: nextQuestion,
    updated_solution_definition: {
      solution_summary: turn.updated_solution_definition.solution_summary.trim(),
      target_user: turn.updated_solution_definition.target_user.trim(),
      how_it_works: turn.updated_solution_definition.how_it_works.trim(),
      workflow_change: turn.updated_solution_definition.workflow_change.trim(),
      current_solutions: turn.updated_solution_definition.current_solutions.trim(),
      value_differential: turn.updated_solution_definition.value_differential.trim(),
      scope_limits: turn.updated_solution_definition.scope_limits.trim(),
      assumptions: dedupe(turn.updated_solution_definition.assumptions),
      ambiguities_remaining: dedupe(turn.updated_solution_definition.ambiguities_remaining),
    },
  };

  const latestAnswerIsVague = latestAnswer ? isVagueAnswer(latestAnswer) : false;
  const questionContainsForbiddenTopic = FORBIDDEN_TOPIC_PATTERNS.some((pattern) =>
    pattern.test(nextQuestion),
  );

  if (latestAnswerIsVague && normalizedTurn.agent_status === 'done') {
    warnings.push('Latest solution answer was vague; forcing continue status');
    normalizedTurn.agent_status = 'continue';
    normalizedTurn.completion_reason = '';
  }

  if (questionContainsForbiddenTopic) {
    warnings.push('Model drifted into a forbidden solution topic; question was replaced with a fallback');
    normalizedTurn.next_question = buildSolutionFallbackQuestion(normalizedTurn.updated_solution_definition);
  }

  if (solutionStateContainsForbiddenTopic(normalizedTurn.updated_solution_definition)) {
    warnings.push('Model drifted into forbidden solution content; forcing clarification');
    normalizedTurn.agent_status = 'continue';
    normalizedTurn.completion_reason = '';
    normalizedTurn.next_question = buildSolutionFallbackQuestion(normalizedTurn.updated_solution_definition);
  }

  const isComplete = evaluateSolutionCompletion(normalizedTurn.updated_solution_definition);
  const rawDoneHadMeaningfulQuestion = turn.agent_status === 'done' && nextQuestion.length > 0;
  const rawDoneHadMissingDetailsDiagnosis =
    turn.agent_status === 'done' &&
    diagnosisRequestsSolutionClarification(normalizedTurn.diagnosis);
  const initialRunHasUnresolvedSolutionSignals =
    turn.agent_status === 'done' &&
    options.isInitialRun === true &&
    !latestAnswer &&
    (rawDoneHadMeaningfulQuestion || rawDoneHadMissingDetailsDiagnosis);

  if (
    normalizedTurn.agent_status === 'done' &&
    (rawDoneHadMeaningfulQuestion || rawDoneHadMissingDetailsDiagnosis || initialRunHasUnresolvedSolutionSignals)
  ) {
    warnings.push('Model marked solution lane as done while unresolved clarification signals remained');
    normalizedTurn.agent_status = 'continue';
    normalizedTurn.completion_reason = '';
    normalizedTurn.next_question =
      normalizedTurn.next_question || buildSolutionFallbackQuestion(normalizedTurn.updated_solution_definition);
  }

  if (normalizedTurn.agent_status === 'done' && !isComplete) {
    warnings.push('Model marked solution lane as done before completion criteria were met');
    normalizedTurn.agent_status = 'continue';
    normalizedTurn.completion_reason = '';
    normalizedTurn.next_question = buildSolutionFallbackQuestion(normalizedTurn.updated_solution_definition);
  }

  if (normalizedTurn.agent_status !== 'done' && !normalizedTurn.next_question) {
    warnings.push('Model did not produce a usable solution question; fallback question generated');
    normalizedTurn.next_question = buildSolutionFallbackQuestion(normalizedTurn.updated_solution_definition);
  }

  if (normalizedTurn.agent_status === 'done') {
    normalizedTurn.next_question = '';
    normalizedTurn.completion_reason = normalizedTurn.completion_reason || 'solution sufficiently defined';
  }

  if (latestAnswerIsVague) {
    warnings.push('Latest solution answer was vague; clarification was narrowed');
    normalizedTurn.agent_status = 'continue';
    normalizedTurn.completion_reason = '';
    normalizedTurn.next_question = buildSolutionFallbackQuestion(normalizedTurn.updated_solution_definition);
  }

  return {
    turn: normalizedTurn,
    warnings,
    updatedSolutionDefinition: normalizedTurn.updated_solution_definition,
    detectedGaps: computeSolutionMissingInformation(normalizedTurn.updated_solution_definition),
    latestAnswerWasVague: latestAnswerIsVague,
  };
}
