import type { AlphaGap, BasicAlphaReport, GapStatus } from '../domain/contracts';

export interface ReportGapGroup {
  status: GapStatus;
  gaps: AlphaGap[];
}

export interface ReportSectionMeta {
  title: string;
  version: number;
  status: string;
  sourceCount: number;
  gapCount: number;
}

export interface BasicReportPresentation {
  reportId: string;
  status: string;
  schemaVersion: string;
  generatedAt: string;
  sourceCount: number;
  auditRefCount: number;
  openGaps: AlphaGap[];
  gapGroups: ReportGapGroup[];
  warnings: string[];
  problemSection: ReportSectionMeta;
  solutionSection: ReportSectionMeta;
}

const GAP_STATUS_ORDER: GapStatus[] = ['open', 'in_progress', 'resolved', 'deferred', 'not_applicable'];

function formatReportDate(value: string): string {
  return new Date(value).toLocaleString('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function deriveReportPresentation(report: BasicAlphaReport): BasicReportPresentation {
  const openGaps = report.current_gaps.filter((gap) =>
    gap.gap_status === 'open' || gap.gap_status === 'in_progress' || gap.gap_status === 'deferred',
  );
  const gapGroups = GAP_STATUS_ORDER
    .map((status) => ({
      status,
      gaps: report.current_gaps.filter((gap) => gap.gap_status === status),
    }))
    .filter((group) => group.gaps.length > 0);

  return {
    reportId: report.report_id,
    status: report.report_status.replaceAll('_', ' '),
    schemaVersion: report.schema_version,
    generatedAt: formatReportDate(report.generated_at),
    sourceCount: report.internal_sources.length,
    auditRefCount: report.audit_refs.length,
    openGaps,
    gapGroups,
    warnings: report.warnings,
    problemSection: {
      title: report.problem_section.title,
      version: report.problem_section.section_version,
      status: report.problem_section.section_status.replaceAll('_', ' '),
      sourceCount: report.problem_section.source_refs.length,
      gapCount: report.problem_section.gap_refs.length,
    },
    solutionSection: {
      title: report.solution_section.title,
      version: report.solution_section.section_version,
      status: report.solution_section.section_status.replaceAll('_', ' '),
      sourceCount: report.solution_section.source_refs.length,
      gapCount: report.solution_section.gap_refs.length,
    },
  };
}
