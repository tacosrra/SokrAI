import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchBasicAlphaReport,
  recoverRequestExecution,
  replyDataAiPrivacy,
  replySolution,
  startDataAiPrivacy,
  startSession,
  startSolution,
} from './api';

const REQUEST_STATUS_RESPONSE = {
  request_id: 'web-start-1',
  request_kind: 'proposal_start',
  status: 'pending',
};

const START_RESPONSE = {
  session_id: 'session-1',
  stage: 'problem_definition',
  structured_brief: {
    project_title: 'Triage IA en Urgencias',
    goal: 'Definir mejor el problema',
    target_user: 'Enfermeria de admision',
    problem_owner: '',
    problem_statement: 'El triaje se retrasa en horas punta.',
    evidence_of_problem: 'Esperas de 20 a 35 minutos.',
    current_alternatives: 'Protocolo manual.',
    scope: 'Urgencias de adultos.',
    constraints_known: [],
    assumptions: [],
    ambiguities: ['No esta claro el responsable operativo.'],
    missing_information: ['problem_owner'],
  },
  detected_gaps: ['problem_owner'],
  next_question: 'Que equipo responde hoy por este problema?',
  agent_status: 'continue',
  warnings: [],
};

const SOLUTION_START_RESPONSE = {
  session_id: 'session-1',
  stage: 'solution_definition',
  agent_status: 'continue',
  updated_solution_definition: {
    solution_summary: '',
    target_user: 'Enfermeria de admision',
    how_it_works: '',
    workflow_change: '',
    current_solutions: '',
    value_differential: '',
    scope_limits: '',
    assumptions: [],
    ambiguities_remaining: [],
  },
  diagnosis: ['Falta definir la solucion.'],
  next_question: 'Que hace la solucion propuesta?',
  completion_reason: '',
  warnings: [],
};

const SOLUTION_REPLY_RESPONSE = {
  session_id: 'session-1',
  stage: 'solution_definition',
  agent_status: 'done',
  updated_solution_definition: {
    solution_summary: 'A guided intake assistant prepares structured triage handoff notes.',
    target_user: 'Enfermeria de admision',
    how_it_works: 'It asks bounded questions and prepares a structured summary.',
    workflow_change: 'Nurses review a structured handoff before continuing triage.',
    current_solutions: 'Current work relies on manual notes.',
    value_differential: 'The handoff is more consistent without replacing judgement.',
    scope_limits: 'The first version covers adult emergency intake.',
    assumptions: ['Staff can answer guided questions during intake.'],
    ambiguities_remaining: [],
  },
  diagnosis: ['La solucion queda definida para Alpha.'],
  next_question: '',
  completion_reason: 'solution sufficiently defined',
  warnings: [],
};

const DATA_AI_PRIVACY_STATE = {
  personal_or_health_data: 'The pilot uses administrative intake text and staff notes.',
  data_sources: 'Data comes from fictitious intake forms and staff summaries.',
  ai_system_role: 'The AI drafts a structured summary for competent human review.',
  validation_evidence: 'The team will compare draft summaries with staff-written references.',
  privacy_governance: 'Privacy and governance owners review the data use before pilot operation.',
  cybersecurity_controls: 'Access is limited to pilot staff and activity is traceable.',
  regulatory_context: 'Regulatory implications remain open questions for competent human review.',
  human_review_plan: 'Privacy, clinical governance, and regulatory owners review before use.',
  assumptions: ['Every generated output is reviewed by a competent person.'],
  uncertainties: ['The final governance sign-off path remains open.'],
  requires_competent_human_review: true,
};

const DATA_AI_PRIVACY_START_RESPONSE = {
  session_id: 'session-1',
  stage: 'data_ai_privacy',
  profile_id: 'hospital_clinic_v1',
  agent_status: 'continue',
  updated_data_ai_privacy: DATA_AI_PRIVACY_STATE,
  diagnosis: ['Falta concretar fuentes de datos.'],
  next_question: 'Que datos personales o de salud trataria la propuesta?',
  completion_reason: '',
  warnings: ['requires competent human review'],
};

