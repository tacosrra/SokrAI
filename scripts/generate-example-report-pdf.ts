import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AlphaGap, BasicAlphaReport, GeneratedSection, ProposalSource } from '../apps/api/src/contracts/types';
import { BASIC_ALPHA_REPORT_WARNINGS } from '../apps/api/src/domain/basic-report';
import { buildBasicReportPdfModel, renderBasicReportPdf } from '../apps/api/src/services/pdf-report-template';

const generatedAt = '2026-06-18T10:30:00.000Z';
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = resolve(repoRoot, 'examples/sokrai-informe-triage-ia-urgencias-ejemplo.pdf');

const source: ProposalSource = {
  source_id: 'source-initial-proposal',
  source_kind: 'pasted_text',
  label: 'Texto inicial de la propuesta y respuestas de aclaración',
  document_id: 'document-intake',
  created_at: '2026-06-18T09:00:00.000Z',
};

const report: BasicAlphaReport = {
  report_id: 'report-example-triage',
  proposal_id: 'proposal-example-triage',
  report_status: 'needs_revision',
  schema_version: 'basic-alpha-report.v1',
  structured_brief: {
    project_title: 'Triage IA en Urgencias',
    goal: 'Madurar una propuesta de apoyo al triaje antes de evaluarla en comité interno.',
    target_user: 'Enfermería de admisión y coordinación de urgencias',
    problem_owner: 'Coordinación operativa de urgencias',
    problem_statement: 'El triaje inicial se retrasa durante horas punta y genera variabilidad en la priorización.',
    evidence_of_problem: 'Registros internos indican esperas de 20 a 35 minutos, quejas recurrentes y diferencias entre turnos.',
    current_alternatives: 'Protocolo manual, notas de admisión y coordinación verbal entre profesionales.',
    scope: 'Piloto local en admisión adulta de urgencias, sin diagnóstico automatizado ni decisión clínica autónoma.',
    constraints_known: [
      'Datos sensibles de salud',
      'Revisión humana obligatoria',
      'Uso local de demostración',
    ],
    assumptions: [
      'El equipo puede trabajar inicialmente con datos anonimizados o sintéticos.',
      'La solución se limita a ordenar información y sugerir preguntas de apoyo.',
      'El protocolo actual puede convertirse en campos mínimos revisables.',
    ],
    ambiguities: [
      'Aún falta confirmar la métrica basal que se usará para comparar el piloto.',
      'La integración con sistemas clínicos queda fuera de esta versión.',
    ],
    missing_information: [],
  },
  current_gaps: [
    createGap({
      gapId: 'gap-baseline-metric',
      module: 'resources_pilot_viability',
      field: 'pilot_environment',
      description: 'Confirmar la métrica basal del piloto y el periodo de comparación antes/después.',
      questionHint: '¿Qué indicador y ventana temporal usará el equipo para medir mejora?',
      status: 'open',
    }),
    createGap({
      gapId: 'gap-privacy-controls',
      module: 'data_ai_privacy',
      field: 'privacy_controls',
      description: 'Validar controles de privacidad antes de probar con datos reales o pseudonimizados.',
      questionHint: '¿Qué responsable revisará el tratamiento de datos antes del piloto?',
      status: 'in_progress',
    }),
  ],
  problem_section: createSection({
    sectionKind: 'problem',
    title: 'Definición del problema',
    content: [
      'El problema principal es operativo: en horas punta, la admisión y clasificación inicial no siempre recibe información completa con la misma rapidez ni con el mismo criterio entre turnos.',
      'La consecuencia es una espera inicial mayor, más coordinación manual y menor consistencia en la preparación del caso para revisión sanitaria.',
      'El alcance se limita a ordenar información de entrada y apoyar al personal; no se propone diagnóstico automatizado ni sustitución de criterio clínico.',
    ],
  }),
  solution_section: createSection({
    sectionKind: 'solution',
    title: 'Definición de solución',
    content: [
      'La solución propuesta es un asistente local que estructura la información inicial, detecta campos incompletos y sugiere preguntas de seguimiento para el personal de admisión.',
      'El asistente debe funcionar como apoyo operativo y dejar trazabilidad de la información usada. Las recomendaciones requieren siempre revisión humana.',
      'La primera versión debería probarse con datos sintéticos o anonimizados, sin integración directa con historia clínica.',
    ],
  }),
  internal_sources: [source],
  audit_refs: [
    { kind: 'agent_run', id: 'run-problem-example' },
    { kind: 'agent_run', id: 'run-solution-example' },
  ],
  warnings: BASIC_ALPHA_REPORT_WARNINGS,
  generated_at: generatedAt,
};

