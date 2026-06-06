import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { App } from '../App';
import type { BasicAlphaReport, SessionAuditView } from '../domain/contracts';
import { deriveSessionPresentation } from '../lib/session-view';
import { BasicAlphaReportPanel } from './BasicAlphaReportPanel';
import { LocalDemoSafetyNotice } from './LocalDemoSafetyNotice';
import { SessionWorkspace } from './SessionWorkspace';

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
  ],
  generated_sections: [report.problem_section, report.solution_section],
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
});

describe('SessionWorkspace', () => {
  it('renders a report compose action when the report is still missing but both sections already exist', () => {
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
    expect(html).toContain('todavía no está compuesto');
  });
});
