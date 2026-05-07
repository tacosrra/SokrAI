import { describe, expect, it } from 'vitest';

import type {
  ProblemDefinitionTurn,
  StructuredBrief,
} from '../../apps/api/src/contracts/types.ts';
import {
  buildFallbackQuestion,
  enforceTurnGuardrails,
  evaluateCompletion,
  isVagueAnswer,
} from '../../apps/api/src/domain/problem-definition.ts';

const baseBrief: StructuredBrief = {
  project_title: 'Proyecto',
  goal: 'Objetivo',
  target_user: 'Urgencias',
  problem_owner: '',
  problem_statement: 'El triaje inicial se retrasa',
  evidence_of_problem: '',
  current_alternatives: '',
  scope: '',
  constraints_known: [],
  assumptions: [],
  ambiguities: ['No esta claro quien responde hoy por el problema'],
  missing_information: ['problem_owner', 'evidence_of_problem', 'scope', 'current_alternatives', 'assumptions'],
};

describe('problem definition domain rules', () => {
  it('marks low-information answers as vague', () => {
    expect(isVagueAnswer('no lo se')).toBe(true);
    expect(isVagueAnswer('depende')).toBe(true);
    expect(
      isVagueAnswer('Lo vive enfermeria de admision cuando entran muchos pacientes adultos'),
    ).toBe(false);
  });

  it('requires all key fields before completion', () => {
    expect(
      evaluateCompletion({
        problem_owner: 'Enfermeria de admision',
        problem_statement: 'El triaje inicial se retrasa en horas punta',
        evidence_of_problem: 'Se registran esperas medias de 27 minutos',
        scope: 'Urgencias de adultos en la clasificacion inicial',
        current_alternatives: 'Protocolo manual y hojas de cribado',
        assumptions: ['El cuello de botella esta en admision'],
        ambiguities_remaining: [],
      }),
    ).toBe(true);

    expect(
      evaluateCompletion({
        problem_owner: '',
        problem_statement: 'El triaje inicial se retrasa en horas punta',
        evidence_of_problem: 'Se registran esperas medias de 27 minutos',
        scope: 'Urgencias de adultos en la clasificacion inicial',
        current_alternatives: 'Protocolo manual y hojas de cribado',
        assumptions: ['El cuello de botella esta en admision'],
        ambiguities_remaining: [],
      }),
    ).toBe(false);
  });

  it('forces continue with a fallback question when the answer is vague', () => {
    const turn: ProblemDefinitionTurn = {
      agent_status: 'done',
      diagnosis: ['La respuesta no anade informacion accionable'],
      updated_problem_definition: {
        problem_owner: '',
        problem_statement: 'El triaje inicial se retrasa',
        evidence_of_problem: '',
        scope: '',
        current_alternatives: '',
        assumptions: [],
        ambiguities_remaining: ['No esta claro quien responde hoy por el problema'],
      },
      next_question: '',
      completion_reason: 'problem sufficiently defined',
    };

    const guarded = enforceTurnGuardrails(baseBrief, turn, 'no lo se');

    expect(guarded.turn.agent_status).toBe('continue');
    expect(guarded.turn.next_question).toBe(buildFallbackQuestion(guarded.updatedProblemDefinition));
    expect(guarded.warnings.length).toBeGreaterThan(0);
  });

  it('replaces a question containing "legal" for the default specialty', () => {
    const turn: ProblemDefinitionTurn = {
      agent_status: 'continue',
      diagnosis: ['Falta el responsable'],
      updated_problem_definition: {
        problem_owner: '',
        problem_statement: 'El triaje inicial se retrasa',
        evidence_of_problem: '',
        scope: '',
        current_alternatives: '',
        assumptions: [],
        ambiguities_remaining: ['No esta claro quien responde hoy'],
      },
      next_question: '¿Qué marco legal aplica a este proyecto?',
      completion_reason: '',
    };

    const guarded = enforceTurnGuardrails(baseBrief, turn, undefined, 'default');

    expect(guarded.warnings).toContain(
      'Model drifted into a forbidden topic; question was replaced with a fallback',
    );
    expect(guarded.turn.next_question).not.toContain('legal');
  });

  it('does NOT replace a question containing "legal" for the legal specialty', () => {
    const turn: ProblemDefinitionTurn = {
      agent_status: 'continue',
      diagnosis: ['Falta el marco regulatorio'],
      updated_problem_definition: {
        problem_owner: '',
        problem_statement: 'El triaje inicial se retrasa',
        evidence_of_problem: '',
        scope: '',
        current_alternatives: '',
        assumptions: [],
        ambiguities_remaining: ['No esta claro el marco legal aplicable'],
      },
      next_question: '¿Qué marco legal o regulatorio aplica a este proyecto?',
      completion_reason: '',
    };

    const guarded = enforceTurnGuardrails(baseBrief, turn, undefined, 'legal');

    expect(guarded.warnings).not.toContain(
      'Model drifted into a forbidden topic; question was replaced with a fallback',
    );
    expect(guarded.turn.next_question).toContain('legal');
  });

  it('still replaces a cost question for the legal specialty', () => {
    const turn: ProblemDefinitionTurn = {
      agent_status: 'continue',
      diagnosis: ['Falta el responsable'],
      updated_problem_definition: {
        problem_owner: '',
        problem_statement: 'El triaje inicial se retrasa',
        evidence_of_problem: '',
        scope: '',
        current_alternatives: '',
        assumptions: [],
        ambiguities_remaining: ['No esta claro quien responde hoy'],
      },
      next_question: '¿Cuál es el cost estimado del proyecto?',
      completion_reason: '',
    };

    const guarded = enforceTurnGuardrails(baseBrief, turn, undefined, 'legal');

    expect(guarded.warnings).toContain(
      'Model drifted into a forbidden topic; question was replaced with a fallback',
    );
    expect(guarded.turn.next_question).not.toContain('cost');
  });
});
