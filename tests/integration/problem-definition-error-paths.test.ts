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

    const run = await app.services.database.query<{
      repair_attempted: boolean;
      raw_model_output: string;
      model_provider: string;
      model_params_json: Record<string, unknown>;
    }>(
      'SELECT repair_attempted, raw_model_output, model_provider, model_params_json FROM agent_runs WHERE request_id = $1',
      ['req-repair-agent'],
    );

    expect(run.rows[0]?.repair_attempted).toBe(true);
    expect(run.rows[0]?.raw_model_output).toContain('"agent_status"');
    expect(run.rows[0]?.model_provider).toBe('ollama');
    expect(typeof run.rows[0]?.model_params_json).toBe('object');
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
    const failedRun = await app.services.database.query<{
      status: string;
      raw_model_output: string | null;
      prompt_name: string;
      prompt_sha256: string;
      model_provider: string;
      model_name: string;
      model_params_json: Record<string, unknown>;
    }>(
      'SELECT status, raw_model_output, prompt_name, prompt_sha256, model_provider, model_name, model_params_json FROM agent_runs WHERE request_id = $1',
      ['req-unrepairable-agent'],
    );

    expect(session.rows[0]?.status).toBe('blocked');
    expect(turns.rows[0]?.count).toBe('0');
    expect(failedRun.rows[0]?.status).toBe('repair_failed');
    expect(failedRun.rows[0]?.raw_model_output).toContain('not json');
    expect(failedRun.rows[0]?.prompt_name).toBe('problem-definition-agent');
    expect(failedRun.rows[0]?.prompt_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(failedRun.rows[0]?.model_provider).toBe('ollama');
    expect(failedRun.rows[0]?.model_name).toBe('fake-model');
    expect(typeof failedRun.rows[0]?.model_params_json).toBe('object');
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
    const failedRun = await app.services.database.query<{
      status: string;
      error_code: string | null;
      model_provider: string;
      model_name: string;
      model_params_json: Record<string, unknown>;
    }>(
      'SELECT status, error_code, model_provider, model_name, model_params_json FROM agent_runs WHERE request_id = $1 AND run_purpose = $2',
      [requestId, 'problem_definition'],
    );
    const requestStatus = await app.inject({
      method: 'GET',
      url: `/api/v1/requests/${requestId}`,
    });

    expect(session.rows[0]?.status).toBe('blocked');
    expect(failedRun.rows[0]?.status).toBe('model_failed');
    expect(failedRun.rows[0]?.error_code).toBe('ollama_timeout');
    expect(failedRun.rows[0]?.model_provider).toBe('ollama');
    expect(failedRun.rows[0]?.model_name).toBe('fake-model');
    expect(typeof failedRun.rows[0]?.model_params_json).toBe('object');
    expect(requestStatus.statusCode).toBe(200);
    expect(requestStatus.json()).toMatchObject({
      request_id: requestId,
      request_kind: 'proposal_start',
      status: 'failed',
      error_code: 'ollama_timeout',
      session_id: sessionId,
    });
  });

  it('does not swallow unrelated unique violations while persisting failures', async () => {
    const structuredBrief = await readFixture('expected', 'structured-brief.strong.json');
    const requestId = 'req-failure-persist-unique';

    ({ app } = await buildTestApp(
      new QueueLanguageModelClient([
        JSON.stringify(structuredBrief),
        new AppError(504, 'ollama_timeout', 'The local model exceeded the configured timeout', true),
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
        request_id: 'req-failure-persist-unique-start',
        workflow_version: 'proposal_start_v1',
        payload: strongProposal,
      },
    });
    const sessionId = startContextResponse.json().session_id;

    await installFailingSessionEventTrigger(app.services.database);

    try {
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

      expect(agentResponse.statusCode).toBe(500);
      expect(agentResponse.json().error_code).toBe('internal_error');

      const failedRuns = await app.services.database.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM agent_runs WHERE request_id = $1 AND run_purpose = $2',
        [requestId, 'problem_definition'],
      );
      expect(failedRuns.rows[0]?.count).toBe('0');
    } finally {
      await removeFailingSessionEventTrigger(app.services.database);
    }
  });

  it('marks max-turn pre-agent rejection as failed and recoverable through request status', async () => {
    const structuredBrief = await readFixture('expected', 'structured-brief.strong.json');
    const strongProposal = await readFixture('start', 'strong-proposal.json');
    const strongAnswer = await readFixture('reply', 'strong-answer.json');
    const startTurn = {
      agent_status: 'continue',
      diagnosis: ['Falta identificar con precision quien responde hoy por el problema'],
      updated_problem_definition: {
        problem_owner: '',
        problem_statement: structuredBrief.problem_statement,
        evidence_of_problem: structuredBrief.evidence_of_problem,
        scope: structuredBrief.scope,
        current_alternatives: structuredBrief.current_alternatives,
        assumptions: structuredBrief.assumptions,
        ambiguities_remaining: structuredBrief.ambiguities,
      },
      next_question: '¿Qué equipo o responsable responde hoy por este problema en urgencias?',
      completion_reason: '',
    };

    ({ app } = await buildTestApp(
      new QueueLanguageModelClient([
        JSON.stringify(structuredBrief),
        JSON.stringify(startTurn),
      ]),
      {
        config: {
          maxTurnsPerSession: 1,
        },
      },
    ));

    const startContextResponse = await app.inject({
      method: 'POST',
      url: '/internal/sessions/start-context',
      headers: {
        'x-internal-shared-secret': 'test-secret',
      },
      payload: {
        request_id: 'req-max-turn-start',
        workflow_version: 'proposal_start_v1',
        payload: strongProposal,
      },
    });
    const sessionId = startContextResponse.json().session_id;

    const startAgentResponse = await app.inject({
      method: 'POST',
      url: '/internal/agents/problem-definition/run',
      headers: {
        'x-internal-shared-secret': 'test-secret',
      },
      payload: {
        request_id: 'req-max-turn-start',
        workflow_version: 'agent_problem_definition_v1',
        session_id: sessionId,
        trigger: 'start',
      },
    });
    expect(startAgentResponse.statusCode).toBe(200);

    const appendReplyResponse = await app.inject({
      method: 'POST',
      url: '/internal/sessions/append-reply',
      headers: {
        'x-internal-shared-secret': 'test-secret',
      },
      payload: {
        request_id: 'req-max-turn-reply',
        workflow_version: 'proposal_reply_v1',
        payload: {
          session_id: sessionId,
          answer: strongAnswer.answer,
        },
      },
    });
    expect(appendReplyResponse.statusCode).toBe(200);

    const agentResponse = await app.inject({
      method: 'POST',
      url: '/internal/agents/problem-definition/run',
      headers: {
        'x-internal-shared-secret': 'test-secret',
      },
      payload: {
        request_id: 'req-max-turn-reply',
        workflow_version: 'agent_problem_definition_v1',
        session_id: sessionId,
        trigger: 'reply',
      },
    });

    expect(agentResponse.statusCode).toBe(409);
    expect(agentResponse.json().error_code).toBe('maximum_turns_reached');

    const retryAgentResponse = await app.inject({
      method: 'POST',
      url: '/internal/agents/problem-definition/run',
      headers: {
        'x-internal-shared-secret': 'test-secret',
      },
      payload: {
        request_id: 'req-max-turn-reply',
        workflow_version: 'agent_problem_definition_v1',
        session_id: sessionId,
        trigger: 'reply',
      },
    });

    expect(retryAgentResponse.statusCode).toBe(409);
    expect(retryAgentResponse.json().error_code).toBe('maximum_turns_reached');

    const turn = await app.services.database.query<{ status: string; completion_reason: string | null }>(
      'SELECT status, completion_reason FROM conversation_turns WHERE answer_request_id = $1',
      ['req-max-turn-reply'],
    );
    const session = await app.services.database.query<{ status: string }>(
      'SELECT status FROM proposal_sessions WHERE id = $1',
      [sessionId],
    );
    const failedRun = await app.services.database.query<{
      status: string;
      error_code: string | null;
      prompt_sha256: string;
      model_provider: string;
      model_name: string;
    }>(
      'SELECT status, error_code, prompt_sha256, model_provider, model_name FROM agent_runs WHERE request_id = $1 AND run_purpose = $2',
      ['req-max-turn-reply', 'problem_definition'],
    );
    const blockedEvents = await app.services.database.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM session_events WHERE session_id = $1 AND event_type = $2',
      [sessionId, 'session_blocked'],
    );
    const failedRuns = await app.services.database.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM agent_runs WHERE request_id = $1 AND run_purpose = $2',
      ['req-max-turn-reply', 'problem_definition'],
    );
    const alphaFailure = await app.services.database.query<{
      chat_status: string;
      active_turn_id: string | null;
      turn_status: string;
      agent_status: string | null;
      answer_text: string | null;
      user_answer_sources_count: string;
      failed_events_count: string;
    }>(
      [
        'SELECT',
        '  (SELECT chat_status FROM module_chats WHERE proposal_id = $1 AND module = \'problem\') AS chat_status,',
        '  (SELECT active_turn_id FROM module_chats WHERE proposal_id = $1 AND module = \'problem\') AS active_turn_id,',
        '  (SELECT turn_status FROM chat_turns WHERE proposal_id = $1 AND module = \'problem\' AND turn_seq = 1) AS turn_status,',
        '  (SELECT agent_status FROM chat_turns WHERE proposal_id = $1 AND module = \'problem\' AND turn_seq = 1) AS agent_status,',
        '  (SELECT answer_text FROM chat_turns WHERE proposal_id = $1 AND module = \'problem\' AND turn_seq = 1) AS answer_text,',
        '  (SELECT COUNT(*)::text FROM proposal_sources WHERE proposal_id = $1 AND source_kind = \'user_answer\') AS user_answer_sources_count,',
        '  (SELECT COUNT(*)::text FROM audit_events WHERE proposal_id = $1 AND event_type = \'problem_answer_failed\') AS failed_events_count',
      ].join(' '),
      [sessionId],
    );
    const requestStatus = await app.inject({
      method: 'GET',
      url: '/api/v1/requests/req-max-turn-reply',
    });
    const recoveryStatus = await app.inject({
      method: 'POST',
      url: '/api/v1/requests/req-max-turn-reply/recover',
    });

    expect(turn.rows[0]).toMatchObject({
      status: 'failed',
      completion_reason: 'The maximum number of turns has already been reached',
    });
    expect(session.rows[0]?.status).toBe('blocked');
    expect(failedRun.rows[0]).toMatchObject({
      status: 'controlled_error',
      error_code: 'maximum_turns_reached',
      model_provider: 'ollama',
      model_name: 'fake-model',
    });
    expect(failedRun.rows[0]?.prompt_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(failedRuns.rows[0]?.count).toBe('1');
    expect(blockedEvents.rows[0]?.count).toBe('1');
    expect(alphaFailure.rows[0]).toMatchObject({
      chat_status: 'failed',
      active_turn_id: null,
      turn_status: 'failed',
      agent_status: 'blocked',
      answer_text: strongAnswer.answer,
      user_answer_sources_count: '1',
      failed_events_count: '1',
    });
    expect(requestStatus.statusCode).toBe(200);
    expect(requestStatus.json()).toMatchObject({
      request_id: 'req-max-turn-reply',
      request_kind: 'proposal_reply',
      status: 'failed',
      error_code: 'maximum_turns_reached',
      session_id: sessionId,
    });
    expect(recoveryStatus.statusCode).toBe(200);
    expect(recoveryStatus.json().status).toBe('failed');
  });
});

async function installFailingSessionEventTrigger(database: FastifyInstance['services']['database']): Promise<void> {
  await removeFailingSessionEventTrigger(database);
  await database.query(
    [
      'CREATE OR REPLACE FUNCTION test_raise_session_event_unique_failure()',
      'RETURNS trigger AS $$',
      'BEGIN',
      '  RAISE EXCEPTION \'forced session event unique violation\'',
      '    USING ERRCODE = \'23505\', CONSTRAINT = \'test_session_events_unique\';',
      'END;',
      '$$ LANGUAGE plpgsql',
    ].join('\n'),
  );
  await database.query(
    [
      'CREATE TRIGGER test_raise_session_event_unique_failure',
      'BEFORE INSERT ON session_events',
      'FOR EACH ROW',
      'EXECUTE FUNCTION test_raise_session_event_unique_failure()',
    ].join('\n'),
  );
}

async function removeFailingSessionEventTrigger(database: FastifyInstance['services']['database']): Promise<void> {
  await database.query('DROP TRIGGER IF EXISTS test_raise_session_event_unique_failure ON session_events');
  await database.query('DROP FUNCTION IF EXISTS test_raise_session_event_unique_failure()');
}
