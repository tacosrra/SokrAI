import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FastifyInstance } from 'fastify';

import { QueueLanguageModelClient } from '../helpers/fake-language-model-client';
import { buildTestApp, readFixture } from '../helpers/test-environment';

describe('legal specialty integration', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('stores specialty=legal and records it on agent_runs', async () => {
    const structuredBrief = await readFixture('expected', 'structured-brief.strong.json');
    const agentTurn = {
      agent_status: 'continue',
      diagnosis: ['Falta identificar el marco regulatorio aplicable'],
      updated_problem_definition: {
        problem_owner: '',
        problem_statement: structuredBrief.problem_statement,
        evidence_of_problem: structuredBrief.evidence_of_problem,
        scope: structuredBrief.scope,
        current_alternatives: structuredBrief.current_alternatives,
        assumptions: structuredBrief.assumptions,
        ambiguities_remaining: structuredBrief.ambiguities,
      },
      next_question: '¿Qué marco legal o regulatorio aplica a este proyecto?',
      completion_reason: '',
    };

    ({ app } = await buildTestApp(
      new QueueLanguageModelClient([
        JSON.stringify(structuredBrief),
        JSON.stringify(agentTurn),
      ]),
    ));

    const strongProposal = await readFixture('start', 'strong-proposal.json');

    const startContextResponse = await app.inject({
      method: 'POST',
      url: '/internal/sessions/start-context',
      headers: {
        'x-internal-shared-secret': 'test-secret',
        'x-request-id': 'req-legal-start',
      },
      payload: {
        request_id: 'req-legal-start',
        workflow_version: 'proposal_start_v1',
        specialty: 'legal',
        payload: strongProposal,
      },
    });

    expect(startContextResponse.statusCode).toBe(200);
    const sessionId = startContextResponse.json<{ session_id: string }>().session_id;

    const agentResponse = await app.inject({
      method: 'POST',
      url: '/internal/agents/problem-definition/run',
      headers: {
        'x-internal-shared-secret': 'test-secret',
        'x-request-id': 'req-legal-start',
      },
      payload: {
        request_id: 'req-legal-start',
        workflow_version: 'agent_problem_definition_v1',
        session_id: sessionId,
        trigger: 'start',
      },
    });

    expect(agentResponse.statusCode).toBe(200);
    expect(agentResponse.json<{ agent_status: string }>().agent_status).toBe('continue');

    const sessionRow = await app.services.database.query<{
      specialty: string | null;
      current_specialty: string | null;
    }>(
      'SELECT specialty, current_specialty FROM proposal_sessions WHERE id = $1',
      [sessionId],
    );
    expect(sessionRow.rows[0]?.specialty).toBe('legal');
    expect(sessionRow.rows[0]?.current_specialty).toBe('legal');

    const runRow = await app.services.database.query<{
      specialty: string | null;
      prompt_name: string;
    }>(
      "SELECT specialty, prompt_name FROM agent_runs WHERE session_id = $1 AND run_purpose = 'problem_definition'",
      [sessionId],
    );
    expect(runRow.rows[0]?.specialty).toBe('legal');
    expect(runRow.rows[0]?.prompt_name).toBe('problem-definition-agent-legal');
  });

  it('switches specialty mid-session via the switch-specialty endpoint', async () => {
    const structuredBrief = await readFixture('expected', 'structured-brief.strong.json');
    const agentTurn = {
      agent_status: 'continue',
      diagnosis: ['Falta el responsable'],
      updated_problem_definition: {
        problem_owner: '',
        problem_statement: structuredBrief.problem_statement,
        evidence_of_problem: structuredBrief.evidence_of_problem,
        scope: structuredBrief.scope,
        current_alternatives: structuredBrief.current_alternatives,
        assumptions: structuredBrief.assumptions,
        ambiguities_remaining: structuredBrief.ambiguities,
      },
      next_question: '¿Quién responde por este problema?',
      completion_reason: '',
    };

    ({ app } = await buildTestApp(
      new QueueLanguageModelClient([
        JSON.stringify(structuredBrief),
        JSON.stringify(agentTurn),
      ]),
    ));

    const strongProposal = await readFixture('start', 'strong-proposal.json');

    const startResponse = await app.inject({
      method: 'POST',
      url: '/internal/sessions/start-context',
      headers: {
        'x-internal-shared-secret': 'test-secret',
        'x-request-id': 'req-switch-start',
      },
      payload: {
        request_id: 'req-switch-start',
        workflow_version: 'proposal_start_v1',
        payload: strongProposal,
      },
    });

    expect(startResponse.statusCode).toBe(200);
    const sessionId = startResponse.json<{ session_id: string }>().session_id;

    const switchResponse = await app.inject({
      method: 'POST',
      url: '/internal/sessions/switch-specialty',
      headers: {
        'x-internal-shared-secret': 'test-secret',
      },
      payload: {
        session_id: sessionId,
        specialty: 'legal',
      },
    });

    expect(switchResponse.statusCode).toBe(200);
    const switchBody = switchResponse.json<{
      session_id: string;
      current_specialty: string;
      context_reset_at: string;
    }>();
    expect(switchBody.current_specialty).toBe('legal');
    expect(switchBody.context_reset_at).toBeTruthy();

    const sessionRow = await app.services.database.query<{
      current_specialty: string | null;
      context_reset_at: string | null;
    }>(
      'SELECT current_specialty, context_reset_at FROM proposal_sessions WHERE id = $1',
      [sessionId],
    );
    expect(sessionRow.rows[0]?.current_specialty).toBe('legal');
    expect(sessionRow.rows[0]?.context_reset_at).not.toBeNull();
  });

  it('rejects switch-specialty on a completed session', async () => {
    const structuredBrief = await readFixture('expected', 'structured-brief.strong.json');
    const doneTurn = await readFixture('expected', 'problem-definition.done.json');

    ({ app } = await buildTestApp(
      new QueueLanguageModelClient([
        JSON.stringify(structuredBrief),
        JSON.stringify(doneTurn),
        JSON.stringify(doneTurn),
      ]),
    ));

    const strongProposal = await readFixture('start', 'strong-proposal.json');
    const strongAnswer = await readFixture('reply', 'strong-answer.json');

    const startContext = await app.inject({
      method: 'POST',
      url: '/internal/sessions/start-context',
      headers: { 'x-internal-shared-secret': 'test-secret', 'x-request-id': 'req-done-start' },
      payload: { request_id: 'req-done-start', workflow_version: 'proposal_start_v1', payload: strongProposal },
    });
    const sessionId = startContext.json<{ session_id: string }>().session_id;

    await app.inject({
      method: 'POST',
      url: '/internal/agents/problem-definition/run',
      headers: { 'x-internal-shared-secret': 'test-secret', 'x-request-id': 'req-done-start' },
      payload: { request_id: 'req-done-start', workflow_version: 'agent_problem_definition_v1', session_id: sessionId, trigger: 'start' },
    });

    await app.inject({
      method: 'POST',
      url: '/internal/sessions/append-reply',
      headers: { 'x-internal-shared-secret': 'test-secret', 'x-request-id': 'req-done-reply' },
      payload: { request_id: 'req-done-reply', workflow_version: 'proposal_reply_v1', payload: { session_id: sessionId, answer: strongAnswer.answer } },
    });

    await app.inject({
      method: 'POST',
      url: '/internal/agents/problem-definition/run',
      headers: { 'x-internal-shared-secret': 'test-secret', 'x-request-id': 'req-done-reply' },
      payload: { request_id: 'req-done-reply', workflow_version: 'agent_problem_definition_v1', session_id: sessionId, trigger: 'reply' },
    });

    const switchResponse = await app.inject({
      method: 'POST',
      url: '/internal/sessions/switch-specialty',
      headers: { 'x-internal-shared-secret': 'test-secret' },
      payload: { session_id: sessionId, specialty: 'legal' },
    });

    expect(switchResponse.statusCode).toBe(409);
    expect(switchResponse.json<{ error_code: string }>().error_code).toBe('session_not_switchable');
  });
});
