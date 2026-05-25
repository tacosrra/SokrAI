import { describe, expect, it } from 'vitest';

import type {
  AlphaGap,
  ProposalSource,
  SolutionDefinitionTurn,
} from '../../apps/api/src/contracts/types.ts';
import {
  buildSolutionSectionSourceRefs,
  classifySolutionGapStatuses,
  computeSolutionMissingInformation,
  emptySolutionDefinition,
  enforceSolutionTurnGuardrails,
  evaluateSolutionCompletion,
  renderSolutionSection,
  selectSolutionGapRefs,
} from '../../apps/api/src/domain/solution-definition.ts';

const baseGap: AlphaGap = {
  gap_id: 'gap-summary',
  proposal_id: 'proposal-1',
  module: 'solution',
  gap_kind: 'missing_information',
  gap_status: 'open',
  origin: 'system_rule',
  field: 'solution_summary',
  description: 'Solution summary is missing.',
  absence: {
    is_absent: true,
    checked_fields: ['solution_summary'],
    reason: 'Required solution information was not found.',
  },
  source_refs: [],
  audit_refs: [],
  warnings: [],
  created_at: '2026-05-24T14:00:00.000Z',
  updated_at: '2026-05-24T14:00:00.000Z',
};

const doneState = {
  solution_summary: 'A guided intake assistant prepares structured triage handoff notes.',
  target_user: 'Admission nursing staff',
  how_it_works: 'The assistant asks bounded questions and creates a structured intake summary.',
  workflow_change: 'Nurses review a structured summary before continuing the normal triage protocol.',
  current_solutions: 'Current work relies on manual notes and static protocol sheets.',
  value_differential: 'The solution makes intake notes more consistent without replacing judgement.',
  scope_limits: 'The first version covers adult emergency intake and excludes diagnosis.',
  assumptions: ['Nursing staff can answer guided questions during intake.'],
  ambiguities_remaining: [],
};

describe('solution definition domain rules', () => {
  it('requires all solution fields before completion', () => {
    expect(evaluateSolutionCompletion(doneState)).toBe(true);
    expect(evaluateSolutionCompletion({ ...doneState, how_it_works: '' })).toBe(false);
    expect(computeSolutionMissingInformation(emptySolutionDefinition())).toContain('solution_summary');
  });

  it('forces vague answers back to continue with a bounded question', () => {
    const turn: SolutionDefinitionTurn = {
      agent_status: 'done',
      diagnosis: ['The answer is too vague.'],
      updated_solution_definition: {
        ...emptySolutionDefinition(),
        solution_summary: 'A guided intake assistant prepares structured triage handoff notes.',
      },
      next_question: '',
      completion_reason: 'solution sufficiently defined',
    };

    const guarded = enforceSolutionTurnGuardrails(turn, 'no lo se');

    expect(guarded.turn.agent_status).toBe('continue');
    expect(guarded.turn.next_question).toContain('?');
    expect(guarded.warnings.length).toBeGreaterThan(0);
  });

  it('replaces forbidden-topic drift with a fallback question', () => {
    const turn: SolutionDefinitionTurn = {
      agent_status: 'continue',
      diagnosis: ['The model drifted.'],
      updated_solution_definition: emptySolutionDefinition(),
      next_question: 'What budget and regulatory approval path will you use?',
      completion_reason: '',
    };

    const guarded = enforceSolutionTurnGuardrails(turn);

    expect(guarded.turn.next_question).not.toMatch(/budget|regulatory/i);
    expect(guarded.warnings).toContain('Model drifted into a forbidden solution topic; question was replaced with a fallback');
  });

  it('selects solution-only gap refs and caps them at three', () => {
    const gaps: AlphaGap[] = [
      baseGap,
      { ...baseGap, gap_id: 'gap-user', field: 'target_user' },
      { ...baseGap, gap_id: 'gap-work', field: 'how_it_works' },
      { ...baseGap, gap_id: 'gap-flow', field: 'workflow_change' },
      { ...baseGap, gap_id: 'gap-problem', module: 'problem', field: 'problem_owner' },
    ];

    expect(selectSolutionGapRefs(gaps, emptySolutionDefinition())).toEqual([
      'gap-summary',
      'gap-user',
      'gap-work',
    ]);
  });

  it('classifies completed solution gaps as resolved', () => {
    const changes = classifySolutionGapStatuses([baseGap], doneState, 'turn-1');

    expect(changes).toEqual([
      {
        gapId: 'gap-summary',
        gapStatus: 'resolved',
        resolvedByTurnId: 'turn-1',
      },
    ]);
  });

  it('renders only persisted solution fields and internal source refs', () => {
    const source: ProposalSource = {
      source_id: 'source-1',
      source_kind: 'user_answer',
      label: 'Solution answer turn 1',
      turn_id: 'turn-1',
      created_at: '2026-05-24T14:00:00.000Z',
    };
    const refs = buildSolutionSectionSourceRefs([], [source]);
    const rendered = renderSolutionSection(doneState, {
      sourceCount: refs.length,
      gapCount: 1,
    });

    expect(refs).toEqual([source]);
    expect(rendered.contentMarkdown).toContain(doneState.solution_summary);
    expect(rendered.contentMarkdown).not.toMatch(/pricing|budget|regulatory|medical device|RAG|ranking/i);
  });
});
