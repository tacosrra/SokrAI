import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { QueueLanguageModelClient } from '../helpers/fake-language-model-client';
import { buildTestApp, readFixture } from '../helpers/test-environment';

describe('solution definition error paths', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('rejects solution start before a problem section exists', async () => {
    const structuredBrief = await readFixture('expected', 'structured-brief.strong.json');
    const startAgentTurn = {
      agent_status: 'continue',
      diagnosis: ['Falta definir responsable operativo'],
      updated_problem_definition: {
        problem_owner: '',
        problem_statement: structuredBrief.problem_statement,
        evidence_of_problem: structuredBrief.evidence_of_problem,
        scope: structuredBrief.scope,
        current_alternatives: structuredBrief.current_alternatives,
        assumptions: structuredBrief.assumptions,
        ambiguities_remaining: structuredBrief.ambiguities,
      },
      next_question: 'Que equipo responde hoy por este problema?',
      completion_reason: '',
    };

    ({ app } = await buildTestApp(
      new QueueLanguageModelClient([
        JSON.stringify(structuredBrief),
        JSON.stringify(startAgentTurn),
      ]),
    ));

    const startResult = await startProblem(app, 'req-start-solution-too-early');
    const solutionStart = await app.inject({
      method: 'POST',
      url: '/internal/sessions/solution-start',
      headers: {
        'x-internal-shared-secret': 'test-secret',
        'x-request-id': 'req-solution-too-early',
      },
      payload: {
        request_id: 'req-solution-too-early',
        workflow_version: 'solution_start_v1',
        payload: {
          request_id: 'req-solution-too-early',
          session_id: startResult.body.session_id,
        },
      },
    });

    expect(solutionStart.statusCode).toBe(409);
    expect(solutionStart.json()).toMatchObject({
      error_code: 'problem_section_required',
      session_id: startResult.body.session_id,
    });
  });
});

async function startProblem(app: FastifyInstance, requestId: string) {
  const strongProposal = await readFixture('start', 'strong-proposal.json');
  const startContext = await app.inject({
    method: 'POST',
    url: '/internal/sessions/start-context',
    headers: {
      'x-internal-shared-secret': 'test-secret',
      'x-request-id': requestId,
    },
    payload: {
      request_id: requestId,
      workflow_version: 'proposal_start_v1',
      payload: strongProposal,
    },
  });
  expect(startContext.statusCode).toBe(200);

  const agentResponse = await app.inject({
    method: 'POST',
    url: '/internal/agents/problem-definition/run',
    headers: {
      'x-internal-shared-secret': 'test-secret',
      'x-request-id': requestId,
    },
    payload: {
      request_id: requestId,
      workflow_version: 'agent_problem_definition_v1',
      session_id: startContext.json().session_id,
      trigger: 'start',
    },
  });
  expect(agentResponse.statusCode).toBe(200);

  return {
    statusCode: agentResponse.statusCode,
    body: agentResponse.json(),
  };
}
