import { describe, expect, it } from 'vitest';

import type { AlphaGap, MedicalDeviceTriageTurn, ProposalSource, StructuredBrief } from '../../apps/api/src/contracts/types.ts';
import {
  MEDICAL_DEVICE_TRIAGE_REVIEW_WARNING,
  buildMedicalDeviceFallbackQuestion,
  buildMedicalDeviceSectionSourceRefs,
  classifyMedicalDeviceGapStatuses,
  computeMedicalDeviceMissingInformation,
  containsForbiddenMedicalDeviceOutput,
  emptyMedicalDeviceTriageState,
  enforceMedicalDeviceTriageTurnGuardrails,
  evaluateMedicalDeviceActivation,
  evaluateMedicalDeviceCompletion,
  renderMedicalDeviceTriageSection,
  selectMedicalDeviceGapRefs,
} from '../../apps/api/src/domain/medical-device-triage.ts';

const baseBrief: StructuredBrief = {
  project_title: 'Administrative intake assistant',
  goal: 'Reduce paperwork delays',
  target_user: 'Admission staff',
  problem_owner: 'Operations',
  problem_statement: 'Manual intake creates repeated administrative delays.',
  evidence_of_problem: 'Staff report duplicated fields and long queues.',
  current_alternatives: 'Manual forms and phone calls.',
  scope: 'Administrative intake only.',
  constraints_known: [],
  assumptions: [],
  ambiguities: [],
  missing_information: [],
};

const completeState = {
  triage_status: 'applicable' as const,
  activation_signals: ['clinical decision support'],
  uncertainties: ['Intended-use boundary requires competent human review.'],
  intended_use_claims: ['The software drafts triage prioritization suggestions.'],
  clinical_decision_role: 'The software may influence triage prioritization before staff review.',
  evidence_needed: ['Clarify intended use and validation evidence.'],
  human_review_plan: 'Clinical governance and regulatory owners review before pilot use.',
  needs_human_review: true,
  requires_competent_human_review: true,
};

const baseGap: AlphaGap = {
  gap_id: 'gap-intended-use',
  proposal_id: 'proposal-1',
  module: 'medical_device_triage',
  gap_kind: 'missing_information',
  gap_status: 'open',
  origin: 'system_rule',
  field: 'intended_use_claims',
  description: 'Intended-use claims need clarification.',
  absence: {
    is_absent: true,
    checked_fields: ['intended_use_claims'],
    reason: 'Intended use is missing.',
  },
  source_refs: [],
  audit_refs: [],
  warnings: [MEDICAL_DEVICE_TRIAGE_REVIEW_WARNING],
  created_at: '2026-06-04T10:00:00.000Z',
  updated_at: '2026-06-04T10:00:00.000Z',
};