const generatedSections: GeneratedSection[] = [
  createSection({
    sectionKind: 'data_ai_privacy',
    title: 'Datos, IA y privacidad',
    content: [
      'La propuesta puede evaluarse inicialmente sin datos reales de pacientes. Para cualquier piloto con datos sensibles será necesario definir base legal, minimización, controles de acceso y registros de uso.',
      'La IA no debe tomar decisiones clínicas. El sistema solo puede ayudar a ordenar información y a recordar preguntas de protocolo.',
      'Cualquier salida del asistente debe ser revisable por el profesional responsable.',
    ],
  }),
  createSection({
    sectionKind: 'medical_device_triage',
    title: 'Revisión sanitaria y regulatoria',
    content: [
      'Con el alcance descrito, la propuesta debe mantenerse como apoyo administrativo/operativo en v1. Si el sistema empieza a recomendar prioridad clínica, cambia el perfil de riesgo y requiere revisión regulatoria específica.',
      'La versión piloto debe documentar límites de uso, supervisión humana y criterios de escalado.',
    ],
  }),
  createSection({
    sectionKind: 'resources_pilot_viability',
    title: 'Piloto y recursos',
    content: [
      'El piloto recomendado es pequeño y controlado: un flujo de admisión, un periodo acotado, datos sintéticos o anonimizados y revisión diaria de resultados.',
      'Los recursos mínimos son una persona responsable del área, personal de admisión participante, soporte técnico local y una métrica de comparación antes/después.',
    ],
  }),
];

void main();

async function main(): Promise<void> {
  const model = buildBasicReportPdfModel(report, generatedSections, {
    exportId: 'export-example-triage',
    exportedAt: '2026-06-18T10:35:00.000Z',
    reportPayloadSha256: null,
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, await renderBasicReportPdf(model));

  console.log(outputPath);
}

function createGap(params: {
  gapId: string;
  module: AlphaGap['module'];
  field: string;
  description: string;
  questionHint: string;
  status: Extract<AlphaGap['gap_status'], 'open' | 'in_progress'>;
}): AlphaGap {
  return {
    gap_id: params.gapId,
    proposal_id: 'proposal-example-triage',
    module: params.module,
    gap_kind: 'needs_user_confirmation',
    gap_status: params.status,
    origin: 'system_rule',
    field: params.field,
    description: params.description,
    absence: {
      is_absent: false,
      checked_fields: [params.field],
      reason: 'La conversación aportó información inicial, pero requiere confirmación del responsable.',
    },
    question_hint: params.questionHint,
    source_refs: [source],
    audit_refs: [{ kind: 'chat_turn', id: `turn-${params.gapId}` }],
    warnings: [],
    created_at: generatedAt,
    updated_at: generatedAt,
  };
}

function createSection(params: {
  sectionKind: GeneratedSection['section_kind'];
  title: string;
  content: string[];
}): GeneratedSection {
  return {
    section_id: `section-${params.sectionKind}-example`,
    proposal_id: 'proposal-example-triage',
    section_kind: params.sectionKind,
    section_status: 'generated',
    section_version: 1,
    title: params.title,
    content_markdown: params.content.join('\n\n'),
    source_refs: [source],
    gap_refs: reportGapRefs(params.sectionKind),
    generated_by_run_id: `run-${params.sectionKind}-example`,
    warnings: [],
    created_at: generatedAt,
  };
}

function reportGapRefs(sectionKind: GeneratedSection['section_kind']): string[] {
  if (sectionKind === 'data_ai_privacy') return ['gap-privacy-controls'];
  if (sectionKind === 'resources_pilot_viability') return ['gap-baseline-metric'];
  return [];
}
