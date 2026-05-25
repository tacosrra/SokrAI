import type {
  AlphaGap,
  AuditRef,
  BasicAlphaReport,
  GeneratedSection,
  ProposalSource,
  ReportStatus,
  StructuredBrief,
} from '../contracts/types';

export const BASIC_ALPHA_REPORT_SCHEMA_VERSION = 'basic-alpha-report.v1';

export const BASIC_ALPHA_REPORT_WARNINGS = [
  'This Alpha report is not a dictamen and must not be used as one.',
  'This Alpha report does not approve, reject, rank, or prioritize the proposal.',
  'This Alpha report is not a legal, clinical, or regulatory decision.',
];

const ACTIVE_GAP_STATUSES = new Set(['open', 'in_progress', 'deferred']);
const RAW_OR_MODEL_KEYS = [
  'raw_model_output',
  'validated_output_json',
  'prompt_name',
  'prompt_version',
  'prompt_sha256',
  'model_params_json',
];

function isInternalSource(source: ProposalSource): boolean {
  return source.source_kind === 'pasted_text' ||
    source.source_kind === 'uploaded_file' ||
    source.source_kind === 'extracted_text' ||
    source.source_kind === 'user_answer';
}

export function determineBasicReportStatus(gaps: AlphaGap[]): ReportStatus {
  return gaps.some((gap) => ACTIVE_GAP_STATUSES.has(gap.gap_status))
    ? 'needs_revision'
    : 'ready';
}

export function collectBasicReportSources(params: {
  proposalSources: ProposalSource[];
  problemSection: GeneratedSection;
  solutionSection: GeneratedSection;
}): ProposalSource[] {
  const sourcesById = new Map<string, ProposalSource>();

  for (const source of [
    ...params.proposalSources,
    ...params.problemSection.source_refs,
    ...params.solutionSection.source_refs,
  ]) {
    if (isInternalSource(source)) {
      sourcesById.set(source.source_id, source);
    }
  }

  return Array.from(sourcesById.values());
}

export function buildBasicReportAuditRefs(params: {
  problemSection: GeneratedSection;
  solutionSection: GeneratedSection;
  auditEventIds: string[];
}): AuditRef[] {
  const refsByKey = new Map<string, AuditRef>();

  for (const section of [params.problemSection, params.solutionSection]) {
    if (section.generated_by_run_id) {
      const ref: AuditRef = { kind: 'agent_run', id: section.generated_by_run_id };
      refsByKey.set(`${ref.kind}:${ref.id}`, ref);
    }
  }

  for (const id of params.auditEventIds) {
    const ref: AuditRef = { kind: 'audit_event', id };
    refsByKey.set(`${ref.kind}:${ref.id}`, ref);
  }

  return Array.from(refsByKey.values());
}

export function composeBasicAlphaReport(params: {
  reportId: string;
  proposalId: string;
  structuredBrief: StructuredBrief;
  currentGaps: AlphaGap[];
  problemSection: GeneratedSection;
  solutionSection: GeneratedSection;
  internalSources: ProposalSource[];
  auditRefs: AuditRef[];
  generatedAt: string;
}): BasicAlphaReport {
  return {
    report_id: params.reportId,
    proposal_id: params.proposalId,
    report_status: determineBasicReportStatus(params.currentGaps),
    schema_version: BASIC_ALPHA_REPORT_SCHEMA_VERSION,
    structured_brief: params.structuredBrief,
    current_gaps: params.currentGaps,
    problem_section: params.problemSection,
    solution_section: params.solutionSection,
    internal_sources: params.internalSources,
    audit_refs: params.auditRefs,
    warnings: [...BASIC_ALPHA_REPORT_WARNINGS],
    generated_at: params.generatedAt,
  };
}

export function assertNoRawModelFields(value: unknown): void {
  const serialized = JSON.stringify(value);

  for (const key of RAW_OR_MODEL_KEYS) {
    if (serialized.includes(key)) {
      throw new Error(`Basic Alpha report contains disallowed raw/model field: ${key}`);
    }
  }
}
