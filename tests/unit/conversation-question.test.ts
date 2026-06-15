import { describe, expect, it } from 'vitest';

import {
  collectRecentQuestionTexts,
  ensureDistinctNextQuestion,
  normalizeQuestionForComparison,
  selectNonRepeatedQuestion,
  wasQuestionAskedBefore,
} from '../../apps/api/src/domain/conversation-question';

describe('conversation-question', () => {
  it('normalizes punctuation and accents for comparison', () => {
    expect(
      normalizeQuestionForComparison('¿Qué equipo responde hoy por este problema?'),
    ).toBe('que equipo responde hoy por este problema');
  });

  it('detects verbatim repeats across recent turns', () => {
    const previous = '¿Qué equipo responde hoy por este problema?';

    expect(wasQuestionAskedBefore(previous, [previous])).toBe(true);
    expect(wasQuestionAskedBefore('Que equipo responde hoy por este problema?', [previous])).toBe(
      true,
    );
  });

  it('collects resolved and current question texts', () => {
    expect(
      collectRecentQuestionTexts({
        resolvedTurns: [{ question_text: 'First question?' }],
        currentQuestionText: 'Second question?',
      }),
    ).toEqual(['First question?', 'Second question?']);
  });

  it('selects an alternate candidate when the primary was already asked', () => {
    const primary =
      '¿Qué persona o equipo vive hoy este problema y responde por sus consecuencias?';
    const alternate =
      '¿Quién sufre directamente este problema en el día a día y quién responde por él?';

    const selected = selectNonRepeatedQuestion([primary, alternate], [primary]);

    expect(selected).toBe(alternate);
    expect(selected).not.toBe(primary);
  });

  it('rephrases model output that repeats a previous turn', () => {
    const repeated = '¿Qué equipo responde hoy por este problema?';
    const result = ensureDistinctNextQuestion({
      nextQuestion: repeated,
      recentQuestions: [repeated],
      fallbackCandidates: [
        '¿Qué persona o equipo vive hoy este problema y responde por sus consecuencias?',
        '¿Quién sufre directamente este problema en el día a día y quién responde por él?',
      ],
    });

    expect(result.wasRephrased).toBe(true);
    expect(result.question).not.toBe(repeated);
  });
});
