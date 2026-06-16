import type {
  AlphaGap,
  AlphaModule,
  BasicAlphaReport,
  GapStatus,
  GeneratedSection,
  SectionKind,
} from '../domain/contracts';
import { toUserFacingText } from './user-facing-text';

type ReportItemStatus = 'complete' | 'review' | 'pending' | 'not_applicable';

export interface ReportGapGroup {
  status: GapStatus;
  gaps: AlphaGap[];
}

export interface ReportSectionSummary {
  id: SectionKind | 'report';
  label: string;
  status: ReportItemStatus;
  statusLabel: string;
  description: string;
  section: GeneratedSection | null;
  openGapsCount: number;
  resolvedGapsCount: number;
}

export interface ReviewChecklistItem {
  id: string;
  label: string;
  description: string;
  status: ReportItemStatus;
  statusLabel: string;
}

export interface BasicReportPresentation {
  generatedAt: string;
  reportStatusLabel: string;
  sourceCount: number;
  activeGapCount: number;
  resolvedGapCount: number;
  totalGapCount: number;
  openGaps: AlphaGap[];
  gapGroups: ReportGapGroup[];
  sectionSummaries: ReportSectionSummary[];
  availableSections: GeneratedSection[];
  reviewChecklist: ReviewChecklistItem[];
  nextActions: string[];
  warnings: string[];
  executiveSummary: {
    title: string;
    context: string;
    problem: string;
    solution: string;
    reviewerFocus: string;
  };
}

const ACTIVE_GAP_STATUSES = new Set<GapStatus>(['open', 'in_progress', 'deferred']);
const COMPLETE_GAP_STATUSES = new Set<GapStatus>(['resolved', 'not_applicable']);
const GAP_STATUS_ORDER: GapStatus[] = ['open', 'in_progress', 'deferred', 'resolved', 'not_applicable'];
const SECTION_ORDER: SectionKind[] = [
  'problem',
  'solution',
  'data_ai_privacy',
  'medical_device_triage',
  'resources_pilot_viability',
];

export const MODULE_LABELS: Record<AlphaModule, string> = {
  problem: 'Problema',
  solution: 'Solución',
  data_ai_privacy: 'Datos y privacidad',
  medical_device_triage: 'Revisión sanitaria',
  resources_pilot_viability: 'Piloto y recursos',
};

export const SECTION_LABELS: Record<SectionKind, string> = {
  problem: 'Problema',
  solution: 'Solución',
  data_ai_privacy: 'Datos, IA y privacidad',
  medical_device_triage: 'Revisión sanitaria y regulatoria',
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
  data_sources: 'Fuentes de datos',
  ai_role: 'Papel de la IA',
  privacy_controls: 'Controles de privacidad',
  human_review: 'Revisión humana',
  intended_use: 'Uso previsto',
  clinical_role: 'Papel clínico u operativo',
  pilot_environment: 'Entorno piloto',
  success_metrics: 'Indicadores del piloto',
  resources: 'Recursos necesarios',
};

function activeGapsFor(gaps: AlphaGap[], module: AlphaModule): AlphaGap[] {
  return gaps.filter((gap) => gap.module === module && ACTIVE_GAP_STATUSES.has(gap.gap_status));
}

function resolvedGapsFor(gaps: AlphaGap[], module: AlphaModule): AlphaGap[] {
  return gaps.filter((gap) => gap.module === module && COMPLETE_GAP_STATUSES.has(gap.gap_status));
}

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

function formatReportDate(value: string): string {
  return new Date(value).toLocaleString('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function getLatestSections(
  report: BasicAlphaReport,
  generatedSections: GeneratedSection[],
): GeneratedSection[] {
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
    return section ? [section] : [];
  });
}

function sectionStatusLabel(status: ReportItemStatus): string {
  switch (status) {
    case 'complete':
      return 'Recogida';
    case 'review':
      return 'Requiere revisión';
    case 'pending':
      return 'Pendiente';
    case 'not_applicable':
      return 'No aplica';
  }
}

function deriveSectionStatus(params: {
  section: GeneratedSection | null;
  module: AlphaModule;
  gaps: AlphaGap[];
}): ReportItemStatus {
  const moduleOpenGaps = activeGapsFor(params.gaps, params.module);

  if (params.section?.section_status === 'needs_revision' || moduleOpenGaps.length > 0) {
    return 'review';
  }

  if (
    params.gaps.some((gap) =>
      gap.module === params.module &&
      gap.gap_status === 'not_applicable',
    ) &&
    !params.section
  ) {
    return 'not_applicable';
  }

  if (params.section?.section_status === 'generated' || params.section?.section_status === 'accepted') {
    return 'complete';
  }

  return 'pending';
}

