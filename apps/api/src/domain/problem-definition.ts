import type {
  ProblemDefinitionState,
  ProblemDefinitionTurn,
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

// Patterns that are topic-appropriate for the legal specialty and must NOT be
// treated as forbidden when specialty === 'legal'.
const LEGAL_DOMAIN_PATTERNS: ReadonlySet<RegExp> = new Set([
  FORBIDDEN_TOPIC_PATTERNS[0], // /\blegal\b/i
  FORBIDDEN_TOPIC_PATTERNS[1], // /\bregulator/i
]);

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

function hasEnoughText(value: string, minLength: number): boolean {
  return value.trim().length >= minLength;
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
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
  return (
    hasEnoughText(problemDefinition.problem_owner, 3) &&
    hasEnoughText(problemDefinition.problem_statement, 12) &&
    hasEnoughText(problemDefinition.evidence_of_problem, 12) &&
    hasEnoughText(problemDefinition.scope, 8) &&
    hasEnoughText(problemDefinition.current_alternatives, 8) &&
    problemDefinition.assumptions.length >= 1 &&
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
): {
  updatedBrief: StructuredBrief;
  updatedProblemDefinition: ProblemDefinitionState;
  detectedGaps: string[];
} {
  const updatedProblemDefinition: ProblemDefinitionState = {
    problem_owner: turn.updated_problem_definition.problem_owner.trim(),
    problem_statement: turn.updated_problem_definition.problem_statement.trim(),
    evidence_of_problem: turn.updated_problem_definition.evidence_of_problem.trim(),
    scope: turn.updated_problem_definition.scope.trim(),
    current_alternatives: turn.updated_problem_definition.current_alternatives.trim(),
    assumptions: dedupe(turn.updated_problem_definition.assumptions),
    ambiguities_remaining: dedupe(turn.updated_problem_definition.ambiguities_remaining),
  };

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
  specialty?: 'default' | 'legal' | null,
): {
  turn: ProblemDefinitionTurn;
  warnings: string[];
  updatedBrief: StructuredBrief;
  updatedProblemDefinition: ProblemDefinitionState;
  detectedGaps: string[];
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
  } = applyTurnToBrief(brief, normalizedTurn);

  const latestAnswerIsVague = latestAnswer ? isVagueAnswer(latestAnswer) : false;
  const effectiveForbiddenPatterns =
    specialty === 'legal'
      ? FORBIDDEN_TOPIC_PATTERNS.filter((p) => !LEGAL_DOMAIN_PATTERNS.has(p))
      : FORBIDDEN_TOPIC_PATTERNS;
  const nextQuestionContainsForbiddenTopic = effectiveForbiddenPatterns.some((pattern) =>
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
  };
}
