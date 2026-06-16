import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

import type {
  AlphaGap,
  BasicAlphaReport,
  GeneratedSection,
  ProposalSource,
  StructuredBrief,
} from '../../apps/api/src/contracts/types';
import { BASIC_ALPHA_REPORT_WARNINGS } from '../../apps/api/src/domain/basic-report';
import {
  BASIC_REPORT_PDF_TEMPLATE_VERSION,
  buildBasicReportPdfModel,
  renderBasicReportPdf,
} from '../../apps/api/src/services/pdf-report-template';

const createdAt = '2026-06-05T10:00:00.000Z';
const requireFromTest = createRequire(import.meta.url);
const pdfParse = requireFromTest('../../apps/api/node_modules/pdf-parse') as (pdf: Buffer) => Promise<{
  text: string;
}>;

describe('Basic Alpha report PDF export template', () => {
  it('builds a structured export model with sections, open gaps, sources, warnings, and metadata', () => {
    const report = createReport();
    const model = buildBasicReportPdfModel(report, [createGeneratedSection('data_ai_privacy')], {
      exportId: 'export-1',
      exportedAt: '2026-06-05T10:30:00.000Z',
      reportPayloadSha256: 'hash-report',
    });

    expect(model.template_version).toBe(BASIC_REPORT_PDF_TEMPLATE_VERSION);
    expect(model.proposal_id).toBe('proposal-1');
    expect(model.proposal_title).toBe('Emergency triage support');
    expect(model.report_schema_version).toBe('basic-alpha-report.v1');
    expect(model.sections.map((section) => section.section_kind)).toEqual([
      'problem',
      'solution',
      'data_ai_privacy',
    ]);
    expect(model.open_gaps.map((gap) => gap.gap_status)).toEqual(['open', 'in_progress', 'deferred']);
    expect(model.internal_sources).toEqual([
      {
        source_id: 'source-1',
        source_kind: 'pasted_text',
        label: 'Initial proposal',
        created_at: createdAt,
      },
    ]);
    expect(model.audit_refs).toEqual([{ kind: 'agent_run', id: 'run-problem' }]);
    expect(model.warnings).toEqual(BASIC_ALPHA_REPORT_WARNINGS);
    expect(model.warnings.join(' ')).toMatch(/not a dictamen/i);
    expect(model.warnings.join(' ')).toMatch(/does not approve, reject/i);
    expect(model.metadata).toMatchObject({
      export_id: 'export-1',
      template_version: BASIC_REPORT_PDF_TEMPLATE_VERSION,
      report_payload_sha256: 'hash-report',
      section_count: 3,
      open_gap_count: 3,
      source_count: 1,
      warning_count: 3,
    });
  });

  it('uses only the latest non-superseded section per kind in fixed report order', () => {
    const report = createReport();
    const older = createGeneratedSection('data_ai_privacy');
    const supersededNewer: GeneratedSection = {
      ...createGeneratedSection('data_ai_privacy'),
      section_id: 'section-data-ai-superseded',
      section_status: 'superseded',
      section_version: 3,
      title: 'Do not render',
      created_at: '2026-06-05T12:00:00.000Z',
    };
    const current: GeneratedSection = {
      ...createGeneratedSection('data_ai_privacy'),
      section_id: 'section-data-ai-current',
      section_version: 2,
      title: 'Current data AI privacy section',
      created_at: '2026-06-05T11:00:00.000Z',
    };

    const model = buildBasicReportPdfModel(report, [older, supersededNewer, current], {
      exportId: 'export-1',
      exportedAt: '2026-06-05T10:30:00.000Z',
      reportPayloadSha256: 'hash-report',
    });

    expect(model.sections.map((section) => section.section_id)).toEqual([
      'section-problem',
      'section-solution',
      'section-data-ai-current',
    ]);
    expect(model.sections.map((section) => section.title)).not.toContain('Do not render');
  });

  it('renders required report content into the PDF text', async () => {
    const model = buildBasicReportPdfModel(createReport(), [createGeneratedSection('data_ai_privacy')], {
      exportId: 'export-1',
      exportedAt: '2026-06-05T10:30:00.000Z',
      reportPayloadSha256: 'hash-report',
    });
    const pdf = await renderBasicReportPdf(model);
    const parsed = await pdfParse(pdf);
    const serializedModel = JSON.stringify(model);

    expect(pdf.subarray(0, 4).toString('utf8')).toBe('%PDF');
    expect(parsed.text).toContain('Informe de propuesta');
    expect(parsed.text).toContain('Material para revisión humana');
    expect(parsed.text).toContain('Resumen ejecutivo');
    expect(parsed.text).toContain('Emergency triage support');
    expect(parsed.text).toContain('Reduce avoidable triage delays');
    expect(parsed.text).toContain('Datos, IA y privacidad');
    expect(parsed.text).toContain('Clarify scope for open');
    expect(parsed.text).toContain('Initial proposal');
    expect(parsed.text).toContain('Este informe no es un dictamen clínico, legal ni regulatorio.');
    expect(parsed.text).not.toContain('Basic Alpha Report');
    expect(parsed.text).not.toContain('Audit References');
    expect(parsed.text).not.toContain('Export Metadata');
    expect(parsed.text).not.toContain('REPORT PAYLOAD SHA-256');
    expect(parsed.text).not.toContain('agent_run');
    expect(parsed.text).not.toContain('hash-report');
    expect(parsed.text).not.toContain('proposal-1');
    expect(parsed.text).not.toContain('report-1');
    expect(parsed.text).not.toContain('source-1');
    expect(parsed.text).not.toContain('Not persisted');
    expect(serializedModel).not.toContain('raw_model_output');
    expect(serializedModel).not.toContain('validated_output_json');
    expect(serializedModel).not.toContain('prompt_name');
    expect(serializedModel).not.toContain('model_params_json');
  });

  it('rejects raw model fields before rendering', () => {
    const report = {
      ...createReport(),
      raw_model_output: '{"secret":true}',
    };

    expect(() =>
      buildBasicReportPdfModel(report as BasicAlphaReport, [], {
        exportId: 'export-1',
        exportedAt: '2026-06-05T10:30:00.000Z',
      }),
    ).toThrow(/raw_model_output/);
  });
});