function describeSection(status: ReportItemStatus, sectionKind: SectionKind): string {
  if (status === 'complete') {
    return 'Hay material redactado para revisión humana.';
  }

  if (status === 'review') {
      return 'Hay información recogida, pero quedan puntos que conviene validar.';
  }

  if (status === 'not_applicable') {
      return 'La información disponible indica que esta parte no aplica ahora. Debe revisarse si cambia el alcance.';
  }

  if (sectionKind === 'data_ai_privacy') {
    return 'Aún no hay una sección completa de datos, IA y privacidad en este informe.';
  }

  if (sectionKind === 'medical_device_triage') {
    return 'Aún no hay una sección completa de revisión sanitaria en este informe.';
  }

  if (sectionKind === 'resources_pilot_viability') {
    return 'Aún no hay una sección completa de piloto y recursos en este informe.';
  }

  return 'Esta parte necesita completarse antes de compartir una versión final.';
}

function statusFromBoolean(isComplete: boolean): ReportItemStatus {
  return isComplete ? 'complete' : 'pending';
}

function statusWithGaps(isComplete: boolean, gaps: AlphaGap[]): ReportItemStatus {
  if (gaps.length > 0) {
    return 'review';
  }

  return statusFromBoolean(isComplete);
}

function createChecklist(report: BasicAlphaReport, sections: GeneratedSection[]): ReviewChecklistItem[] {
  const brief = report.structured_brief;
  const activeGaps = report.current_gaps.filter((gap) => ACTIVE_GAP_STATUSES.has(gap.gap_status));
  const sectionsByKind = new Map(sections.map((section) => [section.section_kind, section]));

  const items: ReviewChecklistItem[] = [
    {
      id: 'problem',
      label: 'El problema está claro',
      description: 'Incluye problema, evidencia, alcance y alternativas actuales.',
      status: statusWithGaps(
        hasText(brief.problem_statement) &&
          hasText(brief.evidence_of_problem) &&
          hasText(brief.scope) &&
          hasText(brief.current_alternatives),
        activeGapsFor(report.current_gaps, 'problem'),
      ),
      statusLabel: '',
    },
    {
      id: 'target-user',
      label: 'El usuario afectado está definido',
      description: 'La propuesta identifica quién usa o sufre el proceso actual.',
      status: statusWithGaps(hasText(brief.target_user), activeGaps.filter((gap) => gap.field === 'target_user')),
      statusLabel: '',
    },
    {
      id: 'solution',
      label: 'La solución propuesta está descrita',
      description: 'Hay una sección de solución preparada para revisar.',
      status: statusWithGaps(Boolean(sectionsByKind.get('solution')), activeGapsFor(report.current_gaps, 'solution')),
      statusLabel: '',
    },
    {
      id: 'data-privacy',
      label: 'Datos y privacidad se han considerado',
      description: 'Debe quedar claro qué datos se tratan, con qué controles y qué revisión humana existe.',
      status: statusWithGaps(
        Boolean(sectionsByKind.get('data_ai_privacy')),
        activeGapsFor(report.current_gaps, 'data_ai_privacy'),
      ),
      statusLabel: '',
    },
    {
      id: 'medical-review',
      label: 'Los aspectos sanitarios quedan acotados',
      description: 'No es una decisión regulatoria. Solo prepara material para revisar.',
      status: (() => {
        const medicalGaps = report.current_gaps.filter((gap) => gap.module === 'medical_device_triage');

        if (medicalGaps.some((gap) => gap.gap_status === 'not_applicable')) {
          return 'not_applicable' as const;
        }

        return statusWithGaps(Boolean(sectionsByKind.get('medical_device_triage')), activeGapsFor(report.current_gaps, 'medical_device_triage'));
      })(),
      statusLabel: '',
    },
    {
      id: 'pilot',
      label: 'Piloto, recursos e indicadores están tratados',
      description: 'El informe debería orientar qué hace falta para una revisión interna.',
      status: statusWithGaps(
        Boolean(sectionsByKind.get('resources_pilot_viability')),
        activeGapsFor(report.current_gaps, 'resources_pilot_viability'),
      ),
      statusLabel: '',
    },
    {
      id: 'human-review',
      label: 'Revisión humana requerida',
      description: 'El informe no sustituye decisiones clínicas, legales ni regulatorias.',
      status: 'review',
      statusLabel: '',
    },
  ];

  return items.map((item) => ({
    ...item,
    statusLabel: sectionStatusLabel(item.status),
  }));
}

function deriveReviewerFocus(report: BasicAlphaReport, openGaps: AlphaGap[]): string {
  if (openGaps.length === 0) {
    return 'Revisar que el alcance, los datos, la privacidad y los límites de uso son correctos antes de compartir o pilotar la propuesta.';
  }

  const modules = Array.from(new Set(openGaps.map((gap) => MODULE_LABELS[gap.module])));
  return `Priorizar la información pendiente en ${modules.join(', ')} antes de usar este material en una decisión.`;
}

function createNextActions(report: BasicAlphaReport, openGaps: AlphaGap[]): string[] {
  if (openGaps.length > 0) {
    return [
      'Completar la información pendiente antes de compartir el informe como versión final.',
      'Validar los puntos abiertos con la persona responsable del área.',
      'Revisar privacidad, datos y límites sanitarios si la propuesta cambia de alcance.',
    ];
  }

  return report.report_status === 'ready'
    ? [
        'Revisar el informe con la persona responsable antes de usarlo en un comité interno.',
        'Confirmar que no contiene datos reales de pacientes.',
        'Descargar el PDF si se necesita compartir material de revisión.',
      ]
    : [
        'Revisar las secciones marcadas antes de exportar.',
        'Confirmar que los avisos de seguridad son visibles para quien revise la propuesta.',
      ];
}

