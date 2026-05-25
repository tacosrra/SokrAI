import { describe, expect, it } from 'vitest';

import type { SessionAuditView } from '../domain/contracts';
import { deriveSessionPresentation } from './session-view';

const auditFixture: SessionAuditView = {
  session: {
    id: 'session-1',
    project_title: 'Triage IA en Urgencias',
    goal: 'Definir el problema antes de evaluar solución',
    current_stage: 'problem_definition',
    current_agent: 'problem_definition_agent',
    status: 'waiting_for_user',
    current_turn_seq: 1,
    state_version: 2,
    latest_structured_brief_json: {
      project_title: 'Triage IA en Urgencias',
      goal: 'Definir el problema antes de evaluar solución',
      target_user: 'Enfermería de admisión',
      problem_owner: '',
      problem_statement: 'El triaje se retrasa en horas punta.',
      evidence_of_problem: 'Esperas de 20 a 35 minutos.',
      current_alternatives: 'Protocolo manual y hojas de apoyo.',
      scope: 'Urgencias de adultos.',
      constraints_known: ['No incluye diagnóstico automático.'],
      assumptions: ['El cuello de botella puede estar en la recogida de datos.'],
      ambiguities: ['No está claro el responsable operativo.'],
      missing_information: ['problem_owner'],
    },
    latest_problem_definition_json: {
      problem_owner: '',
      problem_statement: 'El triaje se retrasa en horas punta.',
      evidence_of_problem: 'Esperas de 20 a 35 minutos.',
      scope: 'Urgencias de adultos.',
      current_alternatives: 'Protocolo manual y hojas de apoyo.',
      assumptions: ['El cuello de botella puede estar en la recogida de datos.'],
      ambiguities_remaining: ['No está claro el responsable operativo.'],
    },
    latest_snapshot_id: 'snapshot-2',
    latest_successful_run_id: 'run-2',
    completion_reason: null,
  },
  documents: [],
  sources: [],
  gaps: [],
  module_chats: [],
  generated_sections: [],
  turns: [
    {
      id: 'turn-1',
      session_id: 'session-1',
      turn_seq: 1,
      question_text: '¿Qué equipo responde hoy por este problema?',
      answer_text: null,
      status: 'awaiting_user',
      agent_status: null,
      diagnosis_json: [],
      updated_problem_definition_json: null,
      completion_reason: null,
    },
  ],
  runs: [
    {
      id: 'run-1',
      session_id: 'session-1',
      turn_seq: null,
      request_id: 'req-1',
      run_purpose: 'brief_extraction',
      agent_name: 'initial_brief_extractor',
      prompt_name: 'extract-initial-brief',
      prompt_version: 'v1',
      prompt_sha256: 'hash-1',
      model_provider: 'ollama',
      model_name: 'qwen2.5:7b-instruct',
      model_params_json: {},
      raw_model_output: '{"project_title":"Triage IA en Urgencias"}',
      validated_output_json: {},
      status: 'completed',
    },
    {
      id: 'run-2',
      session_id: 'session-1',
      turn_seq: 1,
      request_id: 'req-2',
      run_purpose: 'problem_definition',
      agent_name: 'problem_definition_agent',
      prompt_name: 'problem-definition-agent',
      prompt_version: 'v1',
      prompt_sha256: 'hash-2',
      model_provider: 'ollama',
      model_name: 'qwen2.5:7b-instruct',
      model_params_json: {},
      raw_model_output: '{"agent_status":"continue"}',
      validated_output_json: {},
      status: 'completed',
    },
  ],
  snapshots: [
    {
      id: 'snapshot-2',
      session_id: 'session-1',
      snapshot_seq: 2,
      state_version: 2,
      source_turn_seq: 1,
      source_run_id: 'run-2',
      structured_brief_json: {
        project_title: 'Triage IA en Urgencias',
        goal: 'Definir el problema antes de evaluar solución',
        target_user: 'Enfermería de admisión',
        problem_owner: '',
        problem_statement: 'El triaje se retrasa en horas punta.',
        evidence_of_problem: 'Esperas de 20 a 35 minutos.',
        current_alternatives: 'Protocolo manual y hojas de apoyo.',
        scope: 'Urgencias de adultos.',
        constraints_known: ['No incluye diagnóstico automático.'],
        assumptions: ['El cuello de botella puede estar en la recogida de datos.'],
        ambiguities: ['No está claro el responsable operativo.'],
        missing_information: ['problem_owner'],
      },
      current_problem_definition_json: {
        problem_owner: '',
        problem_statement: 'El triaje se retrasa en horas punta.',
        evidence_of_problem: 'Esperas de 20 a 35 minutos.',
        scope: 'Urgencias de adultos.',
        current_alternatives: 'Protocolo manual y hojas de apoyo.',
        assumptions: ['El cuello de botella puede estar en la recogida de datos.'],
        ambiguities_remaining: ['No está claro el responsable operativo.'],
      },
      detected_gaps_json: ['problem_owner', 'No está claro el responsable operativo.'],
      next_question_text: '¿Qué equipo responde hoy por este problema?',
      agent_status: 'continue',
      completion_reason: null,
      warnings_json: [],
    },
  ],
  events: [],
};

