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
      bufferPages: true,
      info: {
        Title: `Informe de propuesta SokrAI - ${model.proposal_title}`,
        Subject: 'Material para revision humana',
        Author: 'SokrAI',
        Creator: 'SokrAI',
      },
      margin: 48,
      size: 'A4',
    });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.addPage();
    renderCover(doc, model);
    doc.addPage();
    renderExecutiveSummary(doc, model);
    renderProposalOverview(doc, model);
    renderPhaseMap(doc, model);
    renderBrief(doc, model);
    renderSections(doc, model.sections);
    renderGaps(doc, model.open_gaps);
    renderSources(doc, model.internal_sources);
    renderWarnings(doc, model.warnings);
    renderReviewChecklist(doc, model);
    renderNextActions(doc, model);
    renderFooters(doc);

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

const COLORS = {
  ink: '#143847',
  muted: '#3f6170',
  lightMuted: '#5e7b87',
  primary: '#0891b2',
  primaryDark: '#0d6d86',
  cyanSoft: '#ebf7fa',
  panel: '#fbfeff',
  border: '#d4e6ec',
  success: '#0f6d54',
  successBg: '#e9f8f2',
  warning: '#8a5a18',
  warningBg: '#fff6e5',
  danger: '#8c3f38',
};

const SECTION_LABELS: Record<SectionKind, string> = {
  problem: 'Problema',
  solution: 'Solución',
  data_ai_privacy: 'Datos, IA y privacidad',
  medical_device_triage: 'Revisión sanitaria y regulatoria',
  resources_pilot_viability: 'Piloto y recursos',
};

const MODULE_LABELS: Record<string, string> = {
  problem: 'Problema',
  solution: 'Solución',
  data_ai_privacy: 'Datos y privacidad',
  medical_device_triage: 'Revisión sanitaria',
  resources_pilot_viability: 'Piloto y recursos',
};

const FIELD_LABELS: Record<string, string> = {
  target_user: 'Usuario afectado',
  problem_owner: 'Responsable del problema',
  problem_statement: 'Problema',
  evidence_of_problem: 'Evidencia',
  scope: 'Alcance',
  current_alternatives: 'Alternativas actuales',
  solution_summary: 'Resumen de solución',
  how_it_works: 'Funcionamiento',
  workflow_change: 'Cambio en el trabajo',
  data_categories: 'Datos tratados',
  privacy_controls: 'Controles de privacidad',
  pilot_environment: 'Entorno piloto',
};

function renderCover(doc: PDFKit.PDFDocument, model: BasicReportPdfModel): void {
  const x = doc.page.margins.left;
  const y = doc.page.margins.top;
  const width = contentWidth(doc);

  doc.save();
  doc.roundedRect(x, y, width, 250, 18).fill(COLORS.cyanSoft);
  doc.roundedRect(x + 14, y + 14, width - 28, 222, 14).fill('#ffffff');
  doc.restore();

  doc.font('Helvetica-Bold').fontSize(12).fillColor(COLORS.primaryDark).text('SokrAI', x + 34, y + 34);
  doc.font('Helvetica-Bold').fontSize(25).fillColor(COLORS.ink).text('Informe de propuesta', x + 34, y + 72, {
    width: width - 68,
    lineGap: 2,
  });
  doc.font('Helvetica-Bold').fontSize(18).fillColor(COLORS.ink).text(toReportText(model.proposal_title), x + 34, doc.y + 12, {
    width: width - 68,
    lineGap: 2,
  });
  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(11).fillColor(COLORS.muted).text(
    'Material para revisión humana. No sustituye una revisión clínica, legal ni regulatoria.',
    {
      width: width - 68,
      lineGap: 2,
    },
  );

  const badgeY = y + 198;
  drawPill(doc, x + 34, badgeY, formatReportStatus(model.report_status), model.report_status === 'ready' ? 'success' : 'warning');
  doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted).text(`Generado: ${formatDate(model.report_generated_at)}`, x + 210, badgeY + 3);

  doc.y = y + 286;
  renderMetricRow(doc, [
    { label: 'Secciones recogidas', value: String(model.metadata.section_count) },
    { label: 'Aspectos pendientes', value: String(model.metadata.open_gap_count) },
    { label: 'Materiales usados', value: String(model.metadata.source_count) },
    { label: 'Avisos', value: String(model.metadata.warning_count) },
  ]);

  doc.moveDown(1);
  renderCallout(
    doc,
    'Aviso de uso',
    'Este documento prepara una propuesta para revisión. Las conclusiones deben ser revisadas por una persona responsable antes de cualquier uso real.',
    'warning',
  );
}