export function formatGapStatus(value: GapStatus): string {
  switch (value) {
    case 'open':
      return 'Pendiente';
    case 'in_progress':
      return 'En preparación';
    case 'resolved':
      return 'Respondido';
    case 'deferred':
      return 'A revisar más adelante';
    case 'not_applicable':
      return 'No aplica';
  }
}

export function formatGapKind(value: string): string {
  switch (value) {
    case 'missing_information':
      return 'Falta información';
    case 'ambiguous_information':
      return 'Conviene precisar';
    case 'unsupported_claim':
      return 'Necesita evidencia';
    case 'needs_user_confirmation':
      return 'Pendiente de confirmar';
    default:
      return 'Punto de revisión';
  }
}

export function formatFieldLabel(value: string): string {
  return FIELD_LABELS[value] ?? value.replaceAll('_', ' ');
}

export function formatSourceKind(value: string): string {
  switch (value) {
    case 'pasted_text':
      return 'Texto inicial';
    case 'uploaded_file':
      return 'Documento aportado';
    case 'extracted_text':
      return 'Texto extraído';
    case 'user_answer':
      return 'Respuesta guiada';
    case 'generated_section':
      return 'Sección preparada';
    default:
      return 'Material de apoyo';
  }
}

export function formatSectionStatus(value: string): string {
  switch (value) {
    case 'draft':
      return 'Borrador';
    case 'generated':
      return 'Preparada';
    case 'accepted':
      return 'Lista para revisar';
    case 'needs revision':
    case 'needs_revision':
      return 'Necesita revisión';
    default:
      return toUserFacingText(value);
  }
}

export function formatReportWarning(value: string): string {
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

  return toUserFacingText(value);
}

export function deriveReportPresentation(
  report: BasicAlphaReport,
  generatedSections: GeneratedSection[] = [],
): BasicReportPresentation {
  const openGaps = report.current_gaps.filter((gap) => ACTIVE_GAP_STATUSES.has(gap.gap_status));
  const resolvedGapCount = report.current_gaps.filter((gap) => COMPLETE_GAP_STATUSES.has(gap.gap_status)).length;
  const gapGroups = GAP_STATUS_ORDER
    .map((status) => ({
      status,
      gaps: report.current_gaps.filter((gap) => gap.gap_status === status),
    }))
    .filter((group) => group.gaps.length > 0);
  const availableSections = getLatestSections(report, generatedSections);
  const sectionsByKind = new Map(availableSections.map((section) => [section.section_kind, section]));

  const sectionSummaries: ReportSectionSummary[] = [
    ...SECTION_ORDER.map((sectionKind) => {
      const module = sectionKind as AlphaModule;
      const section = sectionsByKind.get(sectionKind) ?? null;
      const status = deriveSectionStatus({
        section,
        module,
        gaps: report.current_gaps,
      });

      return {
        id: sectionKind,
        label: SECTION_LABELS[sectionKind],
        status,
        statusLabel: sectionStatusLabel(status),
        description: describeSection(status, sectionKind),
        section,
        openGapsCount: activeGapsFor(report.current_gaps, module).length,
        resolvedGapsCount: resolvedGapsFor(report.current_gaps, module).length,
      };
    }),
    {
      id: 'report',
      label: 'Informe',
      status: report.report_status === 'ready' ? 'complete' : 'review',
      statusLabel: report.report_status === 'ready' ? 'Listo para revisar' : 'Pendiente de validar',
      description:
        report.report_status === 'ready'
      ? 'El informe puede descargarse para revisión humana.'
          : 'El informe está preparado, pero conserva aspectos pendientes.',
      section: null,
      openGapsCount: openGaps.length,
      resolvedGapsCount: resolvedGapCount,
    },
  ];

  return {
    generatedAt: formatReportDate(report.generated_at),
    reportStatusLabel: report.report_status === 'ready' ? 'Listo para revisar' : 'Pendiente de validar',
    sourceCount: report.internal_sources.length,
    activeGapCount: openGaps.length,
    resolvedGapCount,
    totalGapCount: report.current_gaps.length,
    openGaps,
    gapGroups,
    sectionSummaries,
    availableSections,
    reviewChecklist: createChecklist(report, availableSections),
    nextActions: createNextActions(report, openGaps),
    warnings: report.warnings.map(formatReportWarning),
    executiveSummary: {
      title: report.structured_brief.project_title,
      context: toUserFacingText(report.structured_brief.goal),
      problem: toUserFacingText(report.structured_brief.problem_statement),
      solution: toUserFacingText(report.solution_section.content_markdown),
      reviewerFocus: deriveReviewerFocus(report, openGaps),
    },
  };
}
