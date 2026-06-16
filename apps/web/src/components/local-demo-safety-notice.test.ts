// @vitest-environment jsdom

import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AgentRun, AlphaGap, BasicAlphaReport, ModuleChat, SessionAuditView } from '../domain/contracts';
import { deriveSessionPresentation } from '../lib/session-view';
import { BasicAlphaReportPanel } from './BasicAlphaReportPanel';
import { PhaseRail } from './PhaseRail';
import { SessionStatePanel } from './SessionStatePanel';
import { SessionWorkspace } from './SessionWorkspace';
import { WorkflowLoadingPanel } from './WorkflowLoadingPanel';

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

    expect(html).toContain('Informe de propuesta');
    expect(html).toContain('Resumen ejecutivo');
    expect(html).toContain('Problema');
    expect(html).toContain('Solución');
    expect(html).toContain('Descargar PDF');
    expect(html).toContain('Este informe no es un dictamen clínico, legal ni regulatorio.');
  });

  it('keeps the PDF download action hidden when the phase model does not allow export', () => {
    const html = renderToStaticMarkup(
      h(BasicAlphaReportPanel, {
        report: { ...report, report_status: 'needs_revision' },
        canDownloadPdf: false,
        isDownloadingPdf: false,
        onDownloadPdf: async () => undefined,
      }),
    );

    expect(html).toContain('Disponible cuando el informe esté listo');
    expect(html).not.toContain('Descargar PDF');
    expect(html).not.toContain('disabled=""');
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
    expect(html).toContain('Empezar solución');
    expect(html).not.toContain('Preparar informe');
  });

  it('renders all eight phases in the canonical navigator', () => {
    const presentation = deriveSessionPresentation(workspaceAudit);
    const html = renderToStaticMarkup(
      h(PhaseRail, {
        steps: presentation.phaseProgress.steps,
        currentPhaseId: presentation.phaseProgress.currentPhaseId,
        completedPhases: presentation.phaseProgress.completedPhases,
        totalApplicablePhases: presentation.phaseProgress.totalApplicablePhases,
      }),
    );

    expect(html).toContain('aria-label="Fases de la propuesta"');
    expect((html.match(/aria-current="step"/g) ?? [])).toHaveLength(1);
    expect(html).toContain('Inicio');
    expect(html).toContain('Problema');
    expect(html).toContain('Solución');
    expect(html).toContain('Datos y privacidad');
    expect(html).toContain('Revisión sanitaria');
    expect(html).toContain('Piloto y recursos');
    expect(html).toContain('Informe');
    expect(html).toContain('Exportación');
    expect(html).toContain('Completada');
    expect(html).toContain('Actual');
    expect(html).toContain('Bloqueada');
    expect(html).toContain('Paso actual');
  });

  it('keeps report load failures out of unrelated current phase guidance', () => {
    const auditReadyForSolution: SessionAuditView = {
      ...workspaceAudit,
      module_chats: [workspaceAudit.module_chats[0]!],
      generated_sections: [report.problem_section],
      runs: [],
    };
    const html = renderWorkspaceHtml(auditReadyForSolution, {
      reportLoadError: 'La propuesta se ha cargado, pero el informe todavía no está disponible.',
    });

    expect(html).toContain('Fase actual: Solución');
    expect(html).toContain('Describe qué cambiaría, quién usaría la solución, cómo funcionaría y qué límites tendría.');
    expect(html).not.toContain('La propuesta se ha cargado, pero el informe todavía no está disponible.');
  });

  it('exposes only the current phase start action when solution is ready', () => {
    const auditReadyForSolution: SessionAuditView = {
      ...workspaceAudit,
      module_chats: [workspaceAudit.module_chats[0]!],
      generated_sections: [report.problem_section],
      runs: [],
    };
    const html = renderWorkspaceHtml(auditReadyForSolution);

    expect(html).toContain('Empezar solución');
    expect(html).not.toContain('Revisar datos y privacidad');
    expect(html).not.toContain('Revisar aspectos sanitarios');
    expect(html).not.toContain('Preparar piloto y recursos');
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
    const presentation = deriveSessionPresentation(auditAfterSolution);
    const html = renderWorkspaceHtml(auditAfterSolution);

    expect(html).toContain('Fase actual: Datos y privacidad');
    expect(html).toContain('Revisar datos y privacidad');
    expect(presentation.phaseProgress.steps.find((step) => step.id === 'resources_pilot_viability')).toMatchObject({
      status: 'locked',
      lockedReason: 'Completa datos, privacidad y revisión sanitaria antes del piloto.',
    });
    expect(presentation.phaseProgress.steps.find((step) => step.id === 'report')).toMatchObject({
      status: 'locked',
      lockedReason: 'Faltan fases previas: Datos y privacidad, Revisión sanitaria, Piloto y recursos.',
    });
    expect(html).not.toContain('Preparar piloto y recursos');
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

    await userEvent.click(screen.getByRole('button', { name: 'Revisar datos y privacidad' }));

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

    expect(html).toContain('Fase actual: Piloto y recursos');
    expect(html).toContain('Preparar piloto y recursos');
    expect(html).not.toContain('Revisar aspectos sanitarios');
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

    expect(html).toContain('Fase actual: Informe');
    expect(html).toContain('Preparar informe');
    expect(html).toContain('Prepara material claro y revisable antes de exportarlo.');
  });

  it('renders report load failures as report-specific workspace state', () => {
    const html = renderToStaticMarkup(
      h(SessionWorkspace, {
        audit: workspaceAudit,
        report: null,
        reportLoadError: 'No se ha podido recuperar el informe de esta propuesta.',
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

    expect(html).toContain('Fase actual: Informe');
    expect(html).toContain('No se ha podido recuperar el informe de esta propuesta.');
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

    expect(html).toContain('Fase actual: Informe');
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
    expect(html).toContain('Esta fase necesita revisarse antes de continuar.');
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

    expect(html).toContain('Disponible cuando el informe esté listo');
    expect(html).not.toContain('Descargar PDF');
  });

  it('renders PDF export inside the final report panel when the report is ready', () => {
    const html = renderWorkspaceHtml(workspaceAudit, { report });

    expect(html).toContain('Fase actual: Exportación');
    expect(html).toContain('Descargar PDF');
    expect((html.match(/button--primary basic-report__download/g) ?? [])).toHaveLength(1);
    expect(html).not.toContain('Preparar informe');
    expect(html).not.toContain('Preparar piloto y recursos');
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

    await userEvent.click(screen.getByRole('button', { name: 'Descargar PDF' }));

    expect(onDownloadReportPdf).toHaveBeenCalledWith('session-1');
  });
});

describe('SessionStatePanel', () => {
  it('renders a gap checklist with answered and pending items instead of duplicating phase status', () => {
    const answeredGap: AlphaGap = {
      gap_id: 'gap-answered',
      proposal_id: 'session-1',
      module: 'problem',
      gap_kind: 'missing_information',
      gap_status: 'resolved',
      origin: 'structured_brief_field',
      field: 'problem_owner',
      description: 'Falta confirmar quién responde por el problema.',
      absence: {
        is_absent: false,
        checked_fields: ['problem_owner'],
        reason: 'El usuario lo aclaró durante la entrevista.',
      },
      source_refs: [],
      resolved_by_turn_id: 'turn-1',
      audit_refs: [],
      warnings: [],
      created_at: createdAt,
      updated_at: createdAt,
    };
    const pendingGap: AlphaGap = {
      gap_id: 'gap-pending',
      proposal_id: 'session-1',
      module: 'data_ai_privacy',
      gap_kind: 'missing_information',
      gap_status: 'open',
      origin: 'structured_brief_field',
      field: 'privacy_controls',
      description: 'Falta explicar qué controles de privacidad se usarán.',
      absence: {
        is_absent: true,
        checked_fields: [],
        reason: 'No aparece en la propuesta inicial.',
      },
      source_refs: [],
      audit_refs: [],
      warnings: [],
      created_at: createdAt,
      updated_at: createdAt,
    };
    const html = renderToStaticMarkup(
      h(SessionStatePanel, {
        presentation: deriveSessionPresentation({
          ...workspaceAudit,
          gaps: [answeredGap, pendingGap],
        }),
      }),
    );

    expect(html).toContain('Aclaraciones de la propuesta');
    expect(html).toContain('1/2');
    expect(html).toContain('1 pendientes de responder.');
    expect(html).toContain('Puntos por aclarar');
    expect(html).toContain('Falta confirmar quién responde por el problema.');
    expect(html).toContain('Falta explicar qué controles de privacidad se usarán.');
    expect(html).toContain('Respondido');
    expect(html).toContain('Pendiente');
    expect(html).toContain('gap-checklist__item--answered');
    expect(html).toContain('gap-checklist__item--pending');
    expect(html).toContain('>✓</span>');
    expect(html).toContain('Siguiente paso');
    expect(html).toContain('Preparar informe');
    expect(html).not.toContain('Estado de fases');
    expect(html).not.toContain('session-1');
    expect(html).not.toContain('JSON');
  });

  it('shows only gaps from the current proposal phase', () => {
    const problemGap: AlphaGap = {
      gap_id: 'gap-problem',
      proposal_id: 'session-1',
      module: 'problem',
      gap_kind: 'missing_information',
      gap_status: 'open',
      origin: 'structured_brief_field',
      field: 'evidence_of_problem',
      description: 'Falta concretar qué evidencia muestra el problema.',
      absence: {
        is_absent: true,
        checked_fields: [],
        reason: 'No aparece en la propuesta inicial.',
      },
      source_refs: [],
      audit_refs: [],
      warnings: [],
      created_at: createdAt,
      updated_at: createdAt,
    };
    const solutionGap: AlphaGap = {
      gap_id: 'gap-solution',
      proposal_id: 'session-1',
      module: 'solution',
      gap_kind: 'missing_information',
      gap_status: 'open',
      origin: 'structured_brief_field',
      field: 'solution_summary',
      description: 'Falta describir cómo funcionaría la solución.',
      absence: {
        is_absent: true,
        checked_fields: [],
        reason: 'No aparece en la propuesta inicial.',
      },
      source_refs: [],
      audit_refs: [],
      warnings: [],
      created_at: createdAt,
      updated_at: createdAt,
    };
    const auditInProblemPhase: SessionAuditView = {
      ...workspaceAudit,
      session: {
        ...workspaceAudit.session,
        status: 'waiting_for_user',
      },
      gaps: [problemGap, solutionGap],
      module_chats: [],
      generated_sections: [],
      turns: [
        {
          id: 'turn-open-problem',
          session_id: 'session-1',
          turn_seq: 1,
          question_text: '¿Qué evidencia muestra que este problema merece atención?',
          answer_text: null,
          status: 'awaiting_user',
          agent_status: 'continue',
          diagnosis_json: [],
          updated_problem_definition_json: null,
          completion_reason: null,
        },
      ],
    };
    const html = renderToStaticMarkup(
      h(SessionStatePanel, {
        presentation: deriveSessionPresentation(auditInProblemPhase),
      }),
    );

    expect(html).toContain('Aclaraciones de problema');
    expect(html).toContain('0/1');
    expect(html).toContain('Falta concretar qué evidencia muestra el problema.');
    expect(html).not.toContain('Falta describir cómo funcionaría la solución.');
  });

  it('rewrites legacy English gap descriptions into clear user-facing Spanish cards', () => {
    const ownerGap: AlphaGap = {
      gap_id: 'gap-owner',
      proposal_id: 'session-1',
      module: 'problem',
      gap_kind: 'ambiguous_information',
      gap_status: 'open',
      origin: 'structured_brief_ambiguity',
      field: 'problem_owner',
      description: 'The structured brief flags ambiguous information: Quién es el responsable operativo final',
      absence: {
        is_absent: false,
        checked_fields: [],
        reason: '',
      },
      source_refs: [],
      audit_refs: [],
      warnings: [],
      created_at: createdAt,
      updated_at: createdAt,
    };
    const assumptionGap: AlphaGap = {
      gap_id: 'gap-assumptions',
      proposal_id: 'session-1',
      module: 'problem',
      gap_kind: 'missing_information',
      gap_status: 'open',
      origin: 'structured_brief_field',
      field: 'assumptions',
      description: 'Major assumptions are missing from the structured brief.',
      absence: {
        is_absent: true,
        checked_fields: ['assumptions'],
        reason: 'Required information was not found in the available structured brief.',
      },
      source_refs: [],
      audit_refs: [],
      warnings: [],
      created_at: createdAt,
      updated_at: createdAt,
    };
    const humanReviewGap: AlphaGap = {
      gap_id: 'gap-human-review',
      proposal_id: 'session-1',
      module: 'data_ai_privacy',
      gap_kind: 'missing_information',
      gap_status: 'open',
      origin: 'system_rule',
      field: 'human_review_plan',
      description: 'Data AI privacy information gap for human review plan.',
      absence: {
        is_absent: true,
        checked_fields: ['human_review_plan'],
        reason: 'Data AI privacy field is not sufficiently clear yet.',
      },
      source_refs: [],
      audit_refs: [],
      warnings: [],
      created_at: createdAt,
      updated_at: createdAt,
    };

    const html = renderToStaticMarkup(
      h(SessionStatePanel, {
        presentation: deriveSessionPresentation({
          ...workspaceAudit,
          gaps: [ownerGap, assumptionGap, humanReviewGap],
        }),
      }),
    );

    expect(html).toContain('Falta aclarar quién será la persona o equipo responsable');
    expect(html).toContain('responsable operativo final');
    expect(html).toContain('Falta identificar qué supuestos importantes');
    expect(html).toContain('Falta concretar quién revisará los resultados');
    expect(html).not.toMatch(
      /The resumen inicial|The structured brief|flags ambiguous|Major assumptions|human review plan/i,
    );
  });
});

describe('WorkflowLoadingPanel', () => {
  it('keeps the animated three-dot loading affordance visible', () => {
    const html = renderToStaticMarkup(h(WorkflowLoadingPanel, { kind: 'start' }));

    expect(html).toContain('workflow-loading-panel__pulse');
    expect((html.match(/<span><\/span>/g) ?? [])).toHaveLength(3);
  });
});
