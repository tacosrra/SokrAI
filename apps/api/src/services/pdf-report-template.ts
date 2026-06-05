import PDFDocument from 'pdfkit';

import type {
  AlphaGap,
  AuditRef,
  BasicAlphaReport,
  GeneratedSection,
  ProposalSource,
  SectionKind,
} from '../contracts/types';
import { assertNoRawModelFields } from '../domain/basic-report';

export const BASIC_REPORT_PDF_TEMPLATE_VERSION = 'basic-report-pdf.v1';

type ActiveGapStatus = 'open' | 'in_progress' | 'deferred';

export interface BasicReportPdfModel {
  export_id: string;
  template_version: typeof BASIC_REPORT_PDF_TEMPLATE_VERSION;
  report_id: string;
  proposal_id: string;
  proposal_title: string;
  report_schema_version: string;
  report_status: string;
  report_generated_at: string;
  exported_at: string;
  structured_brief: {
    goal: string;
    target_user: string;
    problem_owner: string;
    problem_statement: string;
    evidence_of_problem: string;
    scope: string;
    current_alternatives: string;
    assumptions: string[];
    ambiguities: string[];
  };
  sections: BasicReportPdfSection[];
  open_gaps: BasicReportPdfGap[];
  internal_sources: BasicReportPdfSource[];
  audit_refs: AuditRef[];
  warnings: string[];
  metadata: {
    export_id: string;
    template_version: typeof BASIC_REPORT_PDF_TEMPLATE_VERSION;
    report_payload_sha256: string | null;
    section_count: number;
    open_gap_count: number;
    source_count: number;
    warning_count: number;
  };
}

export interface BasicReportPdfSection {
  section_id: string;
  section_kind: SectionKind;
  section_status: string;
  section_version: number;
  title: string;
  content_markdown: string;
  source_count: number;
  gap_count: number;
  warnings: string[];
  created_at: string;
}

interface BasicReportPdfGap {
  gap_id: string;
  module: string;
  gap_kind: string;
  gap_status: ActiveGapStatus;
  field: string;
  description: string;
  question_hint?: string;
  warning_count: number;
}

interface BasicReportPdfSource {
  source_id: string;
  source_kind: string;
  label: string;
  created_at: string;
}

export interface BasicReportPdfExportMetadataInput {
  exportId: string;
  exportedAt: string;
  reportPayloadSha256?: string | null;
}

const ACTIVE_GAP_STATUSES = new Set(['open', 'in_progress', 'deferred']);
const SECTION_ORDER: SectionKind[] = [
  'problem',
  'solution',
  'data_ai_privacy',
  'medical_device_triage',
  'resources_pilot_viability',
];

export function buildBasicReportPdfModel(
  report: BasicAlphaReport,
  generatedSections: GeneratedSection[],
  exportMetadata: BasicReportPdfExportMetadataInput,
): BasicReportPdfModel {
  assertNoRawModelFields(report);
  assertNoRawModelFields(generatedSections);

  const sections = collectPdfSections(report, generatedSections);
  const openGaps = report.current_gaps
    .filter((gap): gap is AlphaGap & { gap_status: ActiveGapStatus } => ACTIVE_GAP_STATUSES.has(gap.gap_status))
    .map(toPdfGap);

  const model: BasicReportPdfModel = {
    export_id: exportMetadata.exportId,
    template_version: BASIC_REPORT_PDF_TEMPLATE_VERSION,
    report_id: report.report_id,
    proposal_id: report.proposal_id,
    proposal_title: report.structured_brief.project_title,
    report_schema_version: report.schema_version,
    report_status: report.report_status,
    report_generated_at: report.generated_at,
    exported_at: exportMetadata.exportedAt,
    structured_brief: {
      goal: report.structured_brief.goal,
      target_user: report.structured_brief.target_user,
      problem_owner: report.structured_brief.problem_owner,
      problem_statement: report.structured_brief.problem_statement,
      evidence_of_problem: report.structured_brief.evidence_of_problem,
      scope: report.structured_brief.scope,
      current_alternatives: report.structured_brief.current_alternatives,
      assumptions: report.structured_brief.assumptions,
      ambiguities: report.structured_brief.ambiguities,
    },
    sections,
    open_gaps: openGaps,
    internal_sources: report.internal_sources.map(toPdfSource),
    audit_refs: report.audit_refs.map(toAuditRef),
    warnings: [...report.warnings],
    metadata: {
      export_id: exportMetadata.exportId,
      template_version: BASIC_REPORT_PDF_TEMPLATE_VERSION,
      report_payload_sha256: exportMetadata.reportPayloadSha256 ?? null,
      section_count: sections.length,
      open_gap_count: openGaps.length,
      source_count: report.internal_sources.length,
      warning_count: report.warnings.length,
    },
  };

  assertNoRawModelFields(model);

  return model;
}

