import { describe, expect, it } from 'vitest';

import type {
  AlphaGap,
  GeneratedSection,
  ProposalSource,
  StructuredBrief,
} from '../../apps/api/src/contracts/types.ts';
import {
  BASIC_ALPHA_REPORT_WARNINGS,
  assertNoRawModelFields,
  collectBasicReportSources,
  composeBasicAlphaReport,
  determineBasicReportStatus,
} from '../../apps/api/src/domain/basic-report.ts';

const createdAt = '2026-05-25T12:00:00.000Z';

const structuredBrief: StructuredBrief = {
  project_title: 'Triage IA',
  goal: 'Clarify the proposal before committee review.',
  target_user: 'Admission nursing staff',
  problem_owner: 'Emergency department operations',
  problem_statement: 'Admission triage waits increase during peak hours.',
  evidence_of_problem: 'Wait-time logs show 20 to 35 minute delays.',
  current_alternatives: 'Manual notes and static triage protocols.',
  scope: 'Adult emergency intake during peak hours.',
  constraints_known: [],
  assumptions: ['Nurses can answer bounded intake questions.'],
  ambiguities: [],
  missing_information: [],
};

const source: ProposalSource = {
  source_id: 'source-1',
  source_kind: 'pasted_text',
  label: 'Initial proposal text',
  created_at: createdAt,
};

const generatedSource: ProposalSource = {
  source_id: 'source-generated',
  source_kind: 'generated_section',
  label: 'Generated section source',
  section_id: 'section-problem',
  created_at: createdAt,
};

const gap: AlphaGap = {
  gap_id: 'gap-1',
  proposal_id: 'proposal-1',
  module: 'problem',
  gap_kind: 'missing_information',
  gap_status: 'open',
  origin: 'structured_brief_field',
  field: 'evidence_of_problem',
  description: 'Evidence needs clarification.',
  absence: {
    is_absent: true,
    checked_fields: ['evidence_of_problem'],
    reason: 'Evidence was not sufficiently specific.',
  },
  source_refs: [source],
  audit_refs: [],
  warnings: [],
  created_at: createdAt,
  updated_at: createdAt,
};

const problemSection: GeneratedSection = {
  section_id: 'section-problem',
  proposal_id: 'proposal-1',
  section_kind: 'problem',
  section_status: 'generated',
  section_version: 1,
  title: 'Problem definition',
  content_markdown: '## Problem\nAdmission triage waits increase during peak hours.',
  source_refs: [source, generatedSource],
  gap_refs: ['gap-1'],
  generated_by_run_id: 'run-problem',
  warnings: [],
  created_at: createdAt,
};

const solutionSection: GeneratedSection = {
  ...problemSection,
  section_id: 'section-solution',
  section_kind: 'solution',
  title: 'Solution definition',
  content_markdown: '## Solution\nA guided assistant prepares structured handoff notes.',
  generated_by_run_id: 'run-solution',
};

describe('basic report domain rules', () => {
  it('marks reports with open gaps as needing revision', () => {
    expect(determineBasicReportStatus([gap])).toBe('needs_revision');
    expect(determineBasicReportStatus([{ ...gap, gap_status: 'resolved' }])).toBe('ready');
  });

  it('dedupes internal sources and excludes generated-section refs', () => {
    const sources = collectBasicReportSources({
      proposalSources: [source],
      problemSection,
      solutionSection,
    });

    expect(sources).toEqual([source]);
  });

  it('composes fixed no-decision warnings and contract metadata', () => {
    const report = composeBasicAlphaReport({
      reportId: 'report-1',
      proposalId: 'proposal-1',
      structuredBrief,
      currentGaps: [gap],
      problemSection,
      solutionSection,
      internalSources: [source],
      auditRefs: [{ kind: 'agent_run', id: 'run-problem' }],
      generatedAt: createdAt,
    });

    expect(report.schema_version).toBe('basic-alpha-report.v1');
    expect(report.report_status).toBe('needs_revision');
    expect(report.warnings).toEqual(BASIC_ALPHA_REPORT_WARNINGS);
    expect(report.warnings.join(' ')).toMatch(/not a dictamen/i);
    expect(report.warnings.join(' ')).toMatch(/does not approve, reject/i);
    expect(report.warnings.join(' ')).toMatch(/legal, clinical, or regulatory decision/i);
  });

  it('fails if raw model fields enter the report payload', () => {
    expect(() =>
      assertNoRawModelFields({
        ...problemSection,
        raw_model_output: '{"secret":true}',
      }),
    ).toThrow(/raw_model_output/);
  });
});