const DATA_AI_PRIVACY_REPLY_RESPONSE = {
  ...DATA_AI_PRIVACY_START_RESPONSE,
  agent_status: 'done',
  diagnosis: ['Los gaps quedan suficientemente claros para revision humana.'],
  next_question: '',
  completion_reason: 'data AI privacy gaps sufficiently clarified for human review',
};

const BASIC_ALPHA_REPORT_RESPONSE = {
  report_id: 'report-1',
  proposal_id: 'session-1',
  report_status: 'ready',
  schema_version: 'basic-alpha-report.v1',
  structured_brief: START_RESPONSE.structured_brief,
  current_gaps: [],
  problem_section: {
    section_id: 'section-problem',
    proposal_id: 'session-1',
    section_kind: 'problem',
    section_status: 'generated',
    section_version: 1,
    title: 'Problem definition',
    content_markdown: '## Problem\nThe problem is defined.',
    source_refs: [],
    gap_refs: [],
    generated_by_run_id: 'run-problem',
    warnings: [],
    created_at: '2026-05-25T12:00:00.000Z',
  },
  solution_section: {
    section_id: 'section-solution',
    proposal_id: 'session-1',
    section_kind: 'solution',
    section_status: 'generated',
    section_version: 1,
    title: 'Solution definition',
    content_markdown: '## Solution\nThe solution is defined.',
    source_refs: [],
    gap_refs: [],
    generated_by_run_id: 'run-solution',
    warnings: [],
    created_at: '2026-05-25T12:00:00.000Z',
  },
  internal_sources: [],
  audit_refs: [{ kind: 'agent_run', id: 'run-problem' }],
  warnings: [
    'This Alpha report is not a dictamen and must not be used as one.',
    'This Alpha report does not approve, reject, rank, or prioritize the proposal.',
    'This Alpha report is not a legal, clinical, or regulatory decision.',
  ],
  generated_at: '2026-05-25T12:00:00.000Z',
};

const originalFetch = globalThis.fetch;
const originalWindow = (globalThis as { window?: unknown }).window;

function stubGlobal(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  });
}

