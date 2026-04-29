import { afterEach, describe, expect, it } from 'vitest';

import type { FastifyInstance } from 'fastify';

import { AppError } from '../../apps/api/src/utils/errors.ts';
import { QueueLanguageModelClient } from '../helpers/fake-language-model-client';
import { buildTestApp, readFixture, readTextFixture } from '../helpers/test-environment';

describe('problem-definition invalid JSON handling', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('repairs invalid JSON exactly once and continues the flow', async () => {
    const structuredBrief = await readFixture('expected', 'structured-brief.strong.json');
    const invalidTurn = await readTextFixture('model-output', 'turn.invalid.json.txt');
    const repairedTurn = await readFixture('model-output', 'turn.repaired.json');

    ({ app } = await buildTestApp(
      new QueueLanguageModelClient([
        JSON.stringify(structuredBrief),
        invalidTurn,
        JSON.stringify(repairedTurn),
      ]),
    ));

    const strongProposal = await readFixture('start', 'strong-proposal.json');

    const startContextResponse = await app.inject({
      method: 'POST',
      url: '/internal/sessions/start-context',
      headers: {
        'x-internal-shared-secret': 'test-secret',
      },
      payload: {
        request_id: 'req-repair-start',
        workflow_version: 'proposal_start_v1',
        payload: strongProposal,
      },
    });

    const startContextBody = startContextResponse.json();

    const agentResponse = await app.inject({
      method: 'POST',
      url: '/internal/agents/problem-definition/run',
      headers: {
        'x-internal-shared-secret': 'test-secret',
      },
      payload: {
        request_id: 'req-repair-agent',
        workflow_version: 'agent_problem_definition_v1',
        session_id: startContextBody.session_id,
        trigger: 'start',
      },
    });

    expect(agentResponse.statusCode).toBe(200);
    expect(agentResponse.json().agent_status).toBe('continue');

    const run = await app.services.database.query<{ repair_attempted: boolean; raw_model_output: string }>(
      'SELECT repair_attempted, raw_model_output FROM agent_runs WHERE request_id = $1',
      ['req-repair-agent'],
    );

    expect(run.rows[0]?.repair_attempted).toBe(true);
    expect(run.rows[0]?.raw_model_output).toContain('"agent_status"');
  });

  it('returns a controlled error when JSON repair also fails and blocks the session without persisting a corrupt turn', async () => {
    const structuredBrief = await readFixture('expected', 'structured-brief.strong.json');
    const invalidTurn = await readTextFixture('model-output', 'turn.invalid-unrepairable.txt');

    ({ app } = await buildTestApp(
      new QueueLanguageModelClient([
        JSON.stringify(structuredBrief),
        invalidTurn,
        invalidTurn,
      ]),
    ));

    const strongProposal = await readFixture('start', 'strong-proposal.json');

    const startContextResponse = await app.inject({
      method: 'POST',
      url: '/internal/sessions/start-context',
      headers: {
        'x-internal-shared-secret': 'test-secret',
      },
      payload: {
        request_id: 'req-unrepairable-start',
        workflow_version: 'proposal_start_v1',
        payload: strongProposal,
      },
    });

    const sessionId = startContextResponse.json().session_id;

    const agentResponse = await app.inject({
      method: 'POST',
      url: '/internal/agents/problem-definition/run',
      headers: {
        'x-internal-shared-secret': 'test-secret',
      },
      payload: {
        request_id: 'req-unrepairable-agent',
        workflow_version: 'agent_problem_definition_v1',
        session_id: sessionId,
        trigger: 'start',
      },
    });

    expect(agentResponse.statusCode).toBe(502);

    const session = await app.services.database.query<{ status: string }>(
      'SELECT status FROM proposal_sessions WHERE id = $1',
      [sessionId],
    );
    const turns = await app.services.database.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM conversation_turns WHERE session_id = $1',
      [sessionId],
    );
    const failedRun = await app.services.database.query<{ status: string; raw_model_output: string | null }>(
      'SELECT status, raw_model_output FROM agent_runs WHERE request_id = $1',
      ['req-unrepairable-agent'],
    );

    expect(session.rows[0]?.status).toBe('blocked');
    expect(turns.rows[0]?.count).toBe('0');
    expect(failedRun.rows[0]?.status).toBe('repair_failed');
    expect(failedRun.rows[0]?.raw_model_output).toContain('not json');
  });

  it('returns a controlled ollama timeout error and blocks the session for inspection', async () => {
    const structuredBrief = await readFixture('expected', 'structured-brief.strong.json');
    const requestId = 'req-timeout-start';

    ({ app } = await buildTestApp(
      new QueueLanguageModelClient([
        JSON.stringify(structuredBrief),
        new AppError(
          504,
          'ollama_timeout',
          'The local model exceeded the configured timeout',
          true,
        ),
      ]),
    ));

    const strongProposal = await readFixture('start', 'strong-proposal.json');

    const startContextResponse = await app.inject({
      method: 'POST',
      url: '/internal/sessions/start-context',
      headers: {
        'x-internal-shared-secret': 'test-secret',
      },
      payload: {
        request_id: requestId,
        workflow_version: 'proposal_start_v1',
        payload: strongProposal,
      },
    });

    const sessionId = startContextResponse.json().session_id;

    const agentResponse = await app.inject({
      method: 'POST',
      url: '/internal/agents/problem-definition/run',
      headers: {
        'x-internal-shared-secret': 'test-secret',
      },
      payload: {
        request_id: requestId,
        workflow_version: 'agent_problem_definition_v1',
        session_id: sessionId,
        trigger: 'start',
      },
    });

    expect(agentResponse.statusCode).toBe(504);
    expect(agentResponse.json().error_code).toBe('ollama_timeout');

    const session = await app.services.database.query<{ status: string }>(
      'SELECT status FROM proposal_sessions WHERE id = $1',
      [sessionId],
    );
    const failedRun = await app.services.database.query<{ status: string; error_code: string | null }>(
      'SELECT status, error_code FROM agent_runs WHERE request_id = $1',
      [requestId],
    );
    const requestStatus = await app.inject({
      method: 'GET',
      url: `/api/v1/requests/${requestId}`,
    });

    expect(session.rows[0]?.status).toBe('blocked');
    expect(failedRun.rows[0]?.status).toBe('model_failed');
    expect(failedRun.rows[0]?.error_code).toBe('ollama_timeout');
    expect(requestStatus.statusCode).toBe(200);
    expect(requestStatus.json()).toMatchObject({
      request_id: requestId,
      request_kind: 'proposal_start',
      status: 'failed',
      error_code: 'ollama_timeout',
      session_id: sessionId,
    });
  });
});
