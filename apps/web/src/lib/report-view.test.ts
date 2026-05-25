import { describe, expect, it } from 'vitest';

import type { BasicAlphaReport } from '../domain/contracts';
import { deriveReportPresentation } from './report-view';

const createdAt = '2026-05-25T12:00:00.000Z';

const report: BasicAlphaReport = {
  report_id: 'report-1',
  proposal_id: 'session-1',
  report_status: 'needs_revision',
  schema_version: 'basic-alpha-report.v1',
  structured_brief: {
    project_title: 'Triage IA',
    goal: 'Clarify the proposal before committee review.',
    target_user: 'Admission nursing staff',
    problem_owner: 'Emergency department operations',
    problem_statement: 'Admission triage waits increase during peak hours.',
    evidence_of_problem: 'Wait-time logs show 20 to 35 minute delays.',
    current_alternatives: 'Manual notes and static protocols.',
    scope: 'Adult emergency intake.',
    constraints_known: [],
    assumptions: ['Staff can answer bounded questions.'],
    ambiguities: [],
    missing_information: [],
  },
  current_gaps: [
    {
      gap_id: 'gap-1',
      proposal_id: 'session-1',
      module: 'problem',
      gap_kind: 'missing_information',
      gap_status: 'open',
      origin: 'structured_brief_field',
      field: 'evidence_of_problem',
      description: 'Evidence needs clarification.',
      absence: {
        is_absent: true,
        checked_fields: ['evidence_of_problem'],
        reason: 'Evidence is not specific.',
      },
      source_refs: [],
      audit_refs: [],
      warnings: [],
      created_at: createdAt,
      updated_at: createdAt,
    },
    {
      gap_id: 'gap-2',
      proposal_id: 'session-1',
      module: 'solution',
      gap_kind: 'missing_information',
      gap_status: 'resolved',
      origin: 'system_rule',
      field: 'solution_summary',
      description: 'Solution summary was clarified.',
      absence: {
        is_absent: false,
        checked_fields: ['solution_summary'],
        reason: 'Resolved by user answer.',
      },
      source_refs: [],
      audit_refs: [],
      warnings: [],
      created_at: createdAt,
      updated_at: createdAt,
    },
  ],
  problem_section: {
    section_id: 'section-problem',
    proposal_id: 'session-1',
    section_kind: 'problem',
    section_status: 'generated',
    section_version: 1,
    title: 'Problem definition',
    content_markdown: '## Problem\nAdmission waits increase.',
    source_refs: [],
    gap_refs: ['gap-1'],
    generated_by_run_id: 'run-problem',
    warnings: [],
    created_at: createdAt,
  },
  solution_section: {
    section_id: 'section-solution',
    proposal_id: 'session-1',
    section_kind: 'solution',
    section_status: 'generated',
    section_version: 1,
    title: 'Solution definition',
    content_markdown: '## Solution\nGuided handoff notes.',
    source_refs: [],
    gap_refs: ['gap-2'],
    generated_by_run_id: 'run-solution',
    warnings: [],
    created_at: createdAt,
  },
  internal_sources: [
    {
      source_id: 'source-1',
      source_kind: 'pasted_text',
      label: 'Initial proposal text',
      created_at: createdAt,
    },
  ],
  audit_refs: [
    { kind: 'agent_run', id: 'run-problem' },
    { kind: 'agent_run', id: 'run-solution' },
  ],
  warnings: [
    'This Alpha report is not a dictamen and must not be used as one.',
    'This Alpha report does not approve, reject, rank, or prioritize the proposal.',
  ],
  generated_at: createdAt,
};

describe('deriveReportPresentation', () => {
  it('groups current gaps and exposes compact counts', () => {
    const presentation = deriveReportPresentation(report);

    expect(presentation.status).toBe('needs revision');
    expect(presentation.sourceCount).toBe(1);
    expect(presentation.auditRefCount).toBe(2);
    expect(presentation.openGaps.map((gap) => gap.gap_id)).toEqual(['gap-1']);
    expect(presentation.gapGroups.map((group) => group.status)).toEqual(['open', 'resolved']);
  });

  it('uses only the report payload and has no audit-run raw output dependency', () => {
    const presentation = deriveReportPresentation(report);

    expect(JSON.stringify(presentation)).not.toContain('raw_model_output');
    expect(JSON.stringify(presentation)).not.toContain('validated_output_json');
    expect(JSON.stringify(presentation)).not.toContain('model_params_json');
  });
});