describe('requestJson transport options', () => {
  beforeEach(() => {
    stubGlobal('window', globalThis);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, 'fetch', {
      value: originalFetch,
      configurable: true,
      writable: true,
    });

    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      stubGlobal('window', originalWindow);
    }
  });

  it('omits content-type and body when active recovery posts without a payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(REQUEST_STATUS_RESPONSE), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );
    stubGlobal('fetch', fetchMock);

    await recoverRequestExecution('web-start-1');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe('/api/v1/requests/web-start-1/recover');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      'x-request-id': 'web-start-1',
    });
    expect(init.body).toBeUndefined();
  });

  it('still sends JSON headers and body when the request includes a payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(START_RESPONSE), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );
    stubGlobal('fetch', fetchMock);

    await startSession({
      request_id: 'web-start-1',
      project_title: 'Triage IA en Urgencias',
      goal: 'Reducir tiempos de espera',
      proposal_text: 'Necesitamos reducir retrasos en la admision.',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe('/webhook/proposal-start-v1');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      'x-request-id': 'web-start-1',
    });
    expect(typeof init.body).toBe('string');
  });

  it('posts solution start payloads to the solution webhook', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(SOLUTION_START_RESPONSE), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );
    stubGlobal('fetch', fetchMock);

    await startSolution({
      request_id: 'web-solution-start-1',
      session_id: 'session-1',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe('/webhook/solution-start-v1');
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      'x-request-id': 'web-solution-start-1',
    });
  });

  it('posts solution reply payloads to the solution reply webhook', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(SOLUTION_REPLY_RESPONSE), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );
    stubGlobal('fetch', fetchMock);

    const result = await replySolution({
      request_id: 'web-solution-reply-1',
      session_id: 'session-1',
      answer: 'The solution changes intake by preparing a structured handoff.',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe('/webhook/solution-reply-v1');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      'x-request-id': 'web-solution-reply-1',
    });
    expect(JSON.parse(String(init.body))).toEqual({
      request_id: 'web-solution-reply-1',
      session_id: 'session-1',
      answer: 'The solution changes intake by preparing a structured handoff.',
    });
    expect(result).toEqual(SOLUTION_REPLY_RESPONSE);
  });

  it('rejects solution reply responses that do not match the response parser', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ...SOLUTION_REPLY_RESPONSE,
          updated_solution_definition: {
            ...SOLUTION_REPLY_RESPONSE.updated_solution_definition,
            assumptions: 'not-an-array',
          },
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
    );
    stubGlobal('fetch', fetchMock);

    await expect(
      replySolution({
        request_id: 'web-solution-reply-2',
        session_id: 'session-1',
        answer: 'The solution changes intake by preparing a structured handoff.',
      }),
    ).rejects.toMatchObject({
      errorCode: 'invalid_response_contract',
      statusCode: 502,
    });
  });

  it('posts data AI privacy start payloads to the PR9 webhook with request id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DATA_AI_PRIVACY_START_RESPONSE), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );
    stubGlobal('fetch', fetchMock);

    const result = await startDataAiPrivacy({
      request_id: 'web-data-start-1',
      session_id: 'session-1',
      profile_id: 'hospital_clinic_v1',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe('/webhook/data-ai-privacy-start-v1');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      'x-request-id': 'web-data-start-1',
    });
    expect(JSON.parse(String(init.body))).toEqual({
      request_id: 'web-data-start-1',
      session_id: 'session-1',
      profile_id: 'hospital_clinic_v1',
    });
    expect(result).toEqual(DATA_AI_PRIVACY_START_RESPONSE);
  });

  it('posts data AI privacy reply payloads to the PR9 webhook with request id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DATA_AI_PRIVACY_REPLY_RESPONSE), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );
    stubGlobal('fetch', fetchMock);

    const result = await replyDataAiPrivacy({
      request_id: 'web-data-reply-1',
      session_id: 'session-1',
      answer: 'Privacy and governance owners review the pilot before operation.',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe('/webhook/data-ai-privacy-reply-v1');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      'x-request-id': 'web-data-reply-1',
    });
    expect(JSON.parse(String(init.body))).toEqual({
      request_id: 'web-data-reply-1',
      session_id: 'session-1',
      answer: 'Privacy and governance owners review the pilot before operation.',
    });
    expect(result).toEqual(DATA_AI_PRIVACY_REPLY_RESPONSE);
  });

  it('rejects data AI privacy responses that do not match the response parser', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ...DATA_AI_PRIVACY_START_RESPONSE,
          profile_id: 'unsupported_profile',
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
    );
    stubGlobal('fetch', fetchMock);

    await expect(
      startDataAiPrivacy({
        request_id: 'web-data-start-invalid',
        session_id: 'session-1',
        profile_id: 'hospital_clinic_v1',
      }),
    ).rejects.toMatchObject({
      errorCode: 'invalid_response_contract',
      statusCode: 502,
    });
  });

  it('fetches a Basic Alpha report from the session report endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(BASIC_ALPHA_REPORT_RESPONSE), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );
    stubGlobal('fetch', fetchMock);

    const result = await fetchBasicAlphaReport('session-1');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe('/api/v1/sessions/session-1/report');
    expect(init.method).toBe('GET');
    expect(result.report_id).toBe('report-1');
  });

  it('maps invalid report responses to invalid_response_contract', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ...BASIC_ALPHA_REPORT_RESPONSE,
          raw_model_output: '{"agent_status":"done"}',
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
    );
    stubGlobal('fetch', fetchMock);

    await expect(fetchBasicAlphaReport('session-1')).rejects.toMatchObject({
      errorCode: 'invalid_response_contract',
      statusCode: 502,
    });
  });
});