function createReport(): BasicAlphaReport {
  const source = createSource();

  return {
    report_id: 'report-1',
    proposal_id: 'proposal-1',
    report_status: 'needs_revision',
    schema_version: 'basic-alpha-report.v1',
    structured_brief: createStructuredBrief(),
    current_gaps: [
      createGap('gap-open', 'open'),
      createGap('gap-in-progress', 'in_progress'),
      createGap('gap-deferred', 'deferred'),
      createGap('gap-resolved', 'resolved'),
    ],
    problem_section: createGeneratedSection('problem'),
    solution_section: createGeneratedSection('solution'),
    internal_sources: [source],
    audit_refs: [{ kind: 'agent_run', id: 'run-problem' }],
    warnings: BASIC_ALPHA_REPORT_WARNINGS,
    generated_at: createdAt,
  };
}

function createStructuredBrief(): StructuredBrief {
  return {
    project_title: 'Emergency triage support',
    goal: 'Reduce avoidable triage delays',
    target_user: 'Emergency nurses',
    problem_owner: 'Emergency department operations',
    problem_statement: 'Triage teams lack a shared view of incoming demand.',
    evidence_of_problem: 'Weekly reviews show delayed reassessments during peaks.',
    current_alternatives: 'Manual queue checks and hallway updates.',
    scope: 'One emergency department pilot.',
    constraints_known: ['No clinical decision automation'],
    assumptions: ['Staff can review dashboard alerts'],
    ambiguities: ['Exact staffing pattern is still open'],
    missing_information: ['Pilot week selection'],
  };
}

function createSource(): ProposalSource {
  return {
    source_id: 'source-1',
    source_kind: 'pasted_text',
    label: 'Initial proposal',
    document_id: 'document-1',
    created_at: createdAt,
  };
}

function createGap(gapId: string, gapStatus: AlphaGap['gap_status']): AlphaGap {
  return {
    gap_id: gapId,
    proposal_id: 'proposal-1',
    module: 'problem',
    gap_kind: 'ambiguous_information',
    gap_status: gapStatus,
    origin: 'structured_brief_ambiguity',
    field: 'scope',
    description: `Clarify scope for ${gapStatus}`,
    absence: {
      is_absent: false,
      checked_fields: ['scope'],
      reason: 'Field exists but needs precision',
    },
    question_hint: 'Which cohort is in scope?',
    source_refs: [createSource()],
    audit_refs: [],
    warnings: [],
    created_at: createdAt,
    updated_at: createdAt,
  };
}

function createGeneratedSection(sectionKind: GeneratedSection['section_kind']): GeneratedSection {
  return {
    section_id: `section-${sectionKind}`,
    proposal_id: 'proposal-1',
    section_kind: sectionKind,
    section_status: 'generated',
    section_version: 1,
    title: `${sectionKind.replaceAll('_', ' ')} section`,
    content_markdown: `# ${sectionKind}\n\nStructured content for ${sectionKind}.`,
    source_refs: [createSource()],
    gap_refs: ['gap-open'],
    generated_by_run_id: `run-${sectionKind}`,
    warnings: [],
    created_at: createdAt,
  };
}