export async function renderBasicReportPdf(model: BasicReportPdfModel): Promise<Buffer> {
  assertNoRawModelFields(model);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      autoFirstPage: false,
      bufferPages: false,
      info: {
        Title: `SokrAI Basic Alpha Report - ${model.proposal_title}`,
        Subject: 'Auditable Basic Alpha report snapshot',
        Author: 'SokrAI',
        Creator: BASIC_REPORT_PDF_TEMPLATE_VERSION,
      },
      margin: 54,
      size: 'A4',
    });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.addPage();
    renderTitlePage(doc, model);
    renderBrief(doc, model);
    renderSections(doc, model.sections);
    renderGaps(doc, model.open_gaps);
    renderSources(doc, model.internal_sources);
    renderAuditRefs(doc, model.audit_refs);
    renderWarnings(doc, model.warnings);
    renderMetadata(doc, model);

    doc.end();
  });
}

function collectPdfSections(
  report: BasicAlphaReport,
  generatedSections: GeneratedSection[],
): BasicReportPdfSection[] {
  const currentByKind = new Map<SectionKind, GeneratedSection>();

  for (const section of [report.problem_section, report.solution_section, ...generatedSections]) {
    if (section.section_status === 'superseded') {
      continue;
    }

    const current = currentByKind.get(section.section_kind);

    if (
      !current ||
      section.section_version > current.section_version ||
      (section.section_version === current.section_version && section.created_at > current.created_at)
    ) {
      currentByKind.set(section.section_kind, section);
    }
  }

  return SECTION_ORDER.flatMap((sectionKind) => {
    const section = currentByKind.get(sectionKind);
    return section ? [toPdfSection(section)] : [];
  });
}

function toPdfSection(section: GeneratedSection): BasicReportPdfSection {
  return {
    section_id: section.section_id,
    section_kind: section.section_kind,
    section_status: section.section_status,
    section_version: section.section_version,
    title: section.title,
    content_markdown: section.content_markdown,
    source_count: section.source_refs.length,
    gap_count: section.gap_refs.length,
    warnings: [...section.warnings],
    created_at: section.created_at,
  };
}

function toPdfGap(gap: AlphaGap & { gap_status: ActiveGapStatus }): BasicReportPdfGap {
  return {
    gap_id: gap.gap_id,
    module: gap.module,
    gap_kind: gap.gap_kind,
    gap_status: gap.gap_status,
    field: gap.field,
    description: gap.description,
    question_hint: gap.question_hint,
    warning_count: gap.warnings.length,
  };
}

function toPdfSource(source: ProposalSource): BasicReportPdfSource {
  return {
    source_id: source.source_id,
    source_kind: source.source_kind,
    label: source.label,
    created_at: source.created_at,
  };
}

function toAuditRef(ref: AuditRef): AuditRef {
  return { kind: ref.kind, id: ref.id };
}

function renderTitlePage(doc: PDFKit.PDFDocument, model: BasicReportPdfModel): void {
  doc.font('Helvetica-Bold').fontSize(22).text('Basic Alpha Report', { align: 'left' });
  doc.moveDown(0.4);
  doc.font('Helvetica').fontSize(12).fillColor('#425466').text('Structured proposal snapshot for human review.');
  doc.moveDown(1);

  renderKeyValue(doc, 'Proposal title', model.proposal_title);
  renderKeyValue(doc, 'Proposal ID', model.proposal_id);
  renderKeyValue(doc, 'Report ID', model.report_id);
  renderKeyValue(doc, 'Report status', model.report_status);
  renderKeyValue(doc, 'Report schema', model.report_schema_version);
  renderKeyValue(doc, 'Report generated at', model.report_generated_at);
  renderKeyValue(doc, 'Exported at', model.exported_at);
  renderKeyValue(doc, 'Template version', model.template_version);
  doc.moveDown(0.8);
}

function renderBrief(doc: PDFKit.PDFDocument, model: BasicReportPdfModel): void {
  renderHeading(doc, 'Structured Brief');
  renderKeyValue(doc, 'Goal', model.structured_brief.goal);
  renderKeyValue(doc, 'Target user', model.structured_brief.target_user);
  renderKeyValue(doc, 'Problem owner', model.structured_brief.problem_owner);
  renderParagraphBlock(doc, 'Problem statement', model.structured_brief.problem_statement);
  renderParagraphBlock(doc, 'Evidence of problem', model.structured_brief.evidence_of_problem);
  renderParagraphBlock(doc, 'Scope', model.structured_brief.scope);
  renderParagraphBlock(doc, 'Current alternatives', model.structured_brief.current_alternatives);
  renderList(doc, 'Assumptions', model.structured_brief.assumptions);
  renderList(doc, 'Ambiguities', model.structured_brief.ambiguities);
}

