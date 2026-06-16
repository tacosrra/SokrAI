import { randomUUID } from 'node:crypto';

import { assertBasicAlphaReport } from '../contracts/schema-registry';
import type { GeneratedSection, SectionKind } from '../contracts/types';
import type { AlphaStore } from '../repositories/alpha-store';
import { assertNoRawModelFields } from '../domain/basic-report';
import { AppError } from '../utils/errors';
import { sha256, sha256Buffer } from '../utils/hash';
import type { Logger } from '../utils/logger';
import type { BasicReportService } from './basic-report-service';
import {
  BASIC_REPORT_PDF_TEMPLATE_VERSION,
  buildBasicReportPdfModel,
  renderBasicReportPdf,
  type BasicReportPdfModel,
} from './pdf-report-template';

export interface BasicReportPdfExport {
  exportId: string;
  templateVersion: typeof BASIC_REPORT_PDF_TEMPLATE_VERSION;
  fileName: string;
  contentType: 'application/pdf';
  pdf: Buffer;
  metadata: {
    export_id: string;
    template_version: typeof BASIC_REPORT_PDF_TEMPLATE_VERSION;
    report_id: string;
    proposal_id: string;
    proposal_title: string;
    report_schema_version: string;
    report_generated_at: string;
    exported_at: string;
    report_payload_sha256: string;
    pdf_sha256: string;
    section_count: number;
    open_gap_count: number;
    source_count: number;
    warning_count: number;
  };
}

export interface BasicReportPdfExportCommand {
  sessionId: string;
  requestId: string;
}

const SECTION_ORDER: SectionKind[] = [
  'problem',
  'solution',
  'data_ai_privacy',
  'medical_device_triage',
  'resources_pilot_viability',
];

export class PdfExportService {
  constructor(
    private readonly logger: Logger,
    private readonly alphaStore: AlphaStore,
    private readonly basicReportService: BasicReportService,
  ) {}

  async exportForSession(command: BasicReportPdfExportCommand): Promise<BasicReportPdfExport> {
    const report = assertBasicAlphaReport(await this.basicReportService.getForSession(command.sessionId));
    const aggregate = await this.alphaStore.getAlphaProposalAggregate(report.proposal_id);
    const generatedSections = collectCurrentGeneratedSections(aggregate.generated_sections);
    const exportId = randomUUID();
    const exportedAt = new Date().toISOString();
    const payloadModel = buildBasicReportPdfModel(report, generatedSections, {
      exportId,
      exportedAt,
      reportPayloadSha256: null,
    });
    // Hash only the stable report payload. Per-export metadata and the hash
    // itself belong in the rendered model, not in the report snapshot identity.
    const reportPayloadSha256 = sha256(JSON.stringify(toReportPayloadHashInput(payloadModel)));
    const renderModel = withReportPayloadHash(payloadModel, reportPayloadSha256);
    const pdf = await renderPdf(renderModel, {
      logger: this.logger,
      requestId: command.requestId,
      sessionId: command.sessionId,
      reportId: report.report_id,
    });
    const pdfSha256 = sha256Buffer(pdf);
    const metadata: BasicReportPdfExport['metadata'] = {
      export_id: exportId,
      template_version: BASIC_REPORT_PDF_TEMPLATE_VERSION,
      report_id: report.report_id,
      proposal_id: report.proposal_id,
      proposal_title: report.structured_brief.project_title,
      report_schema_version: report.schema_version,
      report_generated_at: report.generated_at,
      exported_at: exportedAt,
      report_payload_sha256: reportPayloadSha256,
      pdf_sha256: pdfSha256,
      section_count: renderModel.metadata.section_count,
      open_gap_count: renderModel.metadata.open_gap_count,
      source_count: renderModel.metadata.source_count,
      warning_count: renderModel.metadata.warning_count,
    };

    assertNoRawModelFields(metadata);

    await this.alphaStore.appendAuditEvent(this.alphaStore.getDatabase(), {
      proposalId: report.proposal_id,
      sessionId: command.sessionId,
      eventType: 'basic_report_pdf_exported',
      actorType: 'system',
      requestId: command.requestId,
      payloadJson: metadata,
    });

    this.logger.info('basic_report_pdf_exported', {
      request_id: command.requestId,
      session_id: command.sessionId,
      proposal_id: report.proposal_id,
      report_id: report.report_id,
      export_id: exportId,
      template_version: BASIC_REPORT_PDF_TEMPLATE_VERSION,
      report_payload_sha256: reportPayloadSha256,
      pdf_sha256: pdfSha256,
      section_count: metadata.section_count,
      open_gap_count: metadata.open_gap_count,
      source_count: metadata.source_count,
      warning_count: metadata.warning_count,
    });

    return {
      exportId,
      templateVersion: BASIC_REPORT_PDF_TEMPLATE_VERSION,
      fileName: buildReportPdfFileName(report.structured_brief.project_title),
      contentType: 'application/pdf',
      pdf,
      metadata,
    };
  }
}

function collectCurrentGeneratedSections(sections: GeneratedSection[]): GeneratedSection[] {
  const currentByKind = new Map<SectionKind, GeneratedSection>();

  for (const section of sections) {
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
    return section ? [section] : [];
  });
}

function withReportPayloadHash(
  model: BasicReportPdfModel,
  reportPayloadSha256: string,
): BasicReportPdfModel {
  return {
    ...model,
    metadata: {
      ...model.metadata,
      report_payload_sha256: reportPayloadSha256,
    },
  };
}

function toReportPayloadHashInput(model: BasicReportPdfModel) {
  return {
    template_version: model.template_version,
    report_id: model.report_id,
    proposal_id: model.proposal_id,
    proposal_title: model.proposal_title,
    report_schema_version: model.report_schema_version,
    report_status: model.report_status,
    report_generated_at: model.report_generated_at,
    structured_brief: model.structured_brief,
    sections: model.sections,
    open_gaps: model.open_gaps,
    internal_sources: model.internal_sources,
    audit_refs: model.audit_refs,
    warnings: model.warnings,
  };
}

async function renderPdf(
  model: BasicReportPdfModel,
  context: {
    logger: Logger;
    requestId: string;
    sessionId: string;
    reportId: string;
  },
): Promise<Buffer> {
  try {
    return await renderBasicReportPdf(model);
  } catch (error) {
    const cause = error instanceof Error ? error.message : 'unknown';

    context.logger.error('basic_report_pdf_export_failed', {
      request_id: context.requestId,
      session_id: context.sessionId,
      proposal_id: model.proposal_id,
      report_id: context.reportId,
      template_version: model.template_version,
      export_id: model.export_id,
      cause,
    });

    throw new AppError(
      500,
      'pdf_export_failed',
      'The Basic Alpha report PDF could not be generated',
      true,
      model.proposal_id,
      { cause },
    );
  }
}

function buildReportPdfFileName(projectTitle: string): string {
  const safeTitle = projectTitle
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 80) || 'informe-propuesta';

  return `sokrai-informe-${safeTitle}.pdf`;
}
