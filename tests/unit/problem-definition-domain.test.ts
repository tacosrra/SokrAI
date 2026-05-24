import { describe, expect, it } from 'vitest';

import type {
  AlphaGap,
  ProblemDefinitionTurn,
  ProposalSource,
  StructuredBrief,
} from '../../apps/api/src/contracts/types.ts';
import {
  buildProblemSectionSourceRefs,
  buildFallbackQuestion,
  classifyProblemGapStatuses,
  enforceTurnGuardrails,
  evaluateCompletion,
  isVagueAnswer,
  renderProblemSection,
  selectProblemGapRefs,
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

const baseGap: AlphaGap = {
  gap_id: 'gap-owner',
  proposal_id: 'proposal-1',
  module: 'problem',
  gap_kind: 'missing_information',
  gap_status: 'open',
  origin: 'structured_brief_field',
  field: 'problem_owner',
  description: 'The problem owner is missing from the structured brief.',
  absence: {
    is_absent: true,
    checked_fields: ['problem_owner'],
    reason: 'Required information was not found in the available structured brief.',
  },
  source_refs: [],
  audit_refs: [],
  warnings: [],
  created_at: '2026-05-24T14:00:00.000Z',
  updated_at: '2026-05-24T14:00:00.000Z',
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

  it('selects unresolved problem gap refs by field priority', () => {
    const gaps: AlphaGap[] = [
      {
        ...baseGap,
        gap_id: 'gap-evidence',
        field: 'evidence_of_problem',
        description: 'Evidence is missing.',
      },
      baseGap,
      {
        ...baseGap,
        gap_id: 'gap-solution',
        module: 'solution',
        field: 'target_user',
      },
    ];

    expect(selectProblemGapRefs(gaps, {
      problem_owner: '',
      problem_statement: 'El triaje inicial se retrasa en horas punta',
      evidence_of_problem: '',
      scope: 'Urgencias de adultos',
      current_alternatives: 'Protocolo manual',
      assumptions: ['El cuello de botella esta en admision'],
      ambiguities_remaining: [],
    })).toEqual(['gap-owner', 'gap-evidence']);
  });

  it('classifies answered problem gaps as resolved when their fields are complete', () => {
    const changes = classifyProblemGapStatuses(
      [baseGap],
      {
        problem_owner: 'Direccion de Urgencias',
        problem_statement: 'El triaje inicial se retrasa en horas punta',
        evidence_of_problem: 'Se registran esperas medias de 27 minutos',
        scope: 'Urgencias de adultos',
        current_alternatives: 'Protocolo manual',
        assumptions: ['El cuello de botella esta en admision'],
        ambiguities_remaining: [],
      },
      'turn-1',
    );

    expect(changes).toEqual([
      {
        gapId: 'gap-owner',
        gapStatus: 'resolved',
        resolvedByTurnId: 'turn-1',
      },
    ]);
  });

  it('renders the problem section only from persisted problem fields and source refs', () => {
    const source: ProposalSource = {
      source_id: 'source-answer-1',
      source_kind: 'user_answer',
      label: 'Problem answer turn 1',
      turn_id: 'turn-1',
      created_at: '2026-05-24T14:10:00.000Z',
    };
    const sourceRefs = buildProblemSectionSourceRefs([], [source]);
    const section = renderProblemSection(
      {
        problem_owner: 'Direccion de Urgencias',
        problem_statement: 'El triaje inicial se retrasa en horas punta',
        evidence_of_problem: 'Se registran esperas medias de 27 minutos',
        scope: 'Urgencias de adultos',
        current_alternatives: 'Protocolo manual',
        assumptions: ['El cuello de botella esta en admision'],
        ambiguities_remaining: [],
      },
      {
        sourceCount: sourceRefs.length,
        gapCount: 1,
      },
    );

    expect(sourceRefs).toEqual([source]);
    expect(section.contentMarkdown).toContain('El triaje inicial se retrasa en horas punta');
    expect(section.contentMarkdown).not.toContain('solucion');
    expect(section.warnings).toEqual([]);
  });
});