function renderExecutiveSummary(doc: PDFKit.PDFDocument, model: BasicReportPdfModel): void {
  renderHeading(doc, 'Resumen ejecutivo');
  renderLead(doc, model.structured_brief.goal);

  renderTwoColumnFields(doc, [
    ['Problema que aborda', model.structured_brief.problem_statement],
    ['Solución propuesta', summarizeSection(model.sections.find((section) => section.section_kind === 'solution'))],
    ['Usuario afectado', model.structured_brief.target_user],
    ['Responsable del problema', model.structured_brief.problem_owner],
  ]);

  const focus = model.open_gaps.length > 0
    ? `Antes de continuar, conviene resolver o validar ${model.open_gaps.length} aspecto(s) pendiente(s).`
    : 'No hay aspectos pendientes abiertos en este informe. Aun así, se recomienda revisión humana antes de compartirlo.';
  renderCallout(doc, 'Foco para la revisión', focus, model.open_gaps.length > 0 ? 'warning' : 'success');
}

function renderProposalOverview(doc: PDFKit.PDFDocument, model: BasicReportPdfModel): void {
  renderHeading(doc, 'Vista general de la propuesta');
  renderKeyValueGrid(doc, [
    ['Evidencia disponible', model.structured_brief.evidence_of_problem],
    ['Alcance', model.structured_brief.scope],
    ['Alternativas actuales', model.structured_brief.current_alternatives],
  ]);
  renderList(doc, 'Supuestos conocidos', model.structured_brief.assumptions);
  renderList(doc, 'Ambigüedades por validar', model.structured_brief.ambiguities);
}

function renderPhaseMap(doc: PDFKit.PDFDocument, model: BasicReportPdfModel): void {
  renderHeading(doc, 'Mapa de revisión');

  for (const sectionKind of SECTION_ORDER) {
    const section = model.sections.find((item) => item.section_kind === sectionKind);
    const openGaps = model.open_gaps.filter((gap) => gap.module === sectionKind);
    const status = section
      ? openGaps.length > 0 || section.section_status === 'needs_revision'
        ? 'Requiere revisión'
        : 'Recogida'
      : 'Pendiente si aplica';
    const detail = section
      ? openGaps.length > 0
        ? `${openGaps.length} aspecto(s) pendiente(s) en esta parte.`
        : 'Hay material redactado para revisión humana.'
      : 'No hay sección redactada en este informe.';

    renderStatusRow(doc, SECTION_LABELS[sectionKind], status, detail);
  }
}

function renderBrief(doc: PDFKit.PDFDocument, model: BasicReportPdfModel): void {
  renderHeading(doc, 'Información recogida');
  renderKeyValueGrid(doc, [
    ['Objetivo', model.structured_brief.goal],
    ['Usuario objetivo', model.structured_brief.target_user],
    ['Responsable', model.structured_brief.problem_owner],
    ['Problema', model.structured_brief.problem_statement],
    ['Evidencia', model.structured_brief.evidence_of_problem],
    ['Alcance', model.structured_brief.scope],
    ['Alternativas actuales', model.structured_brief.current_alternatives],
  ]);
}