describe('medical-device triage domain rules', () => {
  it('activates for explicit medical-device signals', () => {
    const activation = evaluateMedicalDeviceActivation({
      structuredBrief: {
        ...baseBrief,
        goal: 'Use clinical decision support for risk stratification in triage.',
      },
    });

    expect(activation.triageStatus).toBe('applicable');
    expect(activation.activationSignals).toEqual(expect.arrayContaining(['clinical decision support']));
    expect(activation.needsHumanReview).toBe(true);
    expect(activation.requiresCompetentHumanReview).toBe(true);
  });

  it('records no-signal cases without definitive product wording', () => {
    const activation = evaluateMedicalDeviceActivation({ structuredBrief: baseBrief });
    const state = emptyMedicalDeviceTriageState(activation.triageStatus);
    const rendered = renderMedicalDeviceTriageSection(state, {
      sourceCount: 1,
      gapCount: 0,
    });
    const serialized = JSON.stringify(rendered);

    expect(activation.triageStatus).toBe('not_applicable');
    expect(state.needs_human_review).toBe(false);
    expect(serialized).not.toMatch(/not a medical device|is a medical device|classified as a medical device/i);
  });

  it('activates uncertain when clinical context carries unresolved uncertainty', () => {
    const activation = evaluateMedicalDeviceActivation({
      structuredBrief: {
        ...baseBrief,
        problem_statement: 'The clinical workflow is unclear and requires review.',
      },
    });

    expect(activation.triageStatus).toBe('uncertain');
    expect(activation.uncertainties.length).toBeGreaterThan(0);
    expect(buildMedicalDeviceFallbackQuestion(emptyMedicalDeviceTriageState('uncertain'))).toMatch(/\?$/);
  });

  it('replaces definitive class and product-decision wording before persistence', () => {
    const turn: MedicalDeviceTriageTurn = {
      agent_status: 'done',
      diagnosis: [
        'This is a medical device and MDR class IIb.',
        'Clasificado como producto sanitario clase IIb.',
      ],
      updated_medical_device_triage: {
        ...completeState,
        clinical_decision_role: 'This is compliant and approved.',
        human_review_plan: 'No es producto sanitario.',
      },
      next_question: '',
      completion_reason: 'done',
    };

    const guarded = enforceMedicalDeviceTriageTurnGuardrails(turn);
    const serialized = JSON.stringify(guarded.turn);

    expect(guarded.turn.agent_status).toBe('continue');
    expect(guarded.turn.updated_medical_device_triage.triage_status).toBe('uncertain');
    expect(guarded.warnings).toContain('Definitive medical-device wording was replaced before persistence');
    expect(serialized).not.toMatch(
      /is a medical device|MDR class|class IIb|clasificado como producto sanitario|clase IIb|compliant|approved|no es producto sanitario/i,
    );
    expect(serialized).toContain(MEDICAL_DEVICE_TRIAGE_REVIEW_WARNING);
  });

  it('flags common Spanish and English definitive product-status variants', () => {
    const forbiddenVariants = [
      'Es un producto sanitario.',
      'Seria un producto sanitario.',
      'Sería un producto sanitario.',
      'Podria ser un producto sanitario.',
      'This is likely a medical device.',
      'It would be a medical device.',
    ];
    const allowedReviewBoundPhrases = [
      'podria requerir revision competente',
      'requires competent human review',
      'signals should be reviewed',
    ];

    expect(forbiddenVariants.every((phrase) => containsForbiddenMedicalDeviceOutput(phrase))).toBe(true);
    expect(allowedReviewBoundPhrases.some((phrase) => containsForbiddenMedicalDeviceOutput(phrase))).toBe(false);
  });

  it('keeps uncertain triage incomplete until uncertainty information is recorded', () => {
    const missingUncertaintyState = {
      ...completeState,
      triage_status: 'uncertain' as const,
      uncertainties: [],
    };
    const completeUncertainState = {
      ...completeState,
      triage_status: 'uncertain' as const,
      uncertainties: ['The intended-use boundary remains uncertain and needs competent review.'],
    };

    expect(computeMedicalDeviceMissingInformation(missingUncertaintyState)).toContain('uncertainties');
    expect(evaluateMedicalDeviceCompletion(missingUncertaintyState)).toBe(false);
    expect(computeMedicalDeviceMissingInformation(completeUncertainState)).toEqual([]);
    expect(evaluateMedicalDeviceCompletion(completeUncertainState)).toBe(true);
  });

  it('does not trust model done status when missing-info policy is incomplete', () => {
    const turn: MedicalDeviceTriageTurn = {
      agent_status: 'done',
      diagnosis: ['Human review remains required.'],
      updated_medical_device_triage: {
        ...completeState,
        triage_status: 'uncertain',
        uncertainties: [],
      },
      next_question: '',
      completion_reason: 'done',
    };

    const guarded = enforceMedicalDeviceTriageTurnGuardrails(turn);

    expect(guarded.turn.agent_status).toBe('continue');
    expect(guarded.turn.next_question).toMatch(/\?$/);
    expect(guarded.detectedGaps).toContain('uncertainties');
    expect(guarded.warnings).toContain('Model marked medical-device triage as done before completion criteria were met');
  });

  it('forces vague answers back to continue', () => {
    const turn: MedicalDeviceTriageTurn = {
      agent_status: 'done',
      diagnosis: ['Enough detail for review.'],
      updated_medical_device_triage: completeState,
      next_question: '',
      completion_reason: 'medical-device triage gaps sufficiently clarified for human review',
    };

    const guarded = enforceMedicalDeviceTriageTurnGuardrails(turn, 'no lo se');

    expect(guarded.turn.agent_status).toBe('continue');
    expect(guarded.turn.next_question).toMatch(/\?$/);
    expect(guarded.warnings).toContain('Latest medical-device triage answer was vague; clarification was narrowed');
  });

  it('selects and resolves medical-device triage gaps only', () => {
    const gaps: AlphaGap[] = [
      baseGap,
      { ...baseGap, gap_id: 'gap-clinical-role', field: 'clinical_decision_role' },
      { ...baseGap, gap_id: 'gap-evidence', field: 'evidence_needed' },
      { ...baseGap, gap_id: 'gap-extra', field: 'human_review_plan' },
      { ...baseGap, gap_id: 'gap-data', module: 'data_ai_privacy', field: 'data_sources' },
    ];

    expect(selectMedicalDeviceGapRefs(gaps, emptyMedicalDeviceTriageState('applicable'))).toEqual([
      'gap-intended-use',
      'gap-clinical-role',
      'gap-evidence',
    ]);
    expect(classifyMedicalDeviceGapStatuses([baseGap], completeState, 'turn-1')).toEqual([
      {
        gapId: 'gap-intended-use',
        gapStatus: 'resolved',
        resolvedByTurnId: 'turn-1',
      },
    ]);
  });

  it('resolves remaining active medical-device gaps when completion criteria are met', () => {
    const reviewGap: AlphaGap = {
      ...baseGap,
      gap_id: 'gap-review-boundary',
      gap_kind: 'needs_user_confirmation',
      gap_status: 'open',
      field: 'review_boundary',
      description: 'Confirm the review boundary before closing the phase.',
      absence: {
        is_absent: false,
        checked_fields: ['review_boundary'],
        reason: 'The phase can close with this review-bound uncertainty documented.',
      },
    };

    expect(classifyMedicalDeviceGapStatuses([reviewGap], completeState, 'turn-1')).toEqual([
      {
        gapId: 'gap-review-boundary',
        gapStatus: 'resolved',
        resolvedByTurnId: 'turn-1',
      },
    ]);
  });

  it('renders a review-bound section without raw model or decision fields', () => {
    const source: ProposalSource = {
      source_id: 'source-1',
      source_kind: 'user_answer',
      label: 'Medical-device triage answer turn 1',
      turn_id: 'turn-1',
      created_at: '2026-06-04T10:00:00.000Z',
    };
    const refs = buildMedicalDeviceSectionSourceRefs([], [source]);
    const rendered = renderMedicalDeviceTriageSection(completeState, {
      sourceCount: refs.length,
      gapCount: 1,
    });

    expect(refs).toEqual([source]);
    expect(rendered.warnings).toContain(MEDICAL_DEVICE_TRIAGE_REVIEW_WARNING);
    expect(rendered.contentMarkdown).toContain(MEDICAL_DEVICE_TRIAGE_REVIEW_WARNING);
    expect(rendered.contentMarkdown).not.toMatch(/raw_model_output|validated_output_json|dictamen|class II|approved|rejected/i);
    expect(containsForbiddenMedicalDeviceOutput(rendered)).toBe(false);
  });
});
