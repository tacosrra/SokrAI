export function normalizeQuestionForComparison(question: string): string {
  return question
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[¿?¡!.,;:'"()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const QUESTION_STOPWORDS = new Set([
  'acerca',
  'actual',
  'ahora',
  'algo',
  'algun',
  'alguna',
  'algunas',
  'algunos',
  'ante',
  'antes',
  'asi',
  'cada',
  'como',
  'con',
  'concreto',
  'concretar',
  'cual',
  'cuales',
  'cuando',
  'debe',
  'deben',
  'deberia',
  'deberian',
  'del',
  'desde',
  'despues',
  'detalle',
  'dia',
  'donde',
  'durante',
  'ese',
  'eso',
  'esta',
  'este',
  'estos',
  'estas',
  'hay',
  'hoy',
  'las',
  'los',
  'mas',
  'mismo',
  'para',
  'parte',
  'pero',
  'podria',
  'podrias',
  'por',
  'porque',
  'punto',
  'puede',
  'puedes',
  'que',
  'quedaria',
  'quedarian',
  'quien',
  'seria',
  'serian',
  'sigue',
  'sin',
  'sobre',
  'son',
  'sus',
  'tambien',
  'todavia',
  'una',
  'unas',
  'uno',
  'unos',
]);

function contentTokenSet(question: string): Set<string> {
  return new Set(
    normalizeQuestionForComparison(question)
      .split(' ')
      .filter((token) => token.length > 2 && !QUESTION_STOPWORDS.has(token)),
  );
}

export function isQuestionSemanticallyRepeated(question: string, previousQuestion: string): boolean {
  const normalized = normalizeQuestionForComparison(question);
  const normalizedPrevious = normalizeQuestionForComparison(previousQuestion);

  if (!normalized || !normalizedPrevious) {
    return false;
  }

  if (normalized === normalizedPrevious) {
    return true;
  }

  const currentTokens = contentTokenSet(question);
  const previousTokens = contentTokenSet(previousQuestion);
  const minimumTokenCount = Math.min(currentTokens.size, previousTokens.size);

  if (minimumTokenCount < 4) {
    return false;
  }

  const intersectionCount = Array.from(currentTokens).filter((token) => previousTokens.has(token)).length;
  const unionCount = new Set([...currentTokens, ...previousTokens]).size;
  const containment = intersectionCount / minimumTokenCount;
  const jaccard = intersectionCount / unionCount;

  return intersectionCount >= 4 && (containment >= 0.72 || jaccard >= 0.52);
}

export function wasQuestionAskedBefore(question: string, recentQuestions: string[]): boolean {
  const normalized = normalizeQuestionForComparison(question);

  if (!normalized) {
    return false;
  }

  return recentQuestions.some((previous) => isQuestionSemanticallyRepeated(question, previous));
}

export function collectRecentQuestionTexts(params: {
  resolvedTurns: Array<{ question_text: string }>;
  currentQuestionText?: string | null;
}): string[] {
  const questions = params.resolvedTurns
    .map((turn) => turn.question_text.trim())
    .filter((text) => text.length > 0);

  const current = params.currentQuestionText?.trim();

  if (current) {
    questions.push(current);
  }

  return questions;
}

function buildRephraseFallbacks(baseQuestion: string): string[] {
  const trimmed = baseQuestion.trim();
  const withoutQuestionMark = trimmed.replace(/[?¿]\s*$/, '').trim();
  const lowerLead = withoutQuestionMark.charAt(0).toLocaleLowerCase() + withoutQuestionMark.slice(1);

  return [
    `Volviendo a ese punto con otras palabras: ${lowerLead}?`,
    `Necesito un poco mas de detalle: ${lowerLead}?`,
    `Si puedes, responde con un ejemplo concreto: ${lowerLead}?`,
    `Para afinar lo anterior, ${lowerLead}?`,
  ];
}

export function selectNonRepeatedQuestion(
  candidates: string[],
  recentQuestions: string[],
): string {
  const usableCandidates = candidates.map((candidate) => candidate.trim()).filter(Boolean);

  if (usableCandidates.length === 0) {
    return '¿Puedes concretar un detalle que todavia falte?';
  }

  for (const candidate of usableCandidates) {
    if (!wasQuestionAskedBefore(candidate, recentQuestions)) {
      return candidate;
    }
  }

  for (const candidate of usableCandidates) {
    for (const rephrased of buildRephraseFallbacks(candidate)) {
      if (!wasQuestionAskedBefore(rephrased, recentQuestions)) {
        return rephrased;
      }
    }
  }

  const lastAnswered = recentQuestions[recentQuestions.length - 1]?.trim();

  if (lastAnswered) {
    return '¿Puedes ampliar tu respuesta anterior con un ejemplo concreto del dia a dia?';
  }

  return usableCandidates[0] ?? '¿Puedes concretar un detalle que todavia falte?';
}

export function ensureDistinctNextQuestion(params: {
  nextQuestion: string;
  recentQuestions: string[];
  fallbackCandidates: string[];
}): { question: string; wasRephrased: boolean } {
  if (!wasQuestionAskedBefore(params.nextQuestion, params.recentQuestions)) {
    return { question: params.nextQuestion, wasRephrased: false };
  }

  return {
    question: selectNonRepeatedQuestion(
      [params.nextQuestion, ...params.fallbackCandidates],
      params.recentQuestions,
    ),
    wasRephrased: true,
  };
}
