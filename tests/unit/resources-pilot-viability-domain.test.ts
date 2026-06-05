import { describe, expect, it } from 'vitest';

import type { AlphaGap, ProposalSource, ResourcesPilotViabilityTurn } from '../../apps/api/src/contracts/types.ts';
import {
  RESOURCES_PILOT_VIABILITY_WARNING,
  buildResourcesPilotViabilityFallbackQuestion,
  buildResourcesPilotViabilitySectionSourceRefs,
  classifyResourcesPilotViabilityGapStatuses,
  computeResourcesPilotViabilityMissingInformation,
  containsForbiddenResourcesPilotViabilityOutput,
  emptyResourcesPilotViabilityState,
  enforceResourcesPilotViabilityTurnGuardrails,
  renderResourcesPilotViabilitySection,
  selectResourcesPilotViabilityGapRefs,
} from '../../apps/api/src/domain/resources-pilot-viability.ts';

const completeState = {
  human_resources: 'Pilot delivery is owned by one clinical lead, two nurses, and one project coordinator.',
  technical_resources: 'The pilot uses an existing secure web app, hospital SSO, and an audit log dashboard.',
  pilot_environment: 'The pilot runs in the outpatient intake workflow for one clinic site during weekday hours.',
  dependencies: ['Hospital SSO access and clinic manager scheduling must be ready before launch.'],
  indicators_metrics: ['Weekly completed intake summaries and staff correction rate.'],
  constraints: ['Staff availability and site access limit pilot sessions to weekday mornings.'],
  operational_risks: ['Late SSO provisioning could delay onboarding and reduce first-week usage.'],
  assumptions: ['Clinic staff can reserve time for weekly review.'],
  uncertainties: ['Exact pilot start date remains to be confirmed.'],
};

const baseGap: AlphaGap = {
  gap_id: 'gap-human',
  proposal_id: 'proposal-1',
  module: 'resources_pilot_viability',
  gap_kind: 'missing_information',
  gap_status: 'open',
  origin: 'system_rule',
  field: 'human_resources',
  description: 'Human resources are unclear.',
  absence: {
    is_absent: true,
    checked_fields: ['human_resources'],
    reason: 'Human resources are missing.',
  },
  source_refs: [],
  audit_refs: [],
  warnings: [RESOURCES_PILOT_VIABILITY_WARNING],
  created_at: '2026-06-04T10:00:00.000Z',
  updated_at: '2026-06-04T10:00:00.000Z',
};

