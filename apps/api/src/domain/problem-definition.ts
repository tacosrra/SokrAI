import type {
  AlphaGap,
  ProblemDefinitionState,
  ProblemDefinitionTurn,
  ProposalSource,
  StructuredBrief,
} from '../contracts/types';

const VAGUE_PATTERNS = [
  /^no lo se$/i,
  /^no sé$/i,
  /^depende$/i,
  /^no estoy seguro/i,
  /^ni idea$/i,
  /^not sure$/i,
];

const FORBIDDEN_TOPIC_PATTERNS = [
  /\blegal\b/i,
  /\bregulator/i,
  /\bcost/i,
  /\bbudget/i,
  /\barchitecture\b/i,
  /\bsolution\b/i,
  /\bimplement/i,
];

const PROBLEM_FIELD_PRIORITY = [
  'problem_owner',
  'problem_statement',
  'evidence_of_problem',
  'scope',
  'current_alternatives',
  'assumptions',
] as const;

export interface ProblemGapStatusChange {
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

function countContainedTerms(value: string, terms: string[]): number {
  const normalized = normalizeForSearch(value);
  return terms.filter((term) => normalized.includes(normalizeForSearch(term))).length;
}

function removeResolvedStaleAmbiguities(
  problemDefinition: ProblemDefinitionState,
  latestAnswer?: string,
): ProblemDefinitionState {
  const explicitEvidence = [
    latestAnswer ?? '',
    problemDefinition.problem_statement,
    problemDefinition.evidence_of_problem,
    problemDefinition.scope,
    problemDefinition.current_alternatives,
    ...problemDefinition.assumptions,
  ].join(' ');

  const bottleneckResolutionTerms = [
    'clasificacion inicial',
    'initial classification',
    'triaje administrativo',
    'administrative triage',
    'solicitudes ambiguas',
    'ambiguous administrative requests',
    'pedir mas datos',
    'request more data',
    'escalar',
    'escalate',
    'derivar',
    'enfermeria',
    'nursing',
    'resolver administr',
  ];

  const minimumDataTerms = [
    'motivo',
    'reason',
    'canal',
    'channel',
    'sintomas',
    'symptoms',
    'empeoramiento',
    'worsening',
    'procedimiento administrativo',
    'administrative procedure',
    'datos faltantes',
    'missing fields',
    'criterio de escalado',
    'criterios de escalado',
    'escalation criteria',
  ];

  const workflowChangeTerms = [
    'ficha estructurada',
    'structured card',
    'primer triaje',
    'first administrative triage',
    'triaje administrativo',
    'administrative triage',
    'revision humana',
    'human review',
    'confirmacion humana',
    'human confirmation',
  ];

  const filteredAmbiguities = problemDefinition.ambiguities_remaining.filter((ambiguity) => {
    const normalizedAmbiguity = normalizeForSearch(ambiguity);

    if (
      (normalizedAmbiguity.includes('cuello de botella') || normalizedAmbiguity.includes('bottleneck')) &&
      containsAny(explicitEvidence, bottleneckResolutionTerms)
    ) {
      return false;
    }

    if (
      (
        normalizedAmbiguity.includes('datos minimos') ||
        normalizedAmbiguity.includes('parte del flujo') ||
        normalizedAmbiguity.includes('workflow') ||
        normalizedAmbiguity.includes('flujo')
      ) &&
      countContainedTerms(explicitEvidence, minimumDataTerms) >= 2 &&
      containsAny(explicitEvidence, workflowChangeTerms)
    ) {
      return false;
    }

    return true;
  });

  if (filteredAmbiguities.length === problemDefinition.ambiguities_remaining.length) {
    return problemDefinition;
  }

  return {
    ...problemDefinition,
    ambiguities_remaining: filteredAmbiguities,
  };
}

function isInternalSource(source: ProposalSource): boolean {
  return source.source_kind === 'pasted_text' ||
    source.source_kind === 'uploaded_file' ||
    source.source_kind === 'extracted_text' ||
    source.source_kind === 'user_answer';
}

function hasResolvedGapField(gap: AlphaGap, problemDefinition: ProblemDefinitionState): boolean {
  const missing = computeMissingInformation(problemDefinition);

  if (missing.includes(gap.field)) {
    return false;
  }

  if (gap.origin === 'structured_brief_ambiguity') {
    const normalizedDescription = gap.description.toLocaleLowerCase();
    return !problemDefinition.ambiguities_remaining.some((ambiguity) =>
      normalizedDescription.includes(ambiguity.toLocaleLowerCase()) ||
      ambiguity.toLocaleLowerCase().includes(normalizedDescription),
    );
  }

  return PROBLEM_FIELD_PRIORITY.includes(gap.field as (typeof PROBLEM_FIELD_PRIORITY)[number]);
}

function sortProblemGaps(left: AlphaGap, right: AlphaGap): number {
  const leftPriority = PROBLEM_FIELD_PRIORITY.indexOf(left.field as (typeof PROBLEM_FIELD_PRIORITY)[number]);
  const rightPriority = PROBLEM_FIELD_PRIORITY.indexOf(right.field as (typeof PROBLEM_FIELD_PRIORITY)[number]);
  const normalizedLeft = leftPriority === -1 ? PROBLEM_FIELD_PRIORITY.length : leftPriority;
  const normalizedRight = rightPriority === -1 ? PROBLEM_FIELD_PRIORITY.length : rightPriority;

  if (normalizedLeft !== normalizedRight) {
    return normalizedLeft - normalizedRight;
  }

  return left.created_at.localeCompare(right.created_at) || left.gap_id.localeCompare(right.gap_id);
}

export function isVagueAnswer(answer: string): boolean {
  const trimmed = answer.trim();

  if (trimmed.length < 12) {
    return true;
  }

  return VAGUE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function computeMissingInformation(problemDefinition: ProblemDefinitionState): string[] {
  const missing: string[] = [];

  if (isBlank(problemDefinition.problem_owner)) {
    missing.push('problem_owner');
  }

  if (isBlank(problemDefinition.problem_statement)) {
    missing.push('problem_statement');
  }

  if (isBlank(problemDefinition.evidence_of_problem)) {
    missing.push('evidence_of_problem');
  }

  if (isBlank(problemDefinition.scope)) {
    missing.push('scope');
  }

  if (isBlank(problemDefinition.current_alternatives)) {
    missing.push('current_alternatives');
  }

  if (problemDefinition.assumptions.length === 0) {
    missing.push('assumptions');
  }

  return missing;
}

export function evaluateCompletion(problemDefinition: ProblemDefinitionState): boolean {
  // Assumptions are preserved when present, but Alpha problem completion only
  // blocks on the required problem fields and open ambiguities.
  return (
    hasEnoughText(problemDefinition.problem_owner, 3) &&
    hasEnoughText(problemDefinition.problem_statement, 12) &&
    hasEnoughText(problemDefinition.evidence_of_problem, 12) &&
    hasEnoughText(problemDefinition.scope, 8) &&
    hasEnoughText(problemDefinition.current_alternatives, 8) &&
    problemDefinition.ambiguities_remaining.length <= 1
  );
}

export function buildFallbackQuestion(problemDefinition: ProblemDefinitionState): string {
  const missing = computeMissingInformation(problemDefinition);

  if (missing.includes('problem_owner')) {
    return '¿Qué persona o equipo vive hoy este problema y responde por sus consecuencias?';
  }

  if (missing.includes('problem_statement')) {
    return '¿Cuál es el problema concreto que ocurre hoy, sin describir todavía la solución deseada?';
  }

  if (missing.includes('evidence_of_problem')) {
    return '¿Qué evidencia observable tienes de que este problema existe y genera impacto real?';
  }

  if (missing.includes('scope')) {
    return '¿En qué contexto exacto aparece este problema y qué casos quedarían fuera del alcance?';
  }

  if (missing.includes('current_alternatives')) {
    return '¿Cómo se intenta resolver hoy este problema y qué limitaciones tienen esas alternativas actuales?';
  }

  if (missing.includes('assumptions')) {
    return '¿Qué supuesto importante estáis dando por cierto hoy y todavía no habéis validado?';
  }

  const firstAmbiguity = problemDefinition.ambiguities_remaining[0];

  if (firstAmbiguity) {
    return `¿Puedes concretar este punto que sigue ambiguo: ${firstAmbiguity}?`;
  }

  return '¿Qué detalle falta para que el problema quede claramente definido antes de hablar de soluciones?';
}

/**
 * Selects the highest-priority open Alpha problem gaps that should be attached
 * to the next clarification turn. The cap keeps each turn focused and auditable.
 */
export function selectProblemGapRefs(
  gaps: AlphaGap[],
  problemDefinition: ProblemDefinitionState,
): string[] {
  const missing = computeMissingInformation(problemDefinition);

  return gaps
    .filter((gap) =>
      gap.module === 'problem' &&
      (gap.gap_status === 'open' || gap.gap_status === 'in_progress') &&
      !hasResolvedGapField(gap, problemDefinition) &&
      (
        missing.includes(gap.field) ||
        gap.origin === 'structured_brief_ambiguity' ||
        gap.gap_kind === 'needs_user_confirmation'
      ),
    )
    .sort(sortProblemGaps)
    .slice(0, 3)
    .map((gap) => gap.gap_id);
}

/**
 * Classifies persisted Alpha problem gaps after a user answer. Completed fields
 * resolve their gaps; still-missing or ambiguous fields stay open/in progress.
 */
export function classifyProblemGapStatuses(
  gaps: AlphaGap[],
  problemDefinition: ProblemDefinitionState,
  answeredTurnId?: string,
): ProblemGapStatusChange[] {
  const candidateGapRefs = new Set(selectProblemGapRefs(gaps, problemDefinition));
  const changes: ProblemGapStatusChange[] = [];

  for (const gap of gaps.filter((item) => item.module === 'problem').sort(sortProblemGaps)) {
    if (gap.gap_status === 'resolved' || gap.gap_status === 'deferred' || gap.gap_status === 'not_applicable') {
      continue;
    }

    if (answeredTurnId && hasResolvedGapField(gap, problemDefinition)) {
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

/**
 * Builds the internal source refs allowed for deterministic problem sections.
 * External, generated, or unrelated sources are intentionally excluded.
 */
export function buildProblemSectionSourceRefs(
  initialSources: ProposalSource[],
  userAnswerSources: ProposalSource[],
): ProposalSource[] {
  const sourcesById = new Map<string, ProposalSource>();

  for (const source of [...initialSources, ...userAnswerSources]) {
    if (isInternalSource(source)) {
      sourcesById.set(source.source_id, source);
    }
  }

  return Array.from(sourcesById.values());
}

/**
 * Renders the terminal Alpha problem section from persisted problem state only.
 * It does not introduce solution, pilot, legal, cost, or retrieval content.
 */
export function renderProblemSection(
  problemDefinition: ProblemDefinitionState,
  params: { sourceCount: number; gapCount: number },
): { title: string; contentMarkdown: string; warnings: string[] } {
  const warnings: string[] = [];
  const assumptions = problemDefinition.assumptions.length > 0
    ? problemDefinition.assumptions.map((assumption) => `- ${assumption}`).join('\n')
    : '- Sin supuestos explícitos persistidos.';
  const ambiguities = problemDefinition.ambiguities_remaining.length > 0
    ? problemDefinition.ambiguities_remaining.map((ambiguity) => `- ${ambiguity}`).join('\n')
    : '- Sin ambigüedades abiertas relevantes.';

  if (params.sourceCount === 0) {
    warnings.push('Problem section has no internal source references');
  }

  if (params.gapCount === 0) {
    warnings.push('Problem section has no resolved gap references');
  }

  return {
    title: 'Problem definition',
    contentMarkdown: [
      '## Problem owner',
      problemDefinition.problem_owner,
      '',
      '## Problem statement',
      problemDefinition.problem_statement,
      '',
      '## Evidence of the problem',
      problemDefinition.evidence_of_problem,
      '',
      '## Scope',
      problemDefinition.scope,
      '',
      '## Current alternatives',
      problemDefinition.current_alternatives,
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

export function enforceSingleQuestion(question: string): string {
  const trimmed = question.trim();

  if (!trimmed) {
    return trimmed;
  }

  const sentences = trimmed
    .split(/[?？]/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const primarySentence = sentences[0] ?? trimmed.replace(/\?+$/, '').trim();

  return `${primarySentence}?`;
}

export function applyTurnToBrief(
  brief: StructuredBrief,
  turn: ProblemDefinitionTurn,
  latestAnswer?: string,
): {
  updatedBrief: StructuredBrief;
  updatedProblemDefinition: ProblemDefinitionState;
  detectedGaps: string[];
} {
  const updatedProblemDefinition = removeResolvedStaleAmbiguities({
    problem_owner: turn.updated_problem_definition.problem_owner.trim(),
    problem_statement: turn.updated_problem_definition.problem_statement.trim(),
    evidence_of_problem: turn.updated_problem_definition.evidence_of_problem.trim(),
    scope: turn.updated_problem_definition.scope.trim(),
    current_alternatives: turn.updated_problem_definition.current_alternatives.trim(),
    assumptions: dedupe(turn.updated_problem_definition.assumptions),
    ambiguities_remaining: dedupe(turn.updated_problem_definition.ambiguities_remaining),
  }, latestAnswer);

  const updatedBrief: StructuredBrief = {
    ...brief,
    problem_owner: updatedProblemDefinition.problem_owner,
    problem_statement: updatedProblemDefinition.problem_statement,
    evidence_of_problem: updatedProblemDefinition.evidence_of_problem,
    scope: updatedProblemDefinition.scope,
    current_alternatives: updatedProblemDefinition.current_alternatives,
    assumptions: [...updatedProblemDefinition.assumptions],
    ambiguities: [...updatedProblemDefinition.ambiguities_remaining],
    missing_information: computeMissingInformation(updatedProblemDefinition),
  };

  return {
    updatedBrief,
    updatedProblemDefinition,
    detectedGaps: dedupe([...updatedBrief.ambiguities, ...updatedBrief.missing_information]),
  };
}

export function enforceTurnGuardrails(
  brief: StructuredBrief,
  turn: ProblemDefinitionTurn,
  latestAnswer?: string,
): {
  turn: ProblemDefinitionTurn;
  warnings: string[];
  updatedBrief: StructuredBrief;
  updatedProblemDefinition: ProblemDefinitionState;
  detectedGaps: string[];
  latestAnswerWasVague: boolean;
} {
  const warnings: string[] = [];
  const nextQuestion = enforceSingleQuestion(turn.next_question);

  const normalizedTurn: ProblemDefinitionTurn = {
    ...turn,
    diagnosis: turn.diagnosis.slice(0, 3),
    next_question: nextQuestion,
  };

  const {
    updatedBrief,
    updatedProblemDefinition,
    detectedGaps,
  } = applyTurnToBrief(brief, normalizedTurn, latestAnswer);

  const latestAnswerIsVague = latestAnswer ? isVagueAnswer(latestAnswer) : false;
  const nextQuestionContainsForbiddenTopic = FORBIDDEN_TOPIC_PATTERNS.some((pattern) =>
    pattern.test(nextQuestion),
  );

  if (latestAnswerIsVague && normalizedTurn.agent_status === 'done') {
    warnings.push('Latest answer was vague; forcing continue status');
    normalizedTurn.agent_status = 'continue';
    normalizedTurn.completion_reason = '';
  }

  if (nextQuestionContainsForbiddenTopic) {
    warnings.push('Model drifted into a forbidden topic; question was replaced with a fallback');
    normalizedTurn.next_question = buildFallbackQuestion(updatedProblemDefinition);
  }

  const isComplete = evaluateCompletion(updatedProblemDefinition);

  if (normalizedTurn.agent_status === 'done' && !isComplete) {
    warnings.push('Model marked the lane as done before completion criteria were met');
    normalizedTurn.agent_status = 'continue';
    normalizedTurn.completion_reason = '';
    normalizedTurn.next_question = buildFallbackQuestion(updatedProblemDefinition);
  }

  if (normalizedTurn.agent_status !== 'done' && !normalizedTurn.next_question) {
    warnings.push('Model did not produce a usable next question; fallback question generated');
    normalizedTurn.next_question = buildFallbackQuestion(updatedProblemDefinition);
  }

  if (normalizedTurn.agent_status === 'done') {
    normalizedTurn.next_question = '';
    normalizedTurn.completion_reason = normalizedTurn.completion_reason || 'problem sufficiently defined';
  }

  if (latestAnswerIsVague) {
    warnings.push('Latest answer was vague; clarification was narrowed');
    normalizedTurn.agent_status = 'continue';
    normalizedTurn.completion_reason = '';
    normalizedTurn.next_question = buildFallbackQuestion(updatedProblemDefinition);
  }

  return {
    turn: normalizedTurn,
    warnings,
    updatedBrief: {
      ...updatedBrief,
      ambiguities: [...updatedProblemDefinition.ambiguities_remaining],
      missing_information: computeMissingInformation(updatedProblemDefinition),
    },
    updatedProblemDefinition,
    detectedGaps: dedupe([...updatedBrief.ambiguities, ...updatedBrief.missing_information]),
    latestAnswerWasVague: latestAnswerIsVague,
  };
}
