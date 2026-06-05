import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { App } from '../App';
import type { BasicAlphaReport } from '../domain/contracts';
import { BasicAlphaReportPanel } from './BasicAlphaReportPanel';
import { LocalDemoSafetyNotice } from './LocalDemoSafetyNotice';

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