function renderSections(doc: PDFKit.PDFDocument, sections: BasicReportPdfSection[]): void {
  renderHeading(doc, 'Secciones preparadas');

  if (sections.length === 0) {
    renderBodyText(doc, 'Todavía no hay secciones redactadas para este informe.');
    return;
  }

  for (const section of sections) {
    ensureSpace(doc, 120);
    doc.moveDown(0.4);
    doc.font('Helvetica-Bold').fontSize(13).fillColor(COLORS.ink).text(SECTION_LABELS[section.section_kind]);
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted).text(formatSectionStatus(section.section_status));
    doc.moveDown(0.25);
    renderMarkdownLikeText(doc, section.content_markdown);

    if (section.warnings.length > 0) {
      renderList(doc, 'Avisos de esta sección', section.warnings.map(formatWarning));
    }
  }
}

function renderGaps(doc: PDFKit.PDFDocument, gaps: BasicReportPdfGap[]): void {
  renderHeading(doc, 'Aspectos pendientes');

  if (gaps.length === 0) {
    renderCallout(doc, 'Sin pendientes abiertos', 'No hay puntos abiertos, en preparación o aplazados en este informe.', 'success');
    return;
  }

  for (const gap of gaps) {
    ensureSpace(doc, 74);
    doc.roundedRect(doc.page.margins.left, doc.y, contentWidth(doc), 62, 10).fill(COLORS.warningBg);
    const y = doc.y + 10;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.warning).text(
      `${formatGapStatus(gap.gap_status)} - ${MODULE_LABELS[gap.module] ?? 'Propuesta'}`,
      doc.page.margins.left + 12,
      y,
      { width: contentWidth(doc) - 24 },
    );
    doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.ink).text(formatFieldLabel(gap.field), {
      width: contentWidth(doc) - 24,
    });
    doc.font('Helvetica').fontSize(9.5).fillColor(COLORS.muted).text(toReportText(gap.description), {
      width: contentWidth(doc) - 24,
      lineGap: 1.5,
    });
    doc.y += 16;

    if (gap.question_hint) {
      renderBodyText(doc, `Para avanzar: ${gap.question_hint}`);
    }
  }
}

function renderSources(doc: PDFKit.PDFDocument, sources: BasicReportPdfSource[]): void {
  renderHeading(doc, 'Material de apoyo');

  if (sources.length === 0) {
    renderBodyText(doc, 'No hay material de apoyo asociado al informe.');
    return;
  }

  for (const source of sources) {
    renderStatusRow(doc, formatSourceKind(source.source_kind), 'Usado en el informe', toReportText(source.label));
  }
}

function renderWarnings(doc: PDFKit.PDFDocument, warnings: string[]): void {
  renderHeading(doc, 'Avisos importantes');
  const userWarnings = warnings.length > 0
    ? warnings.map(formatWarning)
    : ['Este informe no sustituye una revisión clínica, legal ni regulatoria.'];

  for (const warning of userWarnings) {
    renderCallout(doc, 'Límite de uso', warning, 'warning');
  }

  renderCallout(
    doc,
    'Privacidad',
    'No introduzcas datos reales de pacientes en esta versión local de demostración.',
    'warning',
  );
}

function renderReviewChecklist(doc: PDFKit.PDFDocument, model: BasicReportPdfModel): void {
  renderHeading(doc, 'Lista de revisión');
  const sectionKinds = new Set(model.sections.map((section) => section.section_kind));
  const checklist = [
    ['Problema claro', Boolean(model.structured_brief.problem_statement && model.structured_brief.evidence_of_problem && model.structured_brief.scope)],
    ['Usuario afectado definido', Boolean(model.structured_brief.target_user)],
    ['Solución descrita', sectionKinds.has('solution')],
    ['Datos y privacidad considerados', sectionKinds.has('data_ai_privacy')],
    ['Aspectos sanitarios acotados', sectionKinds.has('medical_device_triage')],
    ['Piloto y recursos tratados', sectionKinds.has('resources_pilot_viability')],
    ['Revisión humana requerida', true],
  ] as const;

  for (const [label, done] of checklist) {
    renderStatusRow(doc, label, done ? 'Recogido' : 'Pendiente de validar', done ? 'Revisar antes de compartir.' : 'Completar si aplica al alcance de la propuesta.');
  }
}

