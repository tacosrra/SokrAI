export function normalizeQuestionForComparison(question: string): string {
  return question
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[¿?¡!.,;:'"()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function wasQuestionAskedBefore(question: string, recentQuestions: string[]): boolean {
  const normalized = normalizeQuestionForComparison(question);

  if (!normalized) {
    return false;
  }

  return recentQuestions.some(
    (previous) => normalizeQuestionForComparison(previous) === normalized,
  );
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
