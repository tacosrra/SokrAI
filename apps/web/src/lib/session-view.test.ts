import { describe, expect, it } from 'vitest';

import type {
  AgentRun,
  AlphaGap,
  BasicAlphaReport,
  GeneratedSection,
  ModuleChat,
  SectionKind,
  SessionAuditView,
} from '../domain/contracts';
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

function generatedSection(
  sectionKind: SectionKind,
  overrides: Partial<GeneratedSection> = {},
): GeneratedSection {
  return {
    section_id: `section-${sectionKind}`,
    proposal_id: 'session-1',
    section_kind: sectionKind,
    section_status: 'generated',
    section_version: 1,
    title: `${sectionKind} section`,
    content_markdown: `${sectionKind} content`,
    source_refs: [],
    gap_refs: [],
    warnings: [],
    created_at: '2026-05-24T14:30:00.000Z',
    ...overrides,
  };
}

function completedModuleChat(module: ModuleChat['module']): ModuleChat {
  return {
    chat_id: `chat-${module}`,
    proposal_id: 'session-1',
    module,
    chat_status: 'completed',
    turns: [],
    started_at: '2026-05-24T14:00:00.000Z',
    completed_at: '2026-05-24T14:30:00.000Z',
    warnings: [],
  };
}

function awaitingModuleChat(module: ModuleChat['module'], question: string): ModuleChat {
  return {
    chat_id: `chat-${module}`,
    proposal_id: 'session-1',
    module,
    chat_status: 'waiting_for_user',
    active_turn_id: `turn-${module}`,
    turns: [
      {
        turn_id: `turn-${module}`,
        chat_id: `chat-${module}`,
        proposal_id: 'session-1',
        module,
        turn_seq: 1,
        question_text: question,
        turn_status: 'awaiting_user',
        agent_status: 'continue',
        diagnosis: [],
        source_refs: [],
        gap_refs: [],
        audit_refs: [],
        warnings: [],
        created_at: '2026-05-24T14:30:00.000Z',
      },
    ],
    started_at: '2026-05-24T14:30:00.000Z',
    warnings: [],
  };
}

function resolvedProblemAudit(overrides: Partial<SessionAuditView> = {}): SessionAuditView {
  return {
    ...auditFixture,
    ...overrides,
    session: {
      ...auditFixture.session,
      status: 'completed',
      completion_reason: 'La definición del problema quedó lista para revisión.',
      latest_problem_definition_json: {
        ...auditFixture.session.latest_problem_definition_json!,
        problem_owner: 'Dirección de Urgencias',
      },
      ...overrides.session,
    },
    turns: overrides.turns ?? [
      {
        ...auditFixture.turns[0],
        answer_text: 'El problema lo lidera Dirección de Urgencias.',
        status: 'resolved',
        completion_reason: 'La definición del problema quedó lista para revisión.',
      },
    ],
    snapshots: overrides.snapshots ?? [
      {
        ...auditFixture.snapshots[0],
        current_problem_definition_json: {
          ...auditFixture.snapshots[0].current_problem_definition_json!,
          problem_owner: 'Dirección de Urgencias',
        },
        detected_gaps_json: [],
        next_question_text: null,
        agent_status: 'done',
        completion_reason: 'La definición del problema quedó lista para revisión.',
      },
    ],
  };
}

function auditWithAllSections(overrides: Partial<SessionAuditView> = {}): SessionAuditView {
  return resolvedProblemAudit({
    ...overrides,
    module_chats: overrides.module_chats ?? [
      completedModuleChat('problem'),
      completedModuleChat('solution'),
      completedModuleChat('data_ai_privacy'),
      completedModuleChat('medical_device_triage'),
      completedModuleChat('resources_pilot_viability'),
    ],
    generated_sections: overrides.generated_sections ?? [
      generatedSection('problem'),
      generatedSection('solution'),
      generatedSection('data_ai_privacy'),
      generatedSection('medical_device_triage'),
      generatedSection('resources_pilot_viability'),
    ],
  });
}