function renderNextActions(doc: PDFKit.PDFDocument, model: BasicReportPdfModel): void {
  renderHeading(doc, 'Próximos pasos recomendados');
  const actions = model.open_gaps.length > 0
    ? [
        'Completar la información pendiente antes de compartir el informe como versión final.',
        'Validar los puntos abiertos con la persona responsable del área.',
        'Revisar privacidad, datos y límites sanitarios si la propuesta cambia de alcance.',
      ]
    : [
        'Revisar el informe con una persona responsable antes de usarlo en un comité interno.',
        'Confirmar que no contiene datos reales de pacientes.',
        'Compartir el PDF solo como material de revisión humana.',
      ];

  renderNumberedList(doc, actions);
}

function renderMetricRow(doc: PDFKit.PDFDocument, metrics: Array<{ label: string; value: string }>): void {
  const gap = 10;
  const width = (contentWidth(doc) - gap * (metrics.length - 1)) / metrics.length;
  const y = doc.y;

  metrics.forEach((metric, index) => {
    const x = doc.page.margins.left + index * (width + gap);
    doc.roundedRect(x, y, width, 58, 10).fill('#ffffff').stroke(COLORS.border);
    doc.font('Helvetica-Bold').fontSize(18).fillColor(COLORS.ink).text(metric.value, x + 12, y + 10, {
      width: width - 24,
    });
    doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.muted).text(metric.label, x + 12, y + 34, {
      width: width - 24,
      lineGap: 1,
    });
  });

  doc.y = y + 72;
}

function renderTwoColumnFields(doc: PDFKit.PDFDocument, fields: Array<[string, string]>): void {
  const gap = 12;
  const width = (contentWidth(doc) - gap) / 2;
  let rowY = doc.y;

  fields.forEach((field, index) => {
    if (index % 2 === 0) {
      ensureSpace(doc, 86);
      rowY = doc.y;
    }

    const x = doc.page.margins.left + (index % 2) * (width + gap);
    renderFieldBox(doc, x, rowY, width, field[0], field[1]);

    if (index % 2 === 1) {
      doc.y = rowY + 76;
    }
  });

  if (fields.length % 2 === 1) {
    doc.y = rowY + 76;
  }
}

function renderKeyValueGrid(doc: PDFKit.PDFDocument, fields: Array<[string, string]>): void {
  for (const [label, value] of fields) {
    renderParagraphBlock(doc, label, value);
  }
}

function renderFieldBox(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
): void {
  doc.roundedRect(x, y, width, 66, 10).fill(COLORS.panel).stroke(COLORS.border);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.primaryDark).text(label, x + 12, y + 10, {
    width: width - 24,
  });
  doc.font('Helvetica').fontSize(9.4).fillColor(COLORS.ink).text(toReportText(value) || 'Pendiente de completar', x + 12, y + 26, {
    width: width - 24,
    height: 30,
    ellipsis: true,
    lineGap: 1,
  });
}

function renderStatusRow(doc: PDFKit.PDFDocument, label: string, status: string, detail: string): void {
  ensureSpace(doc, 56);
  const x = doc.page.margins.left;
  const y = doc.y;
  doc.roundedRect(x, y, contentWidth(doc), 48, 8).fill(COLORS.panel).stroke(COLORS.border);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.ink).text(label, x + 12, y + 10, {
    width: 170,
  });
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(status.includes('Pendiente') || status.includes('Requiere') ? COLORS.warning : COLORS.success).text(status, x + 194, y + 10, {
    width: 112,
  });
  doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted).text(toReportText(detail), x + 318, y + 10, {
    width: contentWidth(doc) - 330,
    lineGap: 1,
  });
  doc.y = y + 58;
}

