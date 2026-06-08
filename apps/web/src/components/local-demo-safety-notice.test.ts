// @vitest-environment jsdom

import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App';
import type { AgentRun, BasicAlphaReport, ModuleChat, SessionAuditView } from '../domain/contracts';
import { deriveSessionPresentation } from '../lib/session-view';
import { BasicAlphaReportPanel } from './BasicAlphaReportPanel';
import { LocalDemoSafetyNotice } from './LocalDemoSafetyNotice';
import { SessionStatePanel } from './SessionStatePanel';
import { SessionWorkspace } from './SessionWorkspace';

afterEach(() => {
  cleanup();
});

const createdAt = '2026-06-05T10:00:00.000Z';

const report: BasicAlphaReport = {
  report_id: 'report-1',
  proposal_id: 'session-1',
  report_status: 'ready',
  schema_version: 'basic-alpha-report.v1',
  structured_brief: {
    project_title: 'Demo Clinic ficticia',
    goal: 'Madurar una propuesta local con datos ficticios.',
    target_user: 'Equipo de admision',
    problem_owner: 'Coordinacion de urgencias',
    problem_statement: 'La admision se retrasa en horas punta simuladas.',
    evidence_of_problem: 'Datos ficticios indican esperas de 27 minutos.',
    current_alternatives: 'Hoja manual y llamadas internas.',
    scope: 'Urgencias de adultos simulada.',
    constraints_known: ['Demo local solamente.'],
    assumptions: ['El personal revisa toda salida.'],
    ambiguities: [],
    missing_information: [],
  },
  current_gaps: [],
  problem_section: {
    section_id: 'section-problem',
    proposal_id: 'session-1',
    section_kind: 'problem',
    section_status: 'generated',
    section_version: 1,
    title: 'Problem definition',
    content_markdown: 'Problema ficticio definido para revision humana.',
    source_refs: [],
    gap_refs: [],
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
    content_markdown: 'Solucion ficticia definida para revision humana.',
    source_refs: [],
    gap_refs: [],
    generated_by_run_id: 'run-solution',
    warnings: [],
    created_at: createdAt,
  },
  internal_sources: [
    {
      source_id: 'source-1',
      source_kind: 'pasted_text',
      label: 'Texto ficticio pegado',
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

const workspaceAudit: SessionAuditView = {
  session: {
    id: 'session-1',
    project_title: 'Demo Clinic ficticia',
    goal: 'Madurar una propuesta local con datos ficticios.',
    current_stage: 'solution_definition',
    current_agent: 'problem_definition_agent',
    status: 'completed',
    current_turn_seq: 2,
    state_version: 4,
    latest_structured_brief_json: report.structured_brief,
    latest_problem_definition_json: {
      problem_owner: report.structured_brief.problem_owner,
      problem_statement: report.structured_brief.problem_statement,
      evidence_of_problem: report.structured_brief.evidence_of_problem,
      scope: report.structured_brief.scope,
      current_alternatives: report.structured_brief.current_alternatives,
      assumptions: report.structured_brief.assumptions,
      ambiguities_remaining: [],
    },
    latest_snapshot_id: 'snapshot-2',
    latest_successful_run_id: 'run-solution',
    completion_reason: 'El problema principal y la solucion base han quedado definidos.',
  },
  documents: [],
  sources: [],
  gaps: [],
  module_chats: [
    {
      chat_id: 'chat-problem',
      proposal_id: 'session-1',
      module: 'problem',
      chat_status: 'completed',
      turns: [],
      started_at: createdAt,
      completed_at: createdAt,
      warnings: [],
    },
    {
      chat_id: 'chat-solution',
      proposal_id: 'session-1',
      module: 'solution',
      chat_status: 'completed',
      turns: [],
      started_at: createdAt,
      completed_at: createdAt,
      warnings: [],
    },
    {
      chat_id: 'chat-data',
      proposal_id: 'session-1',
      module: 'data_ai_privacy',
      chat_status: 'completed',
      turns: [],
      started_at: createdAt,
      completed_at: createdAt,
      warnings: [],
    },
    {
      chat_id: 'chat-medical-device',
      proposal_id: 'session-1',
      module: 'medical_device_triage',
      chat_status: 'completed',
      turns: [],
      started_at: createdAt,
      completed_at: createdAt,
      warnings: [],
    },
    {
      chat_id: 'chat-resources',
      proposal_id: 'session-1',
      module: 'resources_pilot_viability',
      chat_status: 'completed',
      turns: [],
      started_at: createdAt,
      completed_at: createdAt,
      warnings: [],
    },
  ],
  generated_sections: [
    report.problem_section,
    report.solution_section,
    {
      section_id: 'section-data',
      proposal_id: 'session-1',
      section_kind: 'data_ai_privacy',
      section_status: 'generated',
      section_version: 1,
      title: 'Data, AI and privacy',
      content_markdown: 'Datos ficticios definidos para revision humana.',
      source_refs: [],
      gap_refs: [],
      generated_by_run_id: 'run-data',
      warnings: [],
      created_at: createdAt,
    },
    {
      section_id: 'section-medical-device',
      proposal_id: 'session-1',
      section_kind: 'medical_device_triage',
      section_status: 'generated',
      section_version: 1,
      title: 'Medical-device triage',
      content_markdown: 'Triaje ficticio definido para revision humana competente.',
      source_refs: [],
      gap_refs: [],
      generated_by_run_id: 'run-medical-device',
      warnings: [],
      created_at: createdAt,
    },
    {
      section_id: 'section-resources',
      proposal_id: 'session-1',
      section_kind: 'resources_pilot_viability',
      section_status: 'generated',
      section_version: 1,
      title: 'Resources and pilot',
      content_markdown: 'Recursos ficticios definidos para revision humana.',
      source_refs: [],
      gap_refs: [],
      generated_by_run_id: 'run-resources',
      warnings: [],
      created_at: createdAt,
    },
  ],
  turns: [
    {
      id: 'turn-1',
      session_id: 'session-1',
      turn_seq: 1,
      question_text: '¿Quién responde hoy por este problema?',
      answer_text: 'Coordinacion de urgencias.',
      status: 'resolved',
      agent_status: 'done',
      diagnosis_json: [],
      updated_problem_definition_json: null,
      completion_reason: 'Problema definido.',
    },
  ],
  runs: [],
  snapshots: [],
  events: [],
};

function renderWorkspaceHtml(
  audit: SessionAuditView,
  options: {
    report?: BasicAlphaReport | null;
    reportLoadError?: string | null;
  } = {},
): string {
  const currentReport = options.report ?? null;

  return renderToStaticMarkup(
    h(SessionWorkspace, {
      audit,
      report: currentReport,
      reportLoadError: options.reportLoadError,
      isReplying: false,
      isComposingReport: false,
      isDownloadingReportPdf: false,
      onReply: async () => undefined,
      onComposeReport: async () => undefined,
      onDownloadReportPdf: async () => undefined,
      onSolutionReply: async () => undefined,
      onDataAiPrivacyReply: async () => undefined,
      onMedicalDeviceTriageReply: async () => undefined,
      onResourcesPilotViabilityReply: async () => undefined,
      onStartSolution: async () => undefined,
      onStartDataAiPrivacy: async () => undefined,
      onStartMedicalDeviceTriage: async () => undefined,
      onStartResourcesPilotViability: async () => undefined,
      presentation: deriveSessionPresentation(
        audit,
        currentReport ? { report: currentReport } : {},
      ),
    }),
  );
}

describe('LocalDemoSafetyNotice', () => {
  it.each([
    ['intake', 'Usa solo informacion ficticia o anonimizada'],
    ['resume', 'session_id funciona como token de demo local'],
    ['workspace', 'estado auditable para revision local'],
    ['clinic-module', 'gaps, preguntas e incertidumbre'],
    ['report', 'PDF son artefactos locales de demo'],
  ] as const)('renders the %s context warning', (context, expectedCopy) => {
    const html = renderToStaticMarkup(h(LocalDemoSafetyNotice, { context }));

    expect(html).toContain('Demo local controlada');
    expect(html).toContain('No introduzcas datos reales de pacientes');
    expect(html).toContain(expectedCopy);
  });

  it('renders in the App start shell with no-real-patient-data copy', () => {
    const html = renderToStaticMarkup(h(App));

    expect(html).toContain('Demo local controlada');
    expect(html).toContain('No introduzcas datos reales de pacientes');
  });
});

describe('BasicAlphaReportPanel', () => {
  it('renders report sections, warnings, PDF action, and local demo safety copy', () => {
    const html = renderToStaticMarkup(
      h(BasicAlphaReportPanel, {
        report,
        canDownloadPdf: true,
        isDownloadingPdf: false,
        onDownloadPdf: async () => undefined,
      }),
    );

    expect(html).toContain('Basic Alpha Report');
    expect(html).toContain('Problem definition');
    expect(html).toContain('Solution definition');
    expect(html).toContain('Download PDF');
    expect(html).toContain('This Alpha report is not a dictamen');
    expect(html).toContain('No introduzcas datos reales de pacientes');
  });

  it('disables the PDF action when the phase model does not allow export', () => {
    const html = renderToStaticMarkup(
      h(BasicAlphaReportPanel, {
        report: { ...report, report_status: 'needs_revision' },
        canDownloadPdf: false,
        isDownloadingPdf: false,
        onDownloadPdf: async () => undefined,
      }),
    );

    expect(html).toContain('Download PDF');
    expect(html).toContain('disabled=""');
  });
});

describe('SessionWorkspace', () => {
  it('renders a phase-driven start action when solution is the current phase', () => {
    const auditReadyForSolution: SessionAuditView = {
      ...workspaceAudit,
      module_chats: [workspaceAudit.module_chats[0]!],
      generated_sections: [report.problem_section],
      runs: [],
    };
    const html = renderToStaticMarkup(
      h(SessionWorkspace, {
        audit: auditReadyForSolution,
        report: null,
        isReplying: false,
        isComposingReport: false,
        isDownloadingReportPdf: false,
        onReply: async () => undefined,
        onComposeReport: async () => undefined,
        onDownloadReportPdf: async () => undefined,
        onSolutionReply: async () => undefined,
        onDataAiPrivacyReply: async () => undefined,
        onMedicalDeviceTriageReply: async () => undefined,
        onResourcesPilotViabilityReply: async () => undefined,
        onStartSolution: async () => undefined,
        onStartDataAiPrivacy: async () => undefined,
        onStartMedicalDeviceTriage: async () => undefined,
        onStartResourcesPilotViability: async () => undefined,
        presentation: deriveSessionPresentation(auditReadyForSolution),
      }),
    );

    expect(html).toContain('Fase actual: Solución');
    expect(html).toContain('Iniciar solución');
    expect(html).not.toContain('Preparar informe');
  });

  it('renders all eight phases in the canonical navigator', () => {
    const html = renderWorkspaceHtml(workspaceAudit);

    expect(html).toContain('aria-label="Camino de fases de la propuesta"');
    expect((html.match(/aria-current="step"/g) ?? [])).toHaveLength(1);
    expect(html).toContain('Intake / propuesta');
    expect(html).toContain('Problema');
    expect(html).toContain('Solución');
    expect(html).toContain('Datos / IA / privacidad');
    expect(html).toContain('Medical-device triage');
    expect(html).toContain('Recursos / piloto / viabilidad');
    expect(html).toContain('Informe');
    expect(html).toContain('PDF / export');
    expect(html).toContain('Completada');
    expect(html).toContain('Actual');
    expect(html).toContain('Bloqueada');
    expect((html.match(/Acción actual/g) ?? [])).toHaveLength(1);
  });

  it('keeps report load failures out of unrelated current phase guidance', () => {
    const auditReadyForSolution: SessionAuditView = {
      ...workspaceAudit,
      module_chats: [workspaceAudit.module_chats[0]!],
      generated_sections: [report.problem_section],
      runs: [],
    };
    const html = renderWorkspaceHtml(auditReadyForSolution, {
      reportLoadError: 'Sesión session-1 cargada, pero no se pudo recuperar el informe Alpha.',
    });

    expect(html).toContain('Fase actual: Solución');
    expect(html).toContain('Describe qué cambiaría, quién la usaría, cómo funcionaría y sus límites.');
    expect(html).not.toContain('Sesión session-1 cargada, pero no se pudo recuperar el informe Alpha.');
  });

  it('exposes only the current phase start action when solution is ready', () => {
    const auditReadyForSolution: SessionAuditView = {
      ...workspaceAudit,
      module_chats: [workspaceAudit.module_chats[0]!],
      generated_sections: [report.problem_section],
      runs: [],
    };
    const html = renderWorkspaceHtml(auditReadyForSolution);

    expect(html).toContain('Iniciar solución');
    expect(html).toContain('Completa la fase de solución antes de revisar datos, IA y privacidad.');
    expect(html).not.toContain('Iniciar datos/IA/privacidad');
    expect(html).not.toContain('Iniciar medical-device triage');
    expect(html).not.toContain('Iniciar recursos/piloto');
    expect(html).not.toContain('Preparar informe');
    expect(html).not.toContain('Exportar PDF');
  });

  it('keeps resources locked after solution instead of rendering a parallel action', () => {
    const auditAfterSolution: SessionAuditView = {
      ...workspaceAudit,
      module_chats: [
        workspaceAudit.module_chats[0]!,
        workspaceAudit.module_chats[1]!,
      ],
      generated_sections: [
        report.problem_section,
        report.solution_section,
      ],
      runs: [],
    };
    const html = renderWorkspaceHtml(auditAfterSolution);

    expect(html).toContain('Fase actual: Datos / IA / privacidad');
    expect(html).toContain('Iniciar datos/IA/privacidad');
    expect(html).toContain('Completa datos/IA/privacidad y el triaje medical-device antes de recursos/piloto.');
    expect(html).toContain('Faltan fases previas: Datos / IA / privacidad, Medical-device triage, Recursos / piloto / viabilidad.');
    expect(html).not.toContain('Iniciar recursos/piloto');
    expect(html).not.toContain('Preparar informe');
  });

  it('starts only the current data/IA/privacy phase when its primary action is clicked', async () => {
    const auditAfterSolution: SessionAuditView = {
      ...workspaceAudit,
      module_chats: [
        workspaceAudit.module_chats[0]!,
        workspaceAudit.module_chats[1]!,
      ],
      generated_sections: [
        report.problem_section,
        report.solution_section,
      ],
      runs: [],
    };
    const onStartDataAiPrivacy = vi.fn(async () => undefined);
    const onStartResourcesPilotViability = vi.fn(async () => undefined);

    render(
      h(SessionWorkspace, {
        audit: auditAfterSolution,
        report: null,
        isReplying: false,
        isComposingReport: false,
        isDownloadingReportPdf: false,
        onReply: async () => undefined,
        onComposeReport: async () => undefined,
        onDownloadReportPdf: async () => undefined,
        onSolutionReply: async () => undefined,
        onDataAiPrivacyReply: async () => undefined,
        onMedicalDeviceTriageReply: async () => undefined,
        onResourcesPilotViabilityReply: async () => undefined,
        onStartSolution: async () => undefined,
        onStartDataAiPrivacy,
        onStartMedicalDeviceTriage: async () => undefined,
        onStartResourcesPilotViability,
        presentation: deriveSessionPresentation(auditAfterSolution),
      }),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Iniciar datos/IA/privacidad' }));

    expect(onStartDataAiPrivacy).toHaveBeenCalledTimes(1);
    expect(onStartResourcesPilotViability).not.toHaveBeenCalled();
  });

  it('shows medical-device not applicable and moves the next action to resources', () => {
    const notApplicableRun: AgentRun = {
      id: 'run-medical-device-not-applicable',
      session_id: 'session-1',
      turn_seq: null,
      request_id: 'req-medical-device',
      run_purpose: 'medical_device_triage',
      agent_name: 'medical_device_triage_agent',
      prompt_name: 'medical-device-triage',
      prompt_version: 'v1',
      prompt_sha256: 'hash-medical-device',
      model_provider: 'ollama',
      model_name: 'qwen2.5:7b-instruct',
      model_params_json: {},
      raw_model_output: '{}',
      validated_output_json: {
        updated_medical_device_triage: {
          triage_status: 'not_applicable',
        },
      },
      status: 'completed',
    };
    const auditWithSkippedMedicalDevice: SessionAuditView = {
      ...workspaceAudit,
      module_chats: [
        workspaceAudit.module_chats[0]!,
        workspaceAudit.module_chats[1]!,
        workspaceAudit.module_chats[2]!,
      ],
      generated_sections: [
        report.problem_section,
        report.solution_section,
        workspaceAudit.generated_sections[2]!,
      ],
      runs: [notApplicableRun],
    };
    const html = renderWorkspaceHtml(auditWithSkippedMedicalDevice);

    expect(html).toContain('Fase actual: Recursos / piloto / viabilidad');
    expect(html).toContain('Medical-device triage');
    expect(html).toContain('No aplica');
    expect(html).toContain('Iniciar recursos/piloto');
    expect(html).not.toContain('Iniciar medical-device triage');
    expect(html).not.toContain('Preparar informe');
  });

  it('renders a report compose action when the report phase prerequisites are complete', () => {
    const html = renderToStaticMarkup(
      h(SessionWorkspace, {
        audit: workspaceAudit,
        report: null,
        isReplying: false,
        isComposingReport: false,
        isDownloadingReportPdf: false,
        onReply: async () => undefined,
        onComposeReport: async () => undefined,
        onDownloadReportPdf: async () => undefined,
        onSolutionReply: async () => undefined,
        onDataAiPrivacyReply: async () => undefined,
        onMedicalDeviceTriageReply: async () => undefined,
        onResourcesPilotViabilityReply: async () => undefined,
        onStartSolution: async () => undefined,
        onStartDataAiPrivacy: async () => undefined,
        onStartMedicalDeviceTriage: async () => undefined,
        onStartResourcesPilotViability: async () => undefined,
        presentation: deriveSessionPresentation(workspaceAudit),
      }),
    );

    expect(html).toContain('Informe Alpha');
    expect(html).toContain('Preparar informe');
    expect(html).toContain('Prepara el resumen estructurado');
  });

  it('renders report load failures as report-specific workspace state', () => {
    const html = renderToStaticMarkup(
      h(SessionWorkspace, {
        audit: workspaceAudit,
        report: null,
        reportLoadError: 'Sesión session-1 cargada, pero no se pudo recuperar el informe Alpha.',
        isReplying: false,
        isComposingReport: false,
        isDownloadingReportPdf: false,
        onReply: async () => undefined,
        onComposeReport: async () => undefined,
        onDownloadReportPdf: async () => undefined,
        onSolutionReply: async () => undefined,
        onDataAiPrivacyReply: async () => undefined,
        onMedicalDeviceTriageReply: async () => undefined,
        onResourcesPilotViabilityReply: async () => undefined,
        onStartSolution: async () => undefined,
        onStartDataAiPrivacy: async () => undefined,
        onStartMedicalDeviceTriage: async () => undefined,
        onStartResourcesPilotViability: async () => undefined,
        presentation: deriveSessionPresentation(workspaceAudit),
      }),
    );

    expect(html).toContain('Informe Alpha');
    expect(html).toContain('Sesión session-1 cargada, pero no se pudo recuperar el informe Alpha.');
  });

  it('renders a retry action when report composition is recoverable', () => {
    const failedReportRun: AgentRun = {
      id: 'run-report',
      session_id: 'session-1',
      turn_seq: null,
      request_id: 'req-report',
      run_purpose: 'basic_report_compose',
      agent_name: 'basic_report_composer',
      prompt_name: 'basic-alpha-report',
      prompt_version: 'v1',
      prompt_sha256: 'hash-report',
      model_provider: 'ollama',
      model_name: 'qwen2.5:7b-instruct',
      model_params_json: {},
      raw_model_output: '{}',
      validated_output_json: {},
      status: 'model_failed',
    };
    const auditWithFailedReport = {
      ...workspaceAudit,
      runs: [failedReportRun],
    };
    const html = renderToStaticMarkup(
      h(SessionWorkspace, {
        audit: auditWithFailedReport,
        report: null,
        isReplying: false,
        isComposingReport: false,
        isDownloadingReportPdf: false,
        onReply: async () => undefined,
        onComposeReport: async () => undefined,
        onDownloadReportPdf: async () => undefined,
        onSolutionReply: async () => undefined,
        onDataAiPrivacyReply: async () => undefined,
        onMedicalDeviceTriageReply: async () => undefined,
        onResourcesPilotViabilityReply: async () => undefined,
        onStartSolution: async () => undefined,
        onStartDataAiPrivacy: async () => undefined,
        onStartMedicalDeviceTriage: async () => undefined,
        onStartResourcesPilotViability: async () => undefined,
        presentation: deriveSessionPresentation(auditWithFailedReport),
      }),
    );

    expect(html).toContain('Informe Alpha');
    expect(html).toContain('Reintentar informe');
  });

  it('does not mark unsupported non-report recovery as an actionable rail step', () => {
    const failedSolutionChat: ModuleChat = {
      ...workspaceAudit.module_chats[1]!,
      chat_status: 'failed',
      active_turn_id: undefined,
      turns: [],
    };
    const auditWithFailedSolution: SessionAuditView = {
      ...workspaceAudit,
      module_chats: [
        workspaceAudit.module_chats[0]!,
        failedSolutionChat,
      ],
      generated_sections: [report.problem_section],
      runs: [],
    };
    const html = renderWorkspaceHtml(auditWithFailedSolution);

    expect(html).toContain('Fase actual: Solución');
    expect(html).toContain('La fase necesita revisión o recuperación antes de continuar.');
    expect(html).toContain('Esta fase necesita recuperación, pero esta pantalla solo permite reintentar el informe Alpha.');
    expect(html).not.toContain('Acción actual');
    expect(html).not.toContain('Reintentar informe');
  });

  it('passes the PDF phase lock through to an existing report panel', () => {
    const reportNeedingRevision: BasicAlphaReport = { ...report, report_status: 'needs_revision' };
    const html = renderToStaticMarkup(
      h(SessionWorkspace, {
        audit: workspaceAudit,
        report: reportNeedingRevision,
        isReplying: false,
        isComposingReport: false,
        isDownloadingReportPdf: false,
        onReply: async () => undefined,
        onComposeReport: async () => undefined,
        onDownloadReportPdf: async () => undefined,
        onSolutionReply: async () => undefined,
        onDataAiPrivacyReply: async () => undefined,
        onMedicalDeviceTriageReply: async () => undefined,
        onResourcesPilotViabilityReply: async () => undefined,
        onStartSolution: async () => undefined,
        onStartDataAiPrivacy: async () => undefined,
        onStartMedicalDeviceTriage: async () => undefined,
        onStartResourcesPilotViability: async () => undefined,
        presentation: deriveSessionPresentation(workspaceAudit, { report: reportNeedingRevision }),
      }),
    );

    expect(html).toContain('Download PDF');
    expect(html).toContain('disabled=""');
  });

  it('renders PDF export as the final phase action when the report is ready', () => {
    const html = renderWorkspaceHtml(workspaceAudit, { report });

    expect(html).toContain('Fase actual: PDF / export');
    expect(html).toContain('Exportar PDF');
    expect((html.match(/class="button button--primary"/g) ?? [])).toHaveLength(1);
    expect(html).toMatch(
      /<button[^>]*class="button button--secondary basic-report__download"[^>]*disabled=""[^>]*>Download PDF<\/button>/,
    );
    expect(html).not.toContain('Preparar informe');
    expect(html).not.toContain('Iniciar recursos/piloto');
  });

  it('passes the session id to report and PDF primary actions', async () => {
    const onComposeReport = vi.fn(async () => undefined);
    const onDownloadReportPdf = vi.fn(async () => undefined);

    const { unmount } = render(
      h(SessionWorkspace, {
        audit: workspaceAudit,
        report: null,
        isReplying: false,
        isComposingReport: false,
        isDownloadingReportPdf: false,
        onReply: async () => undefined,
        onComposeReport,
        onDownloadReportPdf,
        onSolutionReply: async () => undefined,
        onDataAiPrivacyReply: async () => undefined,
        onMedicalDeviceTriageReply: async () => undefined,
        onResourcesPilotViabilityReply: async () => undefined,
        onStartSolution: async () => undefined,
        onStartDataAiPrivacy: async () => undefined,
        onStartMedicalDeviceTriage: async () => undefined,
        onStartResourcesPilotViability: async () => undefined,
        presentation: deriveSessionPresentation(workspaceAudit),
      }),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Preparar informe' }));
    expect(onComposeReport).toHaveBeenCalledWith('session-1');

    unmount();

    render(
      h(SessionWorkspace, {
        audit: workspaceAudit,
        report,
        isReplying: false,
        isComposingReport: false,
        isDownloadingReportPdf: false,
        onReply: async () => undefined,
        onComposeReport,
        onDownloadReportPdf,
        onSolutionReply: async () => undefined,
        onDataAiPrivacyReply: async () => undefined,
        onMedicalDeviceTriageReply: async () => undefined,
        onResourcesPilotViabilityReply: async () => undefined,
        onStartSolution: async () => undefined,
        onStartDataAiPrivacy: async () => undefined,
        onStartMedicalDeviceTriage: async () => undefined,
        onStartResourcesPilotViability: async () => undefined,
        presentation: deriveSessionPresentation(workspaceAudit, { report }),
      }),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Exportar PDF' }));

    expect(onDownloadReportPdf).toHaveBeenCalledWith('session-1');
  });
});

describe('SessionStatePanel', () => {
  it('renders canonical proposal progress and phase path', () => {
    const html = renderToStaticMarkup(
      h(SessionStatePanel, {
        audit: workspaceAudit,
        presentation: deriveSessionPresentation(workspaceAudit),
      }),
    );

    expect(html).toContain('Progreso de la propuesta');
    expect(html).toContain('75%');
    expect(html).toContain('6/8');
    expect(html).toContain('Camino de fases');
    expect(html).toContain('Intake / propuesta');
    expect(html).toContain('Problema');
    expect(html).toContain('PDF / export');
  });
});