describe('resources pilot viability domain rules', () => {
  it('detects missing operational fields and builds one fallback question', () => {
    const state = emptyResourcesPilotViabilityState();

    expect(computeResourcesPilotViabilityMissingInformation(state)).toEqual(
      expect.arrayContaining(['human_resources', 'technical_resources', 'operational_risks']),
    );
    expect(buildResourcesPilotViabilityFallbackQuestion(state)).toMatch(/\?$/);
  });

  it('replaces score, approval, ranking and financial model wording before persistence', () => {
    const turn: ResourcesPilotViabilityTurn = {
      agent_status: 'done',
      diagnosis: ['The pilot is approved with a high viability score.'],
      updated_resources_pilot_viability: {
        ...completeState,
        constraints: ['A full financial model proves profitability and ROI.'],
      },
      next_question: '',
      completion_reason: 'done',
    };

    const guarded = enforceResourcesPilotViabilityTurnGuardrails(turn);
    const serialized = JSON.stringify(guarded.turn);

    expect(guarded.turn.agent_status).toBe('continue');
    expect(guarded.warnings).toContain('Decision, score, ranking, or financial model wording was replaced before persistence');
    expect(guarded.intervention).toMatchObject({
      applied: true,
      reasons: ['forbidden_output_replaced'],
      fallbackQuestionApplied: true,
      forcedAgentStatus: 'continue',
      scope: 'resources_pilot_viability_operational_inputs',
    });
    expect(guarded.intervention.normalizedFields).toEqual(
      expect.arrayContaining(['diagnosis', 'updated_resources_pilot_viability.constraints']),
    );
    expect(serialized).not.toMatch(/The pilot is approved|high viability score|full financial model|profitability and ROI/i);
    expect(serialized).toContain(RESOURCES_PILOT_VIABILITY_WARNING);
  });

  it('forces vague answers back to continue', () => {
    const turn: ResourcesPilotViabilityTurn = {
      agent_status: 'done',
      diagnosis: ['Enough detail.'],
      updated_resources_pilot_viability: completeState,
      next_question: '',
      completion_reason: 'resources pilot viability inputs sufficiently clarified',
    };

    const guarded = enforceResourcesPilotViabilityTurnGuardrails(turn, 'no lo se');

    expect(guarded.turn.agent_status).toBe('continue');
    expect(guarded.turn.next_question).toMatch(/\?$/);
    expect(guarded.warnings).toContain('Latest resources pilot viability answer was vague; clarification was narrowed');
  });

  it('allows completion with no open uncertainties and no uncertainty missing-information gap', () => {
    const stateWithoutUncertainties = {
      ...completeState,
      uncertainties: [],
    };
    const turn: ResourcesPilotViabilityTurn = {
      agent_status: 'done',
      diagnosis: ['Operational pilot inputs are clear enough for the section.'],
      updated_resources_pilot_viability: stateWithoutUncertainties,
      next_question: '',
      completion_reason: 'resources pilot viability inputs sufficiently clarified',
    };
    const guarded = enforceResourcesPilotViabilityTurnGuardrails(turn);

    expect(computeResourcesPilotViabilityMissingInformation(stateWithoutUncertainties)).not.toContain('uncertainties');
    expect(guarded.turn.agent_status).toBe('done');
    expect(guarded.detectedGaps).not.toContain('uncertainties');
    expect(selectResourcesPilotViabilityGapRefs([
      {
        ...baseGap,
        gap_id: 'gap-uncertainties',
        gap_kind: 'needs_user_confirmation',
        field: 'uncertainties',
      },
    ], stateWithoutUncertainties)).toEqual([]);
  });

  it('selects at most three PR11 gaps and resolves only PR11 fields', () => {
    const gaps: AlphaGap[] = [
      baseGap,
      { ...baseGap, gap_id: 'gap-tech', field: 'technical_resources' },
      { ...baseGap, gap_id: 'gap-env', field: 'pilot_environment' },
      { ...baseGap, gap_id: 'gap-deps', field: 'dependencies' },
      { ...baseGap, gap_id: 'gap-solution', module: 'solution', field: 'solution_summary' },
    ];

    expect(selectResourcesPilotViabilityGapRefs(gaps, emptyResourcesPilotViabilityState())).toEqual([
      'gap-human',
      'gap-tech',
      'gap-env',
    ]);
    expect(classifyResourcesPilotViabilityGapStatuses([baseGap], completeState, 'turn-1')).toEqual([
      {
        gapId: 'gap-human',
        gapStatus: 'resolved',
        resolvedByTurnId: 'turn-1',
      },
    ]);
  });

  it('renders an operational section without raw model or decision fields', () => {
    const source: ProposalSource = {
      source_id: 'source-1',
      source_kind: 'user_answer',
      label: 'Resources pilot viability answer turn 1',
      turn_id: 'turn-1',
      created_at: '2026-06-04T10:00:00.000Z',
    };
    const refs = buildResourcesPilotViabilitySectionSourceRefs([], [source]);
    const rendered = renderResourcesPilotViabilitySection(completeState, {
      sourceCount: refs.length,
      gapCount: 1,
    });

    expect(refs).toEqual([source]);
    expect(rendered.title).toBe('Resources, pilot and viability readiness inputs');
    expect(rendered.warnings).toContain(RESOURCES_PILOT_VIABILITY_WARNING);
    expect(rendered.contentMarkdown).toContain(RESOURCES_PILOT_VIABILITY_WARNING);
    expect(rendered.contentMarkdown).not.toMatch(/raw_model_output|validated_output_json/);
    expect(containsForbiddenResourcesPilotViabilityOutput(rendered)).toBe(false);
  });
});