function renderCallout(
  doc: PDFKit.PDFDocument,
  title: string,
  body: string,
  tone: 'warning' | 'success',
): void {
  ensureSpace(doc, 74);
  const fill = tone === 'success' ? COLORS.successBg : COLORS.warningBg;
  const ink = tone === 'success' ? COLORS.success : COLORS.warning;
  const x = doc.page.margins.left;
  const y = doc.y;

  doc.roundedRect(x, y, contentWidth(doc), 64, 10).fill(fill).stroke(tone === 'success' ? '#c8eadb' : '#f0d79f');
  doc.font('Helvetica-Bold').fontSize(10).fillColor(ink).text(title, x + 14, y + 12, {
    width: contentWidth(doc) - 28,
  });
  doc.font('Helvetica').fontSize(9.5).fillColor(COLORS.ink).text(toReportText(body), x + 14, y + 30, {
    width: contentWidth(doc) - 28,
    lineGap: 1.5,
  });
  doc.y = y + 78;
}

function renderHeading(doc: PDFKit.PDFDocument, text: string): void {
  ensureSpace(doc, 82);
  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(16).fillColor(COLORS.ink).text(text, doc.page.margins.left, doc.y, {
    width: contentWidth(doc),
  });
  doc.moveDown(0.35);
}

function renderLead(doc: PDFKit.PDFDocument, value: string): void {
  ensureSpace(doc, 48);
  doc.font('Helvetica').fontSize(11).fillColor(COLORS.muted).text(toReportText(value), doc.page.margins.left, doc.y, {
    width: contentWidth(doc),
    lineGap: 3,
  });
  doc.moveDown(0.6);
}

function renderParagraphBlock(doc: PDFKit.PDFDocument, label: string, value: string): void {
  ensureSpace(doc, 54);
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLORS.primaryDark).text(label, doc.page.margins.left, doc.y, {
    width: contentWidth(doc),
  });
  renderBodyText(doc, value || 'Pendiente de completar');
}

function renderSubheading(doc: PDFKit.PDFDocument, text: string): void {
  ensureSpace(doc, 36);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.ink).text(toReportText(text), doc.page.margins.left, doc.y, {
    width: contentWidth(doc),
  });
  doc.moveDown(0.2);
}

function renderList(doc: PDFKit.PDFDocument, label: string, values: string[]): void {
  renderSubheading(doc, label);

  if (values.length === 0) {
    renderBodyText(doc, 'No consta información en este apartado.');
    return;
  }

  for (const value of values) {
    renderBodyText(doc, `- ${value}`);
  }
}

function renderNumberedList(doc: PDFKit.PDFDocument, values: string[]): void {
  values.forEach((value, index) => {
    renderBodyText(doc, `${index + 1}. ${value}`);
  });
}

