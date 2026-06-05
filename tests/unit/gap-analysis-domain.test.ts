import { describe, expect, it } from 'vitest';

import type { ProposalSource, StructuredBrief } from '../../apps/api/src/contracts/types.ts';
import {
  analyzeInitialGapCandidates,
  detectInitialGapCandidates,
} from '../../apps/api/src/domain/gap-analysis.ts';

const baseBrief: StructuredBrief = {
  project_title: 'Triage IA',
  goal: 'Definir mejor el problema',
  target_user: 'Equipo de admision',
  problem_owner: 'Enfermeria de admision',
  problem_statement: 'El triaje inicial se retrasa en horas punta',
  evidence_of_problem: '',
  current_alternatives: 'Protocolo manual y hojas de cribado',
  scope: 'Urgencias de adultos',
  constraints_known: [],
  assumptions: ['El cuello de botella esta en admision'],
  ambiguities: [],
  missing_information: [],
};

const proposalSource: ProposalSource = {
  source_id: 'source-1',
  source_kind: 'pasted_text',
  label: 'Proposal text',
  document_id: 'document-1',
  span: {
    start_char: 0,
    end_char: 80,
  },
  created_at: '2026-05-24T00:00:00.000Z',
};

describe('gap analysis domain rules', () => {
  it('creates absence-backed missing information gaps without invented source refs', () => {
    const gaps = detectInitialGapCandidates({ structuredBrief: baseBrief });
    const evidenceGap = gaps.find((gap) => gap.field === 'evidence_of_problem');

    expect(evidenceGap).toMatchObject({
      module: 'problem',
      gap_kind: 'missing_information',
      origin: 'structured_brief_field',
      absence: {
        is_absent: true,
        checked_fields: ['evidence_of_problem'],
      },
      source_refs: [],
    });
    expect(evidenceGap?.question_hint).toMatch(/\?$/);
  });

  it('creates ambiguity gaps with candidate questions', () => {
    const gaps = detectInitialGapCandidates({
      structuredBrief: {
        ...baseBrief,
        evidence_of_problem: 'Registro interno de esperas',
        ambiguities: ['No esta claro quien responde como problem_owner'],
      },
    });

    expect(gaps).toContainEqual(
      expect.objectContaining({
        field: 'problem_owner',
        gap_kind: 'ambiguous_information',
        origin: 'structured_brief_ambiguity',
        absence: {
          is_absent: false,
          checked_fields: [],
          reason: '',
        },
      }),
    );
  });

  it('dedupes duplicate missing information by module, field, and kind', () => {
    const gaps = detectInitialGapCandidates({
      structuredBrief: {
        ...baseBrief,
        missing_information: ['evidence_of_problem', 'evidence of problem'],
      },
    });

    expect(gaps.filter((gap) => gap.field === 'evidence_of_problem')).toHaveLength(1);
  });

  it('filters forbidden Alpha scope items instead of persisting them as gaps', () => {
    const analysis = analyzeInitialGapCandidates({
      structuredBrief: {
        ...baseBrief,
        evidence_of_problem: 'Registro interno de esperas',
        missing_information: ['medical device classification', 'legal dictamen', 'pilot budget'],
        ambiguities: ['regulatory clinic pathway is unclear'],
      },
    });
    const gaps = analysis.candidates;

    expect(gaps).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ description: expect.stringMatching(/medical device|legal|regulatory|budget/i) }),
      ]),
    );
    expect(analysis.filtered).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'missing_information',
          reason: 'forbidden_scope',
        }),
        expect.objectContaining({
          field: 'ambiguities',
          reason: 'forbidden_scope',
        }),
      ]),
    );
  });

  it('keeps valid clinical problem-definition context inside Alpha scope', () => {
    const gaps = detectInitialGapCandidates({
      structuredBrief: {
        ...baseBrief,
        evidence_of_problem: 'Registro interno de esperas',
        missing_information: ['clinical workflow owner'],
      },
    });

    expect(gaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'missing_information',
          description: expect.stringMatching(/clinical workflow owner/i),
        }),
      ]),
    );
  });

  it('uses real proposal sources only for confirmation gaps', () => {
    const gaps = detectInitialGapCandidates({
      structuredBrief: {
        ...baseBrief,
        evidence_of_problem: 'Registro interno de esperas',
      },
      sources: [proposalSource],
    });

    const confirmationGap = gaps.find((gap) => gap.gap_kind === 'needs_user_confirmation');

    expect(confirmationGap).toMatchObject({
      module: 'solution',
      field: 'target_user',
      origin: 'proposal_source',
      source_refs: [proposalSource],
      absence: {
        is_absent: false,
      },
    });
  });
});