function reportFixture(overrides: Partial<BasicAlphaReport> = {}): BasicAlphaReport {
  return {
    report_id: 'report-1',
    proposal_id: 'session-1',
    report_status: 'ready',
    schema_version: 'v1',
    structured_brief: auditFixture.session.latest_structured_brief_json,
    current_gaps: [],
    problem_section: generatedSection('problem'),
    solution_section: generatedSection('solution'),
    internal_sources: [],
    audit_refs: [],
    warnings: [],
    generated_at: '2026-05-24T15:00:00.000Z',
    ...overrides,
  };
}

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
    expect(presentation.phaseProgress.currentPhaseId).toBe('problem');
    expect(presentation.phaseProgress.steps.map((step) => [step.id, step.status])).toEqual([
      ['intake', 'complete'],
      ['problem', 'current'],
      ['solution', 'locked'],
      ['data_ai_privacy', 'locked'],
      ['medical_device_triage', 'locked'],
      ['resources_pilot_viability', 'locked'],
      ['report', 'locked'],
      ['pdf_export', 'locked'],
    ]);
  });

  it('always exposes all eight proposal phases in order', () => {
    const presentation = deriveSessionPresentation(auditFixture);

    expect(presentation.phaseProgress.steps.map((step) => step.id)).toEqual([
      'intake',
      'problem',
      'solution',
      'data_ai_privacy',
      'medical_device_triage',
      'resources_pilot_viability',
      'report',
      'pdf_export',
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
        {
          chat_id: 'chat-2',
          proposal_id: 'session-1',
          module: 'solution',
          chat_status: 'waiting_for_user',
          active_turn_id: 'solution-turn-1',
          turns: [
            {
              turn_id: 'solution-turn-1',
              chat_id: 'chat-2',
              proposal_id: 'session-1',
              module: 'solution',
              turn_seq: 1,
              question_text: 'What does the solution do?',
              turn_status: 'awaiting_user',
              agent_status: 'continue',
              diagnosis: ['Falta definir la solucion.'],
              source_refs: [],
              gap_refs: [],
              audit_refs: [],
              warnings: [],
              created_at: '2026-05-24T14:31:00.000Z',
            },
          ],
          started_at: '2026-05-24T14:31:00.000Z',
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
    expect(presentation.solutionModuleChat?.chat_status).toBe('waiting_for_user');
    expect(presentation.currentSolutionQuestion).toBe('What does the solution do?');
    expect(presentation.currentQuestion).toBe('What does the solution do?');
    expect(presentation.phaseProgress.currentPhaseId).toBe('solution');
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

  it('prioritizes active data AI privacy questions and maps PR9 presentation state', () => {
    const auditWithClinicPilot: SessionAuditView = {
      ...auditFixture,
      module_chats: [
        {
          chat_id: 'chat-solution',
          proposal_id: 'session-1',
          module: 'solution',
          chat_status: 'waiting_for_user',
          active_turn_id: 'solution-turn-1',
          turns: [
            {
              turn_id: 'solution-turn-1',
              chat_id: 'chat-solution',
              proposal_id: 'session-1',
              module: 'solution',
              turn_seq: 1,
              question_text: 'What does the solution do?',
              turn_status: 'awaiting_user',
              agent_status: 'continue',
              diagnosis: ['Falta definir la solucion.'],
              source_refs: [],
              gap_refs: [],
              audit_refs: [],
              warnings: [],
              created_at: '2026-05-24T14:31:00.000Z',
            },
          ],
          started_at: '2026-05-24T14:31:00.000Z',
          warnings: [],
        },
        {
          chat_id: 'chat-data',
          proposal_id: 'session-1',
          module: 'data_ai_privacy',
          chat_status: 'waiting_for_user',
          active_turn_id: 'data-turn-1',
          turns: [
            {
              turn_id: 'data-turn-1',
              chat_id: 'chat-data',
              proposal_id: 'session-1',
              module: 'data_ai_privacy',
              turn_seq: 1,
              question_text: 'Que datos personales o de salud trataria la propuesta?',
              turn_status: 'awaiting_user',
              agent_status: 'continue',
              diagnosis: ['Falta concretar datos y fuentes.'],
              source_refs: [],
              gap_refs: ['gap-data'],
              audit_refs: [{ kind: 'agent_run', id: 'run-data' }],
              warnings: ['requires competent human review'],
              created_at: '2026-05-24T14:40:00.000Z',
            },
          ],
          started_at: '2026-05-24T14:40:00.000Z',
          warnings: ['requires competent human review'],
        },
      ],
      generated_sections: [
        {
          section_id: 'section-solution',
          proposal_id: 'session-1',
          section_kind: 'solution',
          section_status: 'generated',
          section_version: 1,
          title: 'Solution definition',
          content_markdown: '## Solution\nThe solution is defined.',
          source_refs: [],
          gap_refs: [],
          warnings: [],
          created_at: '2026-05-24T14:35:00.000Z',
        },
        {
          section_id: 'section-data',
          proposal_id: 'session-1',
          section_kind: 'data_ai_privacy',
          section_status: 'generated',
          section_version: 1,
          title: 'Data, AI and privacy gaps',
          content_markdown: '## Review requirement\nrequires competent human review',
          source_refs: [],
          gap_refs: ['gap-data'],
          generated_by_run_id: 'run-data',
          warnings: ['requires competent human review'],
          created_at: '2026-05-24T14:45:00.000Z',
        },
      ],
    };

    const presentation = deriveSessionPresentation(auditWithClinicPilot);

    expect(presentation.currentDataAiPrivacyQuestion).toBe(
      'Que datos personales o de salud trataria la propuesta?',
    );
    expect(presentation.currentSolutionQuestion).toBe('What does the solution do?');
    expect(presentation.currentQuestion).toBe('Que datos personales o de salud trataria la propuesta?');
    expect(presentation.phaseProgress.currentPhaseId).toBe('data_ai_privacy');
    expect(presentation.dataAiPrivacyModuleChat?.chat_status).toBe('waiting_for_user');
    expect(presentation.latestSolutionSection?.section_id).toBe('section-solution');
    expect(presentation.latestDataAiPrivacySection).toMatchObject({
      section_id: 'section-data',
      title: 'Data, AI and privacy gaps',
    });
  });

  it('prioritizes active medical-device triage questions over earlier lanes', () => {
    const auditWithMedicalDeviceTriage: SessionAuditView = {
      ...auditFixture,
      module_chats: [
        {
          chat_id: 'chat-solution',
          proposal_id: 'session-1',
          module: 'solution',
          chat_status: 'waiting_for_user',
          active_turn_id: 'solution-turn-1',
          turns: [
            {
              turn_id: 'solution-turn-1',
              chat_id: 'chat-solution',
              proposal_id: 'session-1',
              module: 'solution',
              turn_seq: 1,
              question_text: 'What does the solution do?',
              turn_status: 'awaiting_user',
              agent_status: 'continue',
              diagnosis: ['Falta definir la solucion.'],
              source_refs: [],
              gap_refs: [],
              audit_refs: [],
              warnings: [],
              created_at: '2026-05-24T14:31:00.000Z',
            },
          ],
          started_at: '2026-05-24T14:31:00.000Z',
          warnings: [],
        },
        {
          chat_id: 'chat-data',
          proposal_id: 'session-1',
          module: 'data_ai_privacy',
          chat_status: 'waiting_for_user',
          active_turn_id: 'data-turn-1',
          turns: [
            {
              turn_id: 'data-turn-1',
              chat_id: 'chat-data',
              proposal_id: 'session-1',
              module: 'data_ai_privacy',
              turn_seq: 1,
              question_text: 'Que datos personales o de salud trataria la propuesta?',
              turn_status: 'awaiting_user',
              agent_status: 'continue',
              diagnosis: ['Falta concretar datos y fuentes.'],
              source_refs: [],
              gap_refs: ['gap-data'],
              audit_refs: [{ kind: 'agent_run', id: 'run-data' }],
              warnings: ['requires competent human review'],
              created_at: '2026-05-24T14:40:00.000Z',
            },
          ],
          started_at: '2026-05-24T14:40:00.000Z',
          warnings: ['requires competent human review'],
        },
        {
          chat_id: 'chat-medical-device',
          proposal_id: 'session-1',
          module: 'medical_device_triage',
          chat_status: 'waiting_for_user',
          active_turn_id: 'medical-device-turn-1',
          turns: [
            {
              turn_id: 'medical-device-turn-1',
              chat_id: 'chat-medical-device',
              proposal_id: 'session-1',
              module: 'medical_device_triage',
              turn_seq: 1,
              question_text: 'Que uso previsto deberia revisar una persona competente?',
              turn_status: 'awaiting_user',
              agent_status: 'continue',
              diagnosis: ['Falta aclarar uso previsto.'],
              source_refs: [],
              gap_refs: ['gap-medical-device'],
              audit_refs: [{ kind: 'agent_run', id: 'run-medical-device' }],
              warnings: ['requires competent human review'],
              created_at: '2026-05-24T14:50:00.000Z',
            },
          ],
          started_at: '2026-05-24T14:50:00.000Z',
          warnings: ['requires competent human review'],
        },
      ],
      generated_sections: [
        {
          section_id: 'section-data',
          proposal_id: 'session-1',
          section_kind: 'data_ai_privacy',
          section_status: 'generated',
          section_version: 1,
          title: 'Data, AI and privacy gaps',
          content_markdown: '## Review requirement\nrequires competent human review',
          source_refs: [],
          gap_refs: ['gap-data'],
          generated_by_run_id: 'run-data',
          warnings: ['requires competent human review'],
          created_at: '2026-05-24T14:45:00.000Z',
        },
        {
          section_id: 'section-medical-device',
          proposal_id: 'session-1',
          section_kind: 'medical_device_triage',
          section_status: 'generated',
          section_version: 1,
          title: 'Medical-device triage gaps and uncertainty',
          content_markdown: '## Review requirement\nrequires competent human review',
          source_refs: [],
          gap_refs: ['gap-medical-device'],
          generated_by_run_id: 'run-medical-device',
          warnings: ['requires competent human review'],
          created_at: '2026-05-24T14:55:00.000Z',
        },
      ],
    };

    const presentation = deriveSessionPresentation(auditWithMedicalDeviceTriage);

    expect(presentation.currentMedicalDeviceTriageQuestion).toBe(
      'Que uso previsto deberia revisar una persona competente?',
    );
    expect(presentation.currentDataAiPrivacyQuestion).toBe(
      'Que datos personales o de salud trataria la propuesta?',
    );
    expect(presentation.currentQuestion).toBe('Que uso previsto deberia revisar una persona competente?');
    expect(presentation.phaseProgress.currentPhaseId).toBe('medical_device_triage');
    expect(presentation.medicalDeviceTriageModuleChat?.chat_status).toBe('waiting_for_user');
    expect(presentation.latestMedicalDeviceTriageSection).toMatchObject({
      section_id: 'section-medical-device',
      title: 'Medical-device triage gaps and uncertainty',
    });
  });

  it('maps the PR9 start-ready state after solution completion', () => {
    const auditReadyForClinicPilot = resolvedProblemAudit({
      module_chats: [],
      generated_sections: [
        {
          section_id: 'section-solution',
          proposal_id: 'session-1',
          section_kind: 'solution',
          section_status: 'generated',
          section_version: 1,
          title: 'Solution definition',
          content_markdown: '## Solution\nThe solution is defined.',
          source_refs: [],
          gap_refs: [],
          warnings: [],
          created_at: '2026-05-24T14:35:00.000Z',
        },
      ],
    });

    const presentation = deriveSessionPresentation(auditReadyForClinicPilot);

    expect(presentation.latestSolutionSection?.section_id).toBe('section-solution');
    expect(presentation.dataAiPrivacyModuleChat).toBeNull();
    expect(presentation.currentDataAiPrivacyQuestion).toBe('');
    expect(presentation.latestDataAiPrivacySection).toBeNull();
    expect(presentation.phaseProgress.currentPhaseId).toBe('data_ai_privacy');
    expect(presentation.phaseProgress.steps.find((step) => step.id === 'data_ai_privacy')).toMatchObject({
      status: 'current',
      primaryAction: 'start_data_ai_privacy',
    });
    expect(presentation.phaseProgress.steps.find((step) => step.id === 'resources_pilot_viability')).toMatchObject({
      status: 'locked',
      lockedReason: 'Completa datos, privacidad y revisión sanitaria antes del piloto.',
      primaryAction: 'none',
    });
  });

  it('prefers the active module chat over an older completed chat for the same module', () => {
    const olderCompletedDataChat: ModuleChat = {
      ...completedModuleChat('data_ai_privacy'),
      chat_id: 'chat-data-completed',
      started_at: '2026-05-24T14:00:00.000Z',
      completed_at: '2026-05-24T14:10:00.000Z',
    };
    const newerWaitingDataChat: ModuleChat = {
      ...awaitingModuleChat('data_ai_privacy', 'Que dato sensible falta validar?'),
      chat_id: 'chat-data-waiting',
      started_at: '2026-05-24T14:40:00.000Z',
    };
    const presentation = deriveSessionPresentation(resolvedProblemAudit({
      generated_sections: [
        generatedSection('problem'),
        generatedSection('solution'),
      ],
      module_chats: [
        completedModuleChat('problem'),
        completedModuleChat('solution'),
        olderCompletedDataChat,
        newerWaitingDataChat,
      ],
    }));

    expect(presentation.dataAiPrivacyModuleChat?.chat_id).toBe('chat-data-waiting');
    expect(presentation.currentDataAiPrivacyQuestion).toBe('Que dato sensible falta validar?');
    expect(presentation.phaseProgress.currentPhaseId).toBe('data_ai_privacy');
    expect(presentation.phaseProgress.steps.find((step) => step.id === 'data_ai_privacy')).toMatchObject({
      status: 'current',
      primaryAction: 'answer_question',
    });
  });

  it('prioritizes active resources pilot viability questions and maps PR11 section state', () => {
    const auditWithResourcesPilot: SessionAuditView = {
      ...auditFixture,
      module_chats: [
        {
          chat_id: 'chat-medical-device',
          proposal_id: 'session-1',
          module: 'medical_device_triage',
          chat_status: 'waiting_for_user',
          active_turn_id: 'medical-device-turn-1',
          turns: [
            {
              turn_id: 'medical-device-turn-1',
              chat_id: 'chat-medical-device',
              proposal_id: 'session-1',
              module: 'medical_device_triage',
              turn_seq: 1,
              question_text: 'Que uso previsto deberia revisar una persona competente?',
              turn_status: 'awaiting_user',
              agent_status: 'continue',
              diagnosis: ['Falta aclarar uso previsto.'],
              source_refs: [],
              gap_refs: ['gap-medical-device'],
              audit_refs: [{ kind: 'agent_run', id: 'run-medical-device' }],
              warnings: ['requires competent human review'],
              created_at: '2026-05-24T14:50:00.000Z',
            },
          ],
          started_at: '2026-05-24T14:50:00.000Z',
          warnings: ['requires competent human review'],
        },
        {
          chat_id: 'chat-resources',
          proposal_id: 'session-1',
          module: 'resources_pilot_viability',
          chat_status: 'waiting_for_user',
          active_turn_id: 'resources-turn-1',
          turns: [
            {
              turn_id: 'resources-turn-1',
              chat_id: 'chat-resources',
              proposal_id: 'session-1',
              module: 'resources_pilot_viability',
              turn_seq: 1,
              question_text: 'What operational risks should be tracked before pilot launch?',
              turn_status: 'awaiting_user',
              agent_status: 'continue',
              diagnosis: ['Falta concretar riesgos operativos.'],
              source_refs: [],
              gap_refs: ['gap-resources'],
              audit_refs: [{ kind: 'agent_run', id: 'run-resources' }],
              warnings: ['This section is not a viability score, approval decision, ranking, or financial model.'],
              created_at: '2026-05-24T15:00:00.000Z',
            },
          ],
          started_at: '2026-05-24T15:00:00.000Z',
          warnings: ['This section is not a viability score, approval decision, ranking, or financial model.'],
        },
      ],
      generated_sections: [
        {
          section_id: 'section-solution',
          proposal_id: 'session-1',
          section_kind: 'solution',
          section_status: 'generated',
          section_version: 1,
          title: 'Solution definition',
          content_markdown: '## Solution\nThe solution is defined.',
          source_refs: [],
          gap_refs: [],
          warnings: [],
          created_at: '2026-05-24T14:35:00.000Z',
        },
        {
          section_id: 'section-resources',
          proposal_id: 'session-1',
          section_kind: 'resources_pilot_viability',
          section_status: 'generated',
          section_version: 1,
          title: 'Resources, pilot and viability readiness inputs',
          content_markdown: '## Boundary\nThis section is not a viability score, approval decision, ranking, or financial model.',
          source_refs: [],
          gap_refs: ['gap-resources'],
          generated_by_run_id: 'run-resources',
          warnings: ['This section is not a viability score, approval decision, ranking, or financial model.'],
          created_at: '2026-05-24T15:10:00.000Z',
        },
      ],
    };

    const presentation = deriveSessionPresentation(auditWithResourcesPilot);

    expect(presentation.currentResourcesPilotViabilityQuestion).toBe(
      'What operational risks should be tracked before pilot launch?',
    );
    expect(presentation.currentMedicalDeviceTriageQuestion).toBe(
      'Que uso previsto deberia revisar una persona competente?',
    );
    expect(presentation.currentQuestion).toBe('What operational risks should be tracked before pilot launch?');
    expect(presentation.phaseProgress.currentPhaseId).toBe('resources_pilot_viability');
    expect(presentation.resourcesPilotViabilityModuleChat?.chat_status).toBe('waiting_for_user');
    expect(presentation.latestResourcesPilotViabilitySection).toMatchObject({
      section_id: 'section-resources',
      title: 'Resources, pilot and viability readiness inputs',
    });
  });

  it('keeps a completed problem checklist from becoming whole-session maturity', () => {
    const presentation = deriveSessionPresentation(resolvedProblemAudit());

    expect(presentation.progress.percent).toBe(100);
    expect(presentation.phaseProgress.percent).toBeLessThan(100);
    expect(presentation.phaseProgress.currentPhaseId).toBe('solution');
    expect(presentation.phaseProgress.steps.find((step) => step.id === 'problem')).toMatchObject({
      status: 'complete',
    });
    expect(presentation.phaseProgress.steps.find((step) => step.id === 'solution')).toMatchObject({
      status: 'current',
      primaryAction: 'start_solution',
    });
  });

  it('locks report until the required prior phases are complete or skipped', () => {
    const presentation = deriveSessionPresentation(resolvedProblemAudit({
      generated_sections: [generatedSection('problem'), generatedSection('solution')],
      module_chats: [
        completedModuleChat('problem'),
        completedModuleChat('solution'),
      ],
    }));

    expect(presentation.phaseProgress.steps.find((step) => step.id === 'report')).toMatchObject({
      status: 'locked',
      lockedReason: expect.stringContaining('Datos y privacidad'),
    });
  });

  it('marks report ready once all prior phases are complete and no report exists', () => {
    const presentation = deriveSessionPresentation(auditWithAllSections());

    expect(presentation.phaseProgress.currentPhaseId).toBe('report');
    expect(presentation.phaseProgress.steps.find((step) => step.id === 'report')).toMatchObject({
      status: 'current',
      primaryAction: 'prepare_report',
    });
    expect(presentation.phaseProgress.steps.find((step) => step.id === 'pdf_export')).toMatchObject({
      status: 'locked',
    });
  });

  it('separates ready report and PDF export states', () => {
    const presentation = deriveSessionPresentation(auditWithAllSections(), {
      report: reportFixture(),
    });

    expect(presentation.phaseProgress.steps.find((step) => step.id === 'report')).toMatchObject({
      status: 'complete',
    });
    expect(presentation.phaseProgress.currentPhaseId).toBe('pdf_export');
    expect(presentation.phaseProgress.steps.find((step) => step.id === 'pdf_export')).toMatchObject({
      status: 'current',
      primaryAction: 'download_pdf',
    });
  });

  it('keeps the last known phase marked as recovering during request recovery', () => {
    const presentation = deriveSessionPresentation(auditWithAllSections(), {
      isRecovering: true,
      lastKnownPhaseId: 'data_ai_privacy',
    });

    expect(presentation.phaseProgress.currentPhaseId).toBe('data_ai_privacy');
    expect(presentation.phaseProgress.steps.find((step) => step.id === 'data_ai_privacy')).toMatchObject({
      status: 'recovering',
      primaryAction: 'recover',
    });
  });

  it('maps failed report composition to a recoverable report phase error', () => {
    const failedReportRun: AgentRun = {
      ...auditFixture.runs[1],
      id: 'run-report',
      run_purpose: 'basic_report_compose',
      status: 'model_failed',
    };

    const presentation = deriveSessionPresentation(auditWithAllSections({
      runs: [...auditFixture.runs, failedReportRun],
    }));
    const reportPhase = presentation.phaseProgress.steps.find((step) => step.id === 'report');

    expect(presentation.phaseProgress.currentPhaseId).toBe('report');
    expect(presentation.phaseProgress.currentPhaseLabel).toBe('Informe');
    expect(reportPhase).toMatchObject({
      status: 'error',
      primaryAction: 'recover',
    });
    expect(reportPhase).not.toMatchObject({
      status: 'ready',
      primaryAction: 'prepare_report',
    });
    expect(reportPhase).not.toMatchObject({
      status: 'current',
      primaryAction: 'prepare_report',
    });
  });

  it('maps reports that need revision to a recoverable report phase error', () => {
    const presentation = deriveSessionPresentation(auditWithAllSections(), {
      report: reportFixture({ report_status: 'needs_revision' }),
    });
    const reportPhase = presentation.phaseProgress.steps.find((step) => step.id === 'report');

    expect(presentation.phaseProgress.currentPhaseId).toBe('report');
    expect(presentation.phaseProgress.currentPhaseLabel).toBe('Informe');
    expect(reportPhase).toMatchObject({
      status: 'error',
      primaryAction: 'recover',
    });
    expect(reportPhase).not.toMatchObject({
      status: 'ready',
      primaryAction: 'prepare_report',
    });
    expect(reportPhase).not.toMatchObject({
      status: 'current',
      primaryAction: 'review_report',
    });
    expect(presentation.phaseProgress.steps.find((step) => step.id === 'pdf_export')).toMatchObject({
      status: 'locked',
      primaryAction: 'none',
    });
  });

  it('marks PDF export complete only from transient frontend success state', () => {
    const presentation = deriveSessionPresentation(auditWithAllSections(), {
      report: reportFixture(),
      hasDownloadedReportPdf: true,
    });

    expect(presentation.phaseProgress.steps.find((step) => step.id === 'pdf_export')).toMatchObject({
      status: 'complete',
    });
    expect(presentation.phaseProgress.isComplete).toBe(true);
  });

  it('does not treat superseded-only generated sections as complete', () => {
    const presentation = deriveSessionPresentation(resolvedProblemAudit({
      generated_sections: [
        generatedSection('problem'),
        generatedSection('solution', {
          section_status: 'superseded',
        }),
      ],
      module_chats: [completedModuleChat('problem')],
    }));

    expect(presentation.latestSolutionSection).toBeNull();
    expect(presentation.phaseProgress.currentPhaseId).toBe('solution');
    expect(presentation.phaseProgress.steps.find((step) => step.id === 'solution')).toMatchObject({
      status: 'current',
    });
  });

  it('maps failed module state to phase error', () => {
    const failedChat: ModuleChat = {
      ...awaitingModuleChat('solution', 'What failed?'),
      chat_status: 'failed',
      active_turn_id: undefined,
      turns: [],
    };

    const presentation = deriveSessionPresentation(resolvedProblemAudit({
      generated_sections: [generatedSection('problem')],
      module_chats: [completedModuleChat('problem'), failedChat],
    }));

    expect(presentation.phaseProgress.currentPhaseId).toBe('solution');
    expect(presentation.phaseProgress.steps.find((step) => step.id === 'solution')).toMatchObject({
      status: 'error',
      primaryAction: 'recover',
    });
  });

  it('treats an interrupted solution start as ready to retry', () => {
    const orphanSolutionChat: ModuleChat = {
      chat_id: 'chat-solution-orphan',
      proposal_id: 'session-1',
      module: 'solution',
      chat_status: 'active',
      active_turn_id: undefined,
      warnings: [],
      started_at: '2026-05-24T14:30:00.000Z',
      completed_at: undefined,
      turns: [],
    };

    const presentation = deriveSessionPresentation(resolvedProblemAudit({
      generated_sections: [generatedSection('problem')],
      module_chats: [completedModuleChat('problem'), orphanSolutionChat],
    }));

    expect(presentation.phaseProgress.currentPhaseId).toBe('solution');
    expect(presentation.phaseProgress.steps.find((step) => step.id === 'solution')).toMatchObject({
      status: 'current',
      primaryAction: 'start_solution',
      explanation: 'El inicio de esta fase se interrumpió. Puedes reintentarlo.',
    });
  });

  it('requires an explicit audited fact for medical-device not-applicable', () => {
    const withoutExplicitFact = deriveSessionPresentation(resolvedProblemAudit({
      generated_sections: [
        generatedSection('problem'),
        generatedSection('solution'),
        generatedSection('data_ai_privacy'),
      ],
      module_chats: [
        completedModuleChat('problem'),
        completedModuleChat('solution'),
        completedModuleChat('data_ai_privacy'),
      ],
    }));

    expect(withoutExplicitFact.phaseProgress.steps.find((step) => step.id === 'medical_device_triage')).toMatchObject({
      status: 'current',
    });

    const notApplicableRun: AgentRun = {
      ...auditFixture.runs[1],
      id: 'run-medical-device',
      run_purpose: 'medical_device_triage',
      validated_output_json: {
        updated_medical_device_triage: {
          triage_status: 'not_applicable',
        },
      },
      status: 'completed',
    };
    const withExplicitFact = deriveSessionPresentation(resolvedProblemAudit({
      generated_sections: [
        generatedSection('problem'),
        generatedSection('solution'),
        generatedSection('data_ai_privacy'),
      ],
      module_chats: [
        completedModuleChat('problem'),
        completedModuleChat('solution'),
        completedModuleChat('data_ai_privacy'),
      ],
      runs: [...auditFixture.runs, notApplicableRun],
    }));

    expect(withExplicitFact.phaseProgress.steps.find((step) => step.id === 'medical_device_triage')).toMatchObject({
      status: 'not_applicable',
    });
    expect(withExplicitFact.phaseProgress.currentPhaseId).toBe('resources_pilot_viability');
  });

  it('counts open and resolved gaps by phase without counting not-applicable gaps', () => {
    const gaps: AlphaGap[] = [
      {
        gap_id: 'gap-open',
        proposal_id: 'session-1',
        module: 'solution',
        gap_kind: 'missing_information',
        gap_status: 'open',
        origin: 'system_rule',
        field: 'workflow_change',
        description: 'Falta explicar el cambio de flujo.',
        absence: {
          is_absent: true,
          checked_fields: ['workflow_change'],
          reason: 'No aparece en la sección.',
        },
        source_refs: [],
        audit_refs: [],
        warnings: [],
        created_at: '2026-05-24T14:00:00.000Z',
        updated_at: '2026-05-24T14:00:00.000Z',
      },
      {
        gap_id: 'gap-resolved',
        proposal_id: 'session-1',
        module: 'solution',
        gap_kind: 'missing_information',
        gap_status: 'resolved',
        origin: 'system_rule',
        field: 'target_user',
        description: 'Usuario aclarado.',
        absence: {
          is_absent: false,
          checked_fields: ['target_user'],
          reason: 'Resuelto por turno.',
        },
        source_refs: [],
        audit_refs: [],
        warnings: [],
        created_at: '2026-05-24T14:00:00.000Z',
        updated_at: '2026-05-24T14:00:00.000Z',
      },
      {
        gap_id: 'gap-na',
        proposal_id: 'session-1',
        module: 'solution',
        gap_kind: 'missing_information',
        gap_status: 'not_applicable',
        origin: 'system_rule',
        field: 'scope_limits',
        description: 'No aplica.',
        absence: {
          is_absent: false,
          checked_fields: ['scope_limits'],
          reason: 'No aplica.',
        },
        source_refs: [],
        audit_refs: [],
        warnings: [],
        created_at: '2026-05-24T14:00:00.000Z',
        updated_at: '2026-05-24T14:00:00.000Z',
      },
    ];

    const presentation = deriveSessionPresentation(resolvedProblemAudit({
      gaps,
      generated_sections: [generatedSection('problem')],
      module_chats: [completedModuleChat('problem')],
    }));

    expect(presentation.phaseProgress.steps.find((step) => step.id === 'solution')).toMatchObject({
      openGapsCount: 1,
      resolvedGapsCount: 1,
    });
  });

  it('keeps resolved module turns in conversation history for the active phase', () => {
    const presentation = deriveSessionPresentation(resolvedProblemAudit({
      module_chats: [
        completedModuleChat('problem'),
        {
          chat_id: 'chat-solution',
          proposal_id: 'session-1',
          module: 'solution',
          chat_status: 'waiting_for_user',
          active_turn_id: 'solution-turn-2',
          turns: [
            {
              turn_id: 'solution-turn-1',
              chat_id: 'chat-solution',
              proposal_id: 'session-1',
              module: 'solution',
              turn_seq: 1,
              question_text: 'Que hace la solucion propuesta en terminos concretos?',
              answer_text: 'no lo se',
              turn_status: 'resolved',
              agent_status: 'continue',
              diagnosis: ['La respuesta sigue siendo vaga.'],
              source_refs: [],
              gap_refs: [],
              audit_refs: [],
              warnings: [],
              created_at: '2026-05-24T14:31:00.000Z',
              completed_at: '2026-05-24T14:32:00.000Z',
            },
            {
              turn_id: 'solution-turn-2',
              chat_id: 'chat-solution',
              proposal_id: 'session-1',
              module: 'solution',
              turn_seq: 2,
              question_text: 'En una frase operativa, que hace la solucion en el dia a dia?',
              turn_status: 'awaiting_user',
              agent_status: 'continue',
              diagnosis: ['Falta definir la solucion.'],
              source_refs: [],
              gap_refs: [],
              audit_refs: [],
              warnings: [],
              created_at: '2026-05-24T14:32:00.000Z',
            },
          ],
          started_at: '2026-05-24T14:31:00.000Z',
          warnings: [],
        },
      ],
      generated_sections: [
        generatedSection('problem'),
      ],
    }));

    expect(presentation.conversationHistoryTurns).toEqual([
      expect.objectContaining({
        turn_seq: 1,
        question_text: 'Que hace la solucion propuesta en terminos concretos?',
        answer_text: 'no lo se',
        status: 'resolved',
      }),
      expect.objectContaining({
        turn_seq: 2,
        question_text: 'En una frase operativa, que hace la solucion en el dia a dia?',
        status: 'awaiting_user',
      }),
    ]);
    expect(presentation.conversationHistoryByPhase.problem?.length).toBeGreaterThan(0);
    expect(presentation.conversationHistoryByPhase.solution).toHaveLength(2);
  });
});