function renderSections(doc: PDFKit.PDFDocument, sections: BasicReportPdfSection[]): void {
  for (const section of sections) {
    renderHeading(doc, section.title);
    renderKeyValue(doc, 'Kind', section.section_kind);
    renderKeyValue(doc, 'Version/status', `v${section.section_version} / ${section.section_status}`);
    renderKeyValue(doc, 'Sources/gaps', `${section.source_count} sources / ${section.gap_count} gaps`);
    renderMarkdownLikeText(doc, section.content_markdown);
    renderList(doc, 'Section warnings', section.warnings);
  }
}

function renderGaps(doc: PDFKit.PDFDocument, gaps: BasicReportPdfGap[]): void {
  renderHeading(doc, 'Open Gaps');

  if (gaps.length === 0) {
    renderBodyText(doc, 'No open, in-progress, or deferred gaps are recorded in this report.');
    return;
  }

  for (const gap of gaps) {
    renderParagraphBlock(doc, `${gap.gap_status} / ${gap.field}`, `${gap.description} (${gap.gap_kind}, ${gap.module})`);
    if (gap.question_hint) {
      renderBodyText(doc, `Question hint: ${gap.question_hint}`);
    }
  }
}

function renderSources(doc: PDFKit.PDFDocument, sources: BasicReportPdfSource[]): void {
  renderHeading(doc, 'Internal Sources');

  if (sources.length === 0) {
    renderBodyText(doc, 'No internal sources are associated with this report.');
    return;
  }

  for (const source of sources) {
    renderBodyText(doc, `${source.source_id} - ${source.source_kind} - ${source.label}`);
  }
}

function renderAuditRefs(doc: PDFKit.PDFDocument, auditRefs: AuditRef[]): void {
  renderHeading(doc, 'Audit References');

  if (auditRefs.length === 0) {
    renderBodyText(doc, 'No audit references are associated with this report.');
    return;
  }

  for (const ref of auditRefs) {
    renderBodyText(doc, `${ref.kind}: ${ref.id}`);
  }
}

function renderWarnings(doc: PDFKit.PDFDocument, warnings: string[]): void {
  renderHeading(doc, 'Warnings');
  renderList(doc, 'Report warnings', warnings);
}

function renderMetadata(doc: PDFKit.PDFDocument, model: BasicReportPdfModel): void {
  renderHeading(doc, 'Export Metadata');
  renderKeyValue(doc, 'Export ID', model.metadata.export_id);
  renderKeyValue(doc, 'Template version', model.metadata.template_version);
  renderKeyValue(doc, 'Report payload SHA-256', model.metadata.report_payload_sha256 ?? 'pending');
  renderKeyValue(doc, 'Section count', String(model.metadata.section_count));
  renderKeyValue(doc, 'Open gap count', String(model.metadata.open_gap_count));
  renderKeyValue(doc, 'Source count', String(model.metadata.source_count));
  renderKeyValue(doc, 'Warning count', String(model.metadata.warning_count));
}

function renderHeading(doc: PDFKit.PDFDocument, text: string): void {
  ensureSpace(doc, 80);
  doc.moveDown(0.9);
  doc.font('Helvetica-Bold').fontSize(15).fillColor('#1f2937').text(text);
  doc.moveDown(0.25);
}

function renderKeyValue(doc: PDFKit.PDFDocument, label: string, value: string): void {
  ensureSpace(doc, 36);
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#425466').text(label.toUpperCase());
  renderBodyText(doc, value || 'Not persisted');
}

function renderParagraphBlock(doc: PDFKit.PDFDocument, label: string, value: string): void {
  ensureSpace(doc, 60);
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#1f2937').text(label);
  renderBodyText(doc, value || 'Not persisted');
}

function renderSubheading(doc: PDFKit.PDFDocument, text: string): void {
  ensureSpace(doc, 36);
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#1f2937').text(text);
  doc.moveDown(0.2);
}

function renderList(doc: PDFKit.PDFDocument, label: string, values: string[]): void {
  renderSubheading(doc, label);

  if (values.length === 0) {
    renderBodyText(doc, 'None recorded.');
    return;
  }

  for (const value of values) {
    renderBodyText(doc, `- ${value}`);
  }
}

function renderMarkdownLikeText(doc: PDFKit.PDFDocument, value: string): void {
  for (const line of value.split(/\r?\n/)) {
    const normalized = line.trim();

    if (!normalized) {
      doc.moveDown(0.35);
      continue;
    }

    if (normalized.startsWith('#')) {
      renderSubheading(doc, normalized.replace(/^#+\s*/, ''));
      continue;
    }

    renderBodyText(doc, normalized.replace(/^\s*[-*]\s+/, '- '));
  }
}

function renderBodyText(doc: PDFKit.PDFDocument, value: string): void {
  ensureSpace(doc, 28);
  doc.font('Helvetica').fontSize(10).fillColor('#111827').text(value, {
    align: 'left',
    lineGap: 2,
  });
  doc.moveDown(0.25);
}

function ensureSpace(doc: PDFKit.PDFDocument, requiredHeight: number): void {
  const bottom = doc.page.height - doc.page.margins.bottom;

  if (doc.y + requiredHeight > bottom) {
    doc.addPage();
  }
}
