import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { recoverRequestExecution, startSession } from './api';

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
});