function renderMarkdownLikeText(doc: PDFKit.PDFDocument, value: string): void {
  for (const line of value.split(/\r?\n/)) {
    const normalized = line.trim();

    if (!normalized) {
      doc.moveDown(0.25);
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
  doc.font('Helvetica').fontSize(9.8).fillColor(COLORS.ink).text(toReportText(value), doc.page.margins.left, doc.y, {
    align: 'left',
    width: contentWidth(doc),
    lineGap: 2,
  });
  doc.moveDown(0.22);
}

function drawPill(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  label: string,
  tone: 'success' | 'warning',
): void {
  const width = doc.widthOfString(label) + 24;
  const fill = tone === 'success' ? COLORS.successBg : COLORS.warningBg;
  const ink = tone === 'success' ? COLORS.success : COLORS.warning;

  doc.roundedRect(x, y, width, 22, 11).fill(fill);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(ink).text(label, x + 12, y + 6);
}

function renderFooters(doc: PDFKit.PDFDocument): void {
  const range = doc.bufferedPageRange();

  for (let pageIndex = range.start; pageIndex < range.start + range.count; pageIndex += 1) {
    doc.switchToPage(pageIndex);
    const pageNumber = pageIndex - range.start + 1;
    const bottom = doc.page.height - doc.page.margins.bottom - 14;
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.lightMuted).text(
      `SokrAI | Material para revisión humana | Página ${pageNumber} de ${range.count}`,
      doc.page.margins.left,
      bottom,
      {
        width: contentWidth(doc),
        align: 'center',
      },
    );
  }
}

function contentWidth(doc: PDFKit.PDFDocument): number {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function summarizeSection(section: BasicReportPdfSection | undefined): string {
  if (!section) {
    return 'Pendiente de completar si aplica al alcance de la propuesta.';
  }

  const normalized = toReportText(
    section.content_markdown
      .split(/\r?\n/)
      .map((line) => line.replace(/^#+\s*/, '').replace(/^\s*[-*]\s+/, ''))
      .join(' '),
  ).replace(/\s+/g, ' ').trim();

  if (normalized.length <= 180) {
    return normalized;
  }

  return `${normalized.slice(0, 177).trim()}...`;
}

function formatReportStatus(value: string): string {
  switch (value) {
    case 'ready':
      return 'Listo para revisar';
    case 'needs_revision':
      return 'Pendiente de validar';
    default:
      return 'Borrador';
  }
}

function formatSectionStatus(value: string): string {
  switch (value) {
    case 'draft':
      return 'Borrador';
    case 'generated':
      return 'Preparada';
    case 'accepted':
      return 'Lista para revisar';
    case 'needs_revision':
      return 'Necesita revisión';
    default:
      return 'Pendiente de validar';
  }
}

function formatGapStatus(value: ActiveGapStatus): string {
  switch (value) {
    case 'open':
      return 'Pendiente';
    case 'in_progress':
      return 'En preparación';
    case 'deferred':
      return 'A revisar más adelante';
  }
}

function formatFieldLabel(value: string): string {
  return FIELD_LABELS[value] ?? value.replaceAll('_', ' ');
}

function formatSourceKind(value: string): string {
  switch (value) {
    case 'pasted_text':
      return 'Texto inicial';
    case 'uploaded_file':
      return 'Documento aportado';
    case 'extracted_text':
      return 'Texto extraído';
    case 'user_answer':
      return 'Respuesta guiada';
    default:
      return 'Material de apoyo';
  }
}

function formatWarning(value: string): string {
  const normalized = value.toLowerCase();

  if (normalized.includes('not a dictamen')) {
    return 'Este informe no es un dictamen clínico, legal ni regulatorio.';
  }

  if (normalized.includes('does not approve') || normalized.includes('approve, reject')) {
    return 'Este informe no aprueba, rechaza, prioriza ni clasifica la propuesta.';
  }

  if (normalized.includes('legal') || normalized.includes('clinical') || normalized.includes('regulatory')) {
    return 'El contenido requiere revisión humana competente antes de cualquier decisión.';
  }

  return toReportText(value);
}

function toReportText(value: string): string {
  return value
    .replace(/\bBasic Alpha Report\b/gi, 'informe de propuesta')
    .replace(/\bStructured Brief\b/gi, 'información recogida')
    .replace(/\bOpen Gaps\b/gi, 'aspectos pendientes')
    .replace(/\bInternal Sources\b/gi, 'material de apoyo')
    .replace(/\bmedical-device triage\b/gi, 'revisión sanitaria')
    .replace(/\bmedical device triage\b/gi, 'revisión sanitaria')
    .replace(/\bdata\s*\/\s*ai\s*\/\s*privacy\b/gi, 'datos, IA y privacidad')
    .replace(/\bdata_ai_privacy\b/gi, 'datos, IA y privacidad')
    .replace(/\bresources_pilot_viability\b/gi, 'piloto y recursos')
    .replace(/\bsource\b/gi, 'material')
    .replace(/\bschema\b/gi, 'formato')
    .replace(/\bworkflow\b/gi, 'proceso')
    .replace(/\bpayload\b/gi, 'contenido')
    .replace(/\bJSON\b/g, 'contenido');
}

function ensureSpace(doc: PDFKit.PDFDocument, requiredHeight: number): void {
  const bottom = doc.page.height - doc.page.margins.bottom;

  if (doc.y + requiredHeight > bottom) {
    doc.addPage();
  }
}
