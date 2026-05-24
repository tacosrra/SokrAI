import { describe, expect, it } from 'vitest';

import {
  parseProposalReplyResponse,
  parseProposalStartResponse,
  parseRequestExecutionResponse,
  parseSessionAuditView,
} from './validation';

const structuredBrief = {
  project_title: 'Triage',
  goal: 'Goal',
  target_user: '',
  problem_owner: '',
  problem_statement: '',
  evidence_of_problem: '',
  current_alternatives: '',
  scope: '',
  constraints_known: [],
  assumptions: [],
  ambiguities: [],
  missing_information: [],
};

const validAgentRun = {
  id: 'run-1',
  session_id: 'session-1',
  turn_seq: null,
  request_id: 'req-1',
  run_purpose: 'problem_definition',
  agent_name: 'problem_definition_agent',
  prompt_name: 'problem-definition-agent',
  prompt_version: 'v1',
  prompt_sha256: 'a'.repeat(64),
  model_provider: 'ollama',
  model_name: 'qwen2.5:3b-instruct',
  model_params_json: {
    temperature: 0.2,
    num_ctx: 4096,
    keep_alive: '30m',
  },
  raw_model_output: '{"agent_status":"continue"}',
  validated_output_json: {
    agent_status: 'continue',
  },
  status: 'completed',
};

const validAlphaGap = {
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
};

function createAuditView(runs: unknown[] = []) {
  return {
    session: {
      id: 'session-1',
      project_title: 'Triage',
      goal: 'Goal',
      current_stage: 'problem_definition',
      current_agent: 'problem_definition_agent',
      status: 'waiting_for_user',
      current_turn_seq: 1,
      state_version: 1,
      latest_structured_brief_json: structuredBrief,
      latest_problem_definition_json: {},
      latest_snapshot_id: null,
      latest_successful_run_id: null,
      completion_reason: null,
    },
    documents: [],
    sources: [],
    gaps: [],
    turns: [],
    runs,
    snapshots: [],
    events: [],
  };
}

describe('parseProposalStartResponse', () => {
  it('accepts payloads aligned with the canonical contract', () => {
    const response = parseProposalStartResponse({
      session_id: 'session-1',
      stage: 'problem_definition',
      structured_brief: {
        project_title: 'Triage IA en Urgencias',
        goal: 'Definir mejor el problema',
        target_user: 'Enfermería de admisión',
        problem_owner: '',
        problem_statement: 'El triaje se retrasa en horas punta.',
        evidence_of_problem: 'Esperas de 20 a 35 minutos.',
        current_alternatives: 'Protocolo manual.',
        scope: 'Urgencias de adultos.',
        constraints_known: [],
        assumptions: [],
        ambiguities: ['No está claro el responsable operativo.'],
        missing_information: ['problem_owner'],
      },
      detected_gaps: ['problem_owner'],
      next_question: '¿Qué equipo responde hoy por este problema?',
      agent_status: 'continue',
      warnings: [],
    });

    expect(response.stage).toBe('problem_definition');
    expect(response.structured_brief.problem_statement).toContain('triaje');
  });

  it('rejects malformed payloads early', () => {
    expect(() =>
      parseProposalStartResponse({
        session_id: 'session-1',
        stage: 'problem_definition',
        structured_brief: {},
        detected_gaps: [],
        next_question: '¿Qué equipo responde hoy por este problema?',
        agent_status: 'continue',
        warnings: [],
      }),
    ).toThrow(/structured_brief/);
  });

  it('unwraps nested response bodies produced by proxies or workflow wrappers', () => {
    const response = parseProposalStartResponse({
      data: JSON.stringify({
        session_id: 'session-1',
        stage: 'problem_definition',
        structured_brief: {
          project_title: 'Triage IA en Urgencias',
          goal: 'Definir mejor el problema',
          target_user: 'Enfermería de admisión',
          problem_owner: '',
          problem_statement: 'El triaje se retrasa en horas punta.',
          evidence_of_problem: 'Esperas de 20 a 35 minutos.',
          current_alternatives: 'Protocolo manual.',
          scope: 'Urgencias de adultos.',
          constraints_known: [],
          assumptions: [],
          ambiguities: [],
          missing_information: [],
        },
        next_question: '¿Qué equipo responde hoy por este problema?',
        agent_status: 'continue',
      }),
    });

    expect(response.session_id).toBe('session-1');
    expect(response.detected_gaps).toEqual([]);
    expect(response.warnings).toEqual([]);
  });
});