describe('deriveSessionPresentation', () => {
  it('prioritizes the latest snapshot and open turn data', () => {
    const presentation = deriveSessionPresentation(auditFixture);

    expect(presentation.currentQuestion).toBe('¿Qué equipo responde hoy por este problema?');
    expect(presentation.agentStatus).toBe('continue');
    expect(presentation.detectedGaps).toContain('problem_owner');
    expect(presentation.runCount).toBe(2);
    expect(presentation.checklist.find((item) => item.id === 'problem_owner')).toMatchObject({
      isComplete: false,
      source: 'missing',
    });
    expect(presentation.checklist.find((item) => item.id === 'target_user')).toMatchObject({
      isComplete: true,
      source: 'structured_brief',
    });
    expect(presentation.progress.percent).toBe(83);
    expect(presentation.progress.steps.map((step) => step.state)).toEqual([
      'complete',
      'complete',
      'current',
      'upcoming',
    ]);
  });

  it('marks the flow as complete when the session is closed and fields are defined', () => {
    const completedAudit: SessionAuditView = {
      ...auditFixture,
      session: {
        ...auditFixture.session,
        status: 'completed',
        completion_reason: 'La definición del problema quedó lista para revisión.',
        latest_problem_definition_json: {
          ...auditFixture.session.latest_problem_definition_json!,
          problem_owner: 'Dirección de Urgencias',
        },
      },
      turns: [
        {
          ...auditFixture.turns[0],
          answer_text: 'El problema lo lidera Dirección de Urgencias.',
          status: 'resolved',
          completion_reason: 'La definición del problema quedó lista para revisión.',
        },
      ],
      snapshots: [
        {
          ...auditFixture.snapshots[0],
          current_problem_definition_json: {
            ...auditFixture.snapshots[0].current_problem_definition_json!,
            problem_owner: 'Dirección de Urgencias',
          },
          detected_gaps_json: [],
          agent_status: 'done',
          completion_reason: 'La definición del problema quedó lista para revisión.',
        },
      ],
      module_chats: [
        {
          chat_id: 'chat-1',
          proposal_id: 'session-1',
          module: 'problem',
          chat_status: 'completed',
          turns: [],
          started_at: '2026-05-24T14:00:00.000Z',
          completed_at: '2026-05-24T14:30:00.000Z',
          warnings: [],
        },
      ],
      generated_sections: [
        {
          section_id: 'section-1',
          proposal_id: 'session-1',
          section_kind: 'problem',
          section_status: 'generated',
          section_version: 1,
          title: 'Problem definition',
          content_markdown: 'El triaje inicial se retrasa en horas punta.',
          source_refs: [],
          gap_refs: ['gap-1'],
          warnings: [],
          created_at: '2026-05-24T14:30:00.000Z',
        },
      ],
    };

    const presentation = deriveSessionPresentation(completedAudit);

    expect(presentation.progress.percent).toBe(100);
    expect(presentation.problemModuleChat?.chat_status).toBe('completed');
    expect(presentation.latestProblemSection).toMatchObject({
      section_id: 'section-1',
      section_version: 1,
    });
    expect(presentation.progress.title).toBe('Definición del problema completada');
    expect(presentation.progress.steps.every((step) => step.state === 'complete')).toBe(true);
    expect(presentation.checklist.find((item) => item.id === 'problem_owner')).toMatchObject({
      isComplete: true,
      source: 'problem_definition',
    });
  });

  it('uses structured gaps before legacy snapshot gap strings', () => {
    const auditWithStructuredGaps: SessionAuditView = {
      ...auditFixture,
      gaps: [
        {
          gap_id: 'gap-1',
          proposal_id: 'session-1',
          module: 'problem',
          gap_kind: 'missing_information',
          gap_status: 'open',
          origin: 'structured_brief_field',
          field: 'evidence_of_problem',
          description: 'Observable evidence of the problem is missing from the structured brief.',
          absence: {
            is_absent: true,
            checked_fields: ['evidence_of_problem'],
            reason: 'Required information was not found in the available structured brief.',
          },
          question_hint: 'Que evidencia observable tienes de que este problema existe y genera impacto real?',
          source_refs: [],
          audit_refs: [],
          warnings: [],
          created_at: '2026-05-24T20:00:00.000Z',
          updated_at: '2026-05-24T20:00:00.000Z',
        },
      ],
    };

    const presentation = deriveSessionPresentation(auditWithStructuredGaps);

    expect(presentation.detectedGaps).toEqual([
      'evidence_of_problem: Observable evidence of the problem is missing from the structured brief.',
    ]);
    expect(presentation.detectedGaps).not.toContain('problem_owner');
  });
});
