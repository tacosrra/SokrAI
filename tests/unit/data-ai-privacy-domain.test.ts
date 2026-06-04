import { describe, expect, it } from 'vitest';

import type { AlphaGap, DataAiPrivacyTurn, ProposalSource } from '../../apps/api/src/contracts/types.ts';
import {
  DATA_AI_PRIVACY_REVIEW_WARNING,
  buildDataAiPrivacyFallbackQuestion,
  buildDataAiPrivacySectionSourceRefs,
  classifyDataAiPrivacyGapStatuses,
  computeDataAiPrivacyMissingInformation,
  containsForbiddenDataAiPrivacyOutput,
  emptyDataAiPrivacyState,
  enforceDataAiPrivacyTurnGuardrails,
  renderDataAiPrivacySection,
  selectDataAiPrivacyGapRefs,
} from '../../apps/api/src/domain/data-ai-privacy.ts';

const completeState = {
  personal_or_health_data: 'The pilot uses administrative intake data and patient symptom descriptions.',
  data_sources: 'Data comes from patient intake forms and staff triage notes.',
  ai_system_role: 'The AI drafts a structured summary for staff review.',
  validation_evidence: 'The team will compare draft summaries against staff-written summaries.',
  privacy_governance: 'Data protection and clinical governance teams review data use.',
  cybersecurity_controls: 'Access is limited to pilot staff with traceable sessions.',
  regulatory_context: 'Sensitive framework relevance remains contextual and review-bound.',
  human_review_plan: 'Data protection, clinical governance and regulatory owners review before use.',
  assumptions: ['Staff review every AI-generated handoff before action.'],
  uncertainties: ['Exact governance sign-off path remains to be confirmed.'],
  requires_competent_human_review: true,
};

const baseGap: AlphaGap = {
  gap_id: 'gap-data',
  proposal_id: 'proposal-1',
  module: 'data_ai_privacy',
  gap_kind: 'missing_information',
  gap_status: 'open',
  origin: 'system_rule',
  field: 'data_sources',
  description: 'Data sources are unclear.',
  absence: {
    is_absent: true,
    checked_fields: ['data_sources'],
    reason: 'Data source information is missing.',
  },
  source_refs: [],
  audit_refs: [],
  warnings: [DATA_AI_PRIVACY_REVIEW_WARNING],
  created_at: '2026-06-04T10:00:00.000Z',
  updated_at: '2026-06-04T10:00:00.000Z',
};

describe('data AI privacy domain rules', () => {
  it('detects missing fields and builds one fallback question', () => {
    const state = emptyDataAiPrivacyState();

    expect(computeDataAiPrivacyMissingInformation(state)).toContain('personal_or_health_data');
    expect(buildDataAiPrivacyFallbackQuestion(state)).toMatch(/\?$/);
  });

  it('replaces definitive sensitive wording before persistence', () => {
    const turn: DataAiPrivacyTurn = {
      agent_status: 'done',
      diagnosis: ['The proposal is compliant and approved.'],
      updated_data_ai_privacy: {
        ...completeState,
        regulatory_context: 'This is compliant and MDR classified as class II.',
      },
      next_question: '',
      completion_reason: 'done',
    };

    const guarded = enforceDataAiPrivacyTurnGuardrails(turn);
    const serialized = JSON.stringify(guarded.turn);

    expect(guarded.turn.agent_status).toBe('continue');
    expect(guarded.warnings).toContain('Sensitive definitive wording was replaced before persistence');
    expect(serialized).not.toMatch(/dictamen|compliant|non-compliant|cumple|incumple|approved|rejected|medical device class|class I|class II|MDR classified/i);
    expect(serialized).toContain(DATA_AI_PRIVACY_REVIEW_WARNING);
  });

  it('replaces Spanish approval, compliance and classification wording before persistence', () => {
    const turn: DataAiPrivacyTurn = {
      agent_status: 'done',
      diagnosis: [
        'La propuesta queda aprobada y conforme.',
        'Clasificado como producto sanitario clase IIb.',
      ],
      updated_data_ai_privacy: {
        ...completeState,
        regulatory_context: 'Cumplimiento definitivo: no conforme y rechazado por privacidad.',
        human_review_plan: 'El comite indica que no es producto sanitario.',
      },
      next_question: '',
      completion_reason: 'done',
    };

    const guarded = enforceDataAiPrivacyTurnGuardrails(turn);
    const serialized = JSON.stringify(guarded.turn);

    expect(guarded.turn.agent_status).toBe('continue');
    expect(serialized).not.toMatch(
      /aprobada|aprobado|rechazado|rechazada|conforme|no conforme|cumplimiento definitivo|clasificado como producto sanitario|clase IIb|no es producto sanitario/i,
    );
    expect(serialized).toContain(DATA_AI_PRIVACY_REVIEW_WARNING);
  });

  it('forces vague answers back to continue', () => {
    const turn: DataAiPrivacyTurn = {
      agent_status: 'done',
      diagnosis: ['Enough detail.'],
      updated_data_ai_privacy: completeState,
      next_question: '',
      completion_reason: 'data AI privacy gaps sufficiently clarified for human review',
    };

    const guarded = enforceDataAiPrivacyTurnGuardrails(turn, 'no lo se');

    expect(guarded.turn.agent_status).toBe('continue');
    expect(guarded.turn.next_question).toMatch(/\?$/);
    expect(guarded.warnings).toContain('Latest data AI privacy answer was vague; clarification was narrowed');
  });

  it('selects and resolves data AI privacy gaps only', () => {
    const gaps: AlphaGap[] = [
      baseGap,
      { ...baseGap, gap_id: 'gap-ai', field: 'ai_system_role' },
      { ...baseGap, gap_id: 'gap-validation', field: 'validation_evidence' },
      { ...baseGap, gap_id: 'gap-extra', field: 'privacy_governance' },
      { ...baseGap, gap_id: 'gap-solution', module: 'solution', field: 'solution_summary' },
    ];

    expect(selectDataAiPrivacyGapRefs(gaps, emptyDataAiPrivacyState())).toEqual([
      'gap-data',
      'gap-ai',
      'gap-validation',
    ]);
    expect(classifyDataAiPrivacyGapStatuses([baseGap], completeState, 'turn-1')).toEqual([
      {
        gapId: 'gap-data',
        gapStatus: 'resolved',
        resolvedByTurnId: 'turn-1',
      },
    ]);
  });

  it('renders a review-bound section without raw model or decision fields', () => {
    const source: ProposalSource = {
      source_id: 'source-1',
      source_kind: 'user_answer',
      label: 'Data AI privacy answer turn 1',
      turn_id: 'turn-1',
      created_at: '2026-06-04T10:00:00.000Z',
    };
    const refs = buildDataAiPrivacySectionSourceRefs([], [source]);
    const rendered = renderDataAiPrivacySection(completeState, {
      sourceCount: refs.length,
      gapCount: 1,
    });

    expect(refs).toEqual([source]);
    expect(rendered.warnings).toContain(DATA_AI_PRIVACY_REVIEW_WARNING);
    expect(rendered.contentMarkdown).toContain(DATA_AI_PRIVACY_REVIEW_WARNING);
    expect(rendered.contentMarkdown).not.toMatch(/raw_model_output|validated_output_json|dictamen|compliant|approved|rejected|class II/i);
    expect(containsForbiddenDataAiPrivacyOutput(rendered)).toBe(false);
  });
});