describe('parseProposalReplyResponse', () => {
  it('accepts null completion_reason and missing warnings from older payloads', () => {
    const response = parseProposalReplyResponse({
      body: {
        session_id: 'session-1',
        stage: 'problem_definition',
        agent_status: 'continue',
        updated_problem_definition: {
          problem_owner: '',
          problem_statement: 'El triaje se retrasa.',
          evidence_of_problem: 'Esperas de 20 minutos.',
          scope: 'Urgencias.',
          current_alternatives: 'Protocolo manual.',
          assumptions: [],
          ambiguities_remaining: ['Falta concretar la causa operativa.'],
        },
        diagnosis: ['Falta concretar la causa operativa.'],
        next_question: '¿Qué equipo responde hoy por este cuello de botella?',
        completion_reason: null,
      },
    });

    expect(response.completion_reason).toBe('');
    expect(response.warnings).toEqual([]);
    expect(response.updated_problem_definition.problem_statement).toContain('triaje');
  });
});

describe('parseSessionAuditView', () => {
  it('accepts agent run model metadata fields', () => {
    const audit = parseSessionAuditView(createAuditView([validAgentRun]));

    expect(audit.runs[0]?.model_provider).toBe('ollama');
    expect(audit.runs[0]?.model_name).toBe('qwen2.5:3b-instruct');
    expect(audit.runs[0]?.model_params_json).toMatchObject({
      temperature: 0.2,
      num_ctx: 4096,
      keep_alive: '30m',
    });
  });

  it.each([
    ['model_provider', 42, /runs\[0\]\.model_provider/],
    ['model_name', null, /runs\[0\]\.model_name/],
    ['model_params_json', 'not-json', /runs\[0\]\.model_params_json/],
  ])('rejects invalid agent run %s', (fieldName, invalidValue, expectedError) => {
    expect(() =>
      parseSessionAuditView(
        createAuditView([
          {
            ...validAgentRun,
            [fieldName]: invalidValue,
          },
        ]),
      ),
    ).toThrow(expectedError);
  });

  it('accepts numeric fields serialized as strings by the API', () => {
    const audit = parseSessionAuditView({
      session: {
        id: 'session-1',
        project_title: 'Triage',
        goal: 'Goal',
        current_stage: 'problem_definition',
        current_agent: 'problem_definition_agent',
        status: 'waiting_for_user',
        current_turn_seq: 1,
        state_version: '1',
        latest_structured_brief_json: {
          project_title: 'Triage',
          goal: 'Goal',
          target_user: '',
          problem_owner: '',
          problem_statement: '',
          evidence_of_problem: '',
          current_alternatives: '',
          scope: '',
          constraints_known: [],
          assumptions: [],
          ambiguities: [],
          missing_information: [],
        },
        latest_problem_definition_json: {
          problem_owner: '',
          problem_statement: '',
          evidence_of_problem: '',
          scope: '',
          current_alternatives: '',
          assumptions: [],
          ambiguities_remaining: [],
        },
        latest_snapshot_id: 'snapshot-1',
        latest_successful_run_id: 'run-1',
        completion_reason: null,
      },
      documents: [],
      sources: [],
      gaps: [],
      turns: [],
      runs: [],
      snapshots: [
        {
          id: 'snapshot-1',
          session_id: 'session-1',
          snapshot_seq: '1',
          state_version: '1',
          source_turn_seq: null,
          source_run_id: 'run-1',
          structured_brief_json: {
            project_title: 'Triage',
            goal: 'Goal',
            target_user: '',
            problem_owner: '',
            problem_statement: '',
            evidence_of_problem: '',
            current_alternatives: '',
            scope: '',
            constraints_known: [],
            assumptions: [],
            ambiguities: [],
            missing_information: [],
          },
          current_problem_definition_json: {
            problem_owner: '',
            problem_statement: '',
            evidence_of_problem: '',
            scope: '',
            current_alternatives: '',
            assumptions: [],
            ambiguities_remaining: [],
          },
          detected_gaps_json: [],
          next_question_text: '¿Qué pasa?',
          agent_status: 'continue',
          completion_reason: null,
          warnings_json: [],
        },
      ],
      events: [
        {
          id: 'event-1',
          session_id: 'session-1',
          turn_seq: null,
          run_id: null,
          event_seq: '1',
          event_type: 'session_created',
          actor_type: 'workflow',
          request_id: 'req-1',
          payload_json: {},
        },
      ],
    });

    expect(audit.session.state_version).toBe(1);
    expect(audit.snapshots[0]?.snapshot_seq).toBe(1);
    expect(audit.events[0]?.event_seq).toBe(1);
  });

  it('unwraps enveloped payloads and tolerates omitted legacy array sections', () => {
    const audit = parseSessionAuditView({
      payload: {
        session: {
          id: 'session-2',
          project_title: 'Triage',
          goal: 'Goal',
          current_stage: 'problem_definition',
          current_agent: 'problem_definition_agent',
          status: 'waiting_for_user',
          current_turn_seq: 1,
          state_version: 1,
          latest_structured_brief_json: {
            project_title: 'Triage',
            goal: 'Goal',
            target_user: '',
            problem_owner: '',
            problem_statement: '',
            evidence_of_problem: '',
            current_alternatives: '',
            scope: '',
            constraints_known: [],
            assumptions: [],
            ambiguities: [],
            missing_information: [],
          },
          latest_problem_definition_json: {},
          latest_snapshot_id: null,
          latest_successful_run_id: null,
          completion_reason: null,
        },
        documents: [],
        sources: [],
        gaps: [],
      },
    });

    expect(audit.session.id).toBe('session-2');
    expect(audit.turns).toEqual([]);
    expect(audit.runs).toEqual([]);
    expect(audit.snapshots).toEqual([]);
    expect(audit.events).toEqual([]);
  });

  it('rejects audit payloads missing documents', () => {
    const { documents: _documents, ...payload } = createAuditView();

    expect(() => parseSessionAuditView(payload)).toThrow(/session audit view\.documents/);
  });

  it('rejects audit payloads missing sources', () => {
    const { sources: _sources, ...payload } = createAuditView();

    expect(() => parseSessionAuditView(payload)).toThrow(/session audit view\.sources/);
  });

  it('rejects audit payloads missing required gaps', () => {
    const { gaps: _gaps, ...payload } = createAuditView();

    expect(() => parseSessionAuditView(payload)).toThrow(/session audit view\.gaps/);
  });

  it('parses valid structured gaps', () => {
    const audit = parseSessionAuditView({
      ...createAuditView(),
      gaps: [validAlphaGap],
    });

    expect(audit.gaps[0]).toMatchObject({
      gap_id: 'gap-1',
      origin: 'structured_brief_field',
      absence: {
        is_absent: true,
        checked_fields: ['evidence_of_problem'],
      },
    });
  });

  it('rejects malformed structured gaps', () => {
    expect(() =>
      parseSessionAuditView({
        ...createAuditView(),
        gaps: [
          {
            ...validAlphaGap,
            absence: {
              is_absent: 'yes',
              checked_fields: ['evidence_of_problem'],
              reason: 'Invalid boolean should fail.',
            },
          },
        ],
      }),
    ).toThrow(/session audit view\.gaps\[0\]\.absence\.is_absent/);
  });

  it('parses document and source audit sections', () => {
    const audit = parseSessionAuditView({
      session: {
        id: 'session-3',
        project_title: 'Triage',
        goal: 'Goal',
        current_stage: 'problem_definition',
        current_agent: 'problem_definition_agent',
        status: 'waiting_for_user',
        current_turn_seq: 1,
        state_version: 1,
        latest_structured_brief_json: {
          project_title: 'Triage',
          goal: 'Goal',
          target_user: '',
          problem_owner: '',
          problem_statement: '',
          evidence_of_problem: '',
          current_alternatives: '',
          scope: '',
          constraints_known: [],
          assumptions: [],
          ambiguities: [],
          missing_information: [],
        },
        latest_problem_definition_json: {},
        latest_snapshot_id: null,
        latest_successful_run_id: null,
        completion_reason: null,
      },
      documents: [
        {
          document_id: 'doc-1',
          proposal_id: 'session-3',
          source_kind: 'uploaded_file',
          document_status: 'received',
          file_name: 'intake.pdf',
          mime_type: 'application/pdf',
          sha256: 'a'.repeat(64),
          warnings: [],
          created_at: '2026-05-24T20:00:00.000Z',
          metadata: { page_count: 1 },
        },
      ],
      sources: [
        {
          source_id: 'src-1',
          source_kind: 'extracted_text',
          label: 'Extracted PDF text: intake.pdf',
          document_id: 'doc-1',
          span: { start_char: 0, end_char: 24 },
          created_at: '2026-05-24T20:00:00.000Z',
          metadata: { role: 'extracted_pdf_text' },
        },
      ],
      gaps: [],
      turns: [],
      runs: [],
      snapshots: [],
      events: [],
    });

    expect(audit.documents[0]?.file_name).toBe('intake.pdf');
    expect(audit.sources[0]?.span?.end_char).toBe(24);
  });
});

describe('parseRequestExecutionResponse', () => {
  it('accepts completed recovery payloads with session_id', () => {
    const response = parseRequestExecutionResponse({
      request_id: 'web-start-1',
      request_kind: 'proposal_start',
      status: 'completed',
      session_id: 'session-1',
    });

    expect(response.request_kind).toBe('proposal_start');
    expect(response.session_id).toBe('session-1');
  });

  it('accepts failed recovery payloads with error details', () => {
    const response = parseRequestExecutionResponse({
      request_id: 'web-reply-1',
      request_kind: 'proposal_reply',
      status: 'failed',
      session_id: 'session-1',
      error_code: 'ollama_timeout',
      safe_message: 'The local model exceeded the configured timeout',
      retryable: true,
    });

    expect(response.status).toBe('failed');
    expect(response.error_code).toBe('ollama_timeout');
    expect(response.retryable).toBe(true);
  });

  it('unwraps response envelopes when the recovery endpoint is proxied', () => {
    const response = parseRequestExecutionResponse({
      response: {
        request_id: 'web-reply-2',
        request_kind: 'proposal_reply',
        status: 'pending',
      },
    });

    expect(response.status).toBe('pending');
  });
});
