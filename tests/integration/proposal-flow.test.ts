import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FastifyInstance } from 'fastify';

import { QueueLanguageModelClient } from '../helpers/fake-language-model-client';
import { buildTestApp, readFixture } from '../helpers/test-environment';

describe('proposal flow integration', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('covers the happy path from start to done with persisted state', async () => {
    const structuredBrief = await readFixture('expected', 'structured-brief.strong.json');
    const doneTurn = await readFixture('expected', 'problem-definition.done.json');
    const startAgentTurn = {
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
        {
          content: JSON.stringify(structuredBrief),
          modelName: 'brief-model',
          modelParams: { temperature: 0.2, num_ctx: 4096 },
        },
        {
          content: JSON.stringify(startAgentTurn),
          modelName: 'problem-model',
          modelParams: { temperature: 0.2, num_ctx: 8192 },
        },
        {
          content: JSON.stringify(doneTurn),
          modelName: 'problem-model',
          modelParams: { temperature: 0.2, num_ctx: 8192 },
        },
      ]),
    ));

    const strongProposal = await readFixture('start', 'strong-proposal.json');
    const strongAnswer = await readFixture('reply', 'strong-answer.json');

    const startResult = await startFlow(app, 'req-start-happy', strongProposal);

    expect(startResult.statusCode).toBe(200);
    expect(startResult.body.agent_status).toBe('continue');
    expect(startResult.body.next_question).toContain('responsable');

    const replyResult = await replyFlow(app, 'req-reply-happy', startResult.body.session_id, strongAnswer);

    expect(replyResult.statusCode).toBe(200);
    expect(replyResult.body.agent_status).toBe('done');
    expect(replyResult.body.next_question).toBe('');

    const sessions = await app.services.database.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM proposal_sessions',
    );
    const turns = await app.services.database.query<{
      turn_seq: number;
      question_text: string;
      answer_text: string | null;
      status: string;
    }>('SELECT turn_seq, question_text, answer_text, status FROM conversation_turns ORDER BY turn_seq ASC');
    const runs = await app.services.database.query<{
      run_purpose: string;
      prompt_version: string;
      model_provider: string;
      model_name: string;
      model_params_json: Record<string, unknown>;
    }>(
      'SELECT run_purpose, prompt_version, model_provider, model_name, model_params_json FROM agent_runs ORDER BY started_at ASC',
    );
    const snapshots = await app.services.database.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM session_snapshots',
    );
    const alphaRows = await app.services.database.query<{
      proposals_count: string;
      documents_count: string;
      sources_count: string;
      problem_chats_count: string;
    }>(
      [
        'SELECT',
        '  (SELECT COUNT(*)::text FROM proposals WHERE id = $1) AS proposals_count,',
        '  (SELECT COUNT(*)::text FROM proposal_documents WHERE proposal_id = $1) AS documents_count,',
        '  (SELECT COUNT(*)::text FROM proposal_sources WHERE proposal_id = $1) AS sources_count,',
        '  (SELECT COUNT(*)::text FROM module_chats WHERE proposal_id = $1 AND module = \'problem\') AS problem_chats_count',
      ].join(' '),
      [startResult.body.session_id],
    );

    expect(sessions.rows[0]?.count).toBe('1');
    expect(turns.rows).toHaveLength(1);
    expect(turns.rows[0]?.status).toBe('resolved');
    expect(turns.rows[0]?.answer_text?.toLowerCase()).toContain('enfermeria');
    expect(runs.rows).toHaveLength(3);
    expect(runs.rows.every((run) => run.prompt_version === 'v1')).toBe(true);
    expect(runs.rows[0]).toMatchObject({
      run_purpose: 'brief_extraction',
      model_provider: 'ollama',
      model_name: 'brief-model',
      model_params_json: { temperature: 0.2, num_ctx: 4096 },
    });
    expect(runs.rows[1]).toMatchObject({
      run_purpose: 'problem_definition',
      model_provider: 'ollama',
      model_name: 'problem-model',
      model_params_json: { temperature: 0.2, num_ctx: 8192 },
    });
    expect(runs.rows[2]).toMatchObject({
      run_purpose: 'problem_definition',
      model_provider: 'ollama',
      model_name: 'problem-model',
      model_params_json: { temperature: 0.2, num_ctx: 8192 },
    });
    expect(snapshots.rows[0]?.count).toBe('3');
    expect(alphaRows.rows[0]).toEqual({
      proposals_count: '1',
      documents_count: '1',
      sources_count: '1',
      problem_chats_count: '1',
    });
  });

  it('keeps the flow in continue for a vague proposal and asks a problem-focused question', async () => {
    const vagueBrief = {
      project_title: 'Mejorar la atencion sanitaria',
      goal: 'Explorar una posible herramienta inteligente',
      target_user: '',
      problem_owner: '',
      problem_statement: '',
      evidence_of_problem: '',
      current_alternatives: '',
      scope: '',
      constraints_known: [],
      assumptions: [],
      ambiguities: ['No esta claro quien sufre el problema'],
      missing_information: [
        'problem_owner',
        'problem_statement',
        'evidence_of_problem',
        'scope',
        'current_alternatives',
        'assumptions'
      ]
    };
    const vagueTurn = {
      agent_status: 'continue',
      diagnosis: ['La propuesta esta formulada de manera muy general'],
      updated_problem_definition: {
        problem_owner: '',
        problem_statement: '',
        evidence_of_problem: '',
        scope: '',
        current_alternatives: '',
        assumptions: [],
        ambiguities_remaining: ['No esta claro quien sufre el problema']
      },
      next_question: '¿Que actor concreto vive hoy ese problema y que le ocurre exactamente?',
      completion_reason: ''
    };

    ({ app } = await buildTestApp(
      new QueueLanguageModelClient([
        JSON.stringify(vagueBrief),
        JSON.stringify(vagueTurn),
      ]),
    ));

    const vagueProposal = await readFixture('start', 'vague-proposal.json');
    const startResult = await startFlow(app, 'req-start-vague', vagueProposal);

    expect(startResult.body.agent_status).toBe('continue');
    expect(startResult.body.structured_brief.missing_information.length).toBeGreaterThan(0);
    expect(startResult.body.next_question).toContain('actor');

    const lastRun = await app.services.database.query<{ validated_output_json: { diagnosis: string[] } }>(
      'SELECT validated_output_json FROM agent_runs WHERE run_purpose = $1 ORDER BY started_at DESC LIMIT 1',
      ['problem_definition'],
    );

    expect(lastRun.rows[0]?.validated_output_json.diagnosis.length).toBeLessThanOrEqual(3);
  });

  it('reformulates after a low-information reply instead of advancing to done', async () => {
    const structuredBrief = await readFixture('expected', 'structured-brief.strong.json');
    const startAgentTurn = {
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
    const overoptimisticDone = {
      agent_status: 'done',
      diagnosis: ['La respuesta es suficiente'],
      updated_problem_definition: {
        problem_owner: '',
        problem_statement: structuredBrief.problem_statement,
        evidence_of_problem: '',
        scope: '',
        current_alternatives: '',
        assumptions: [],
        ambiguities_remaining: ['Falta evidencia'],
      },
      next_question: '',
      completion_reason: 'problem sufficiently defined',
    };

    ({ app } = await buildTestApp(
      new QueueLanguageModelClient([
        JSON.stringify(structuredBrief),
        JSON.stringify(startAgentTurn),
        JSON.stringify(overoptimisticDone),
      ]),
    ));

    const strongProposal = await readFixture('start', 'strong-proposal.json');
    const noLoSe = await readFixture('reply', 'no-lo-se.json');

    const startResult = await startFlow(app, 'req-start-no-lo-se', strongProposal);
    const replyResult = await replyFlow(app, 'req-reply-no-lo-se', startResult.body.session_id, noLoSe);

    expect(replyResult.body.agent_status).toBe('continue');
    expect(replyResult.body.next_question).not.toBe('');
    expect(replyResult.body.completion_reason).toBe('');
  });

  it('supports resume across app restarts using the persisted session state', async () => {
    const structuredBrief = await readFixture('expected', 'structured-brief.strong.json');
    const startAgentTurn = {
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
    const doneTurn = await readFixture('expected', 'problem-definition.done.json');

    const firstClient = new QueueLanguageModelClient([
      JSON.stringify(structuredBrief),
      JSON.stringify(startAgentTurn),
    ]);

    const started = await buildTestApp(firstClient);
    app = started.app;

    const strongProposal = await readFixture('start', 'strong-proposal.json');
    const startResult = await startFlow(app, 'req-start-resume', strongProposal);
    await app.close();
    app = undefined;

    const resumedApp = await buildTestApp(new QueueLanguageModelClient([JSON.stringify(doneTurn)]), {
      resetDatabase: false,
    });
    app = resumedApp.app;

    const strongAnswer = await readFixture('reply', 'strong-answer.json');
    const replyResult = await replyFlow(app, 'req-reply-resume', startResult.body.session_id, strongAnswer);

    expect(replyResult.body.agent_status).toBe('done');
  });

  it('exposes completed request execution state for start and reply request ids', async () => {
    const structuredBrief = await readFixture('expected', 'structured-brief.strong.json');
    const startAgentTurn = {
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
    const doneTurn = await readFixture('expected', 'problem-definition.done.json');

    ({ app } = await buildTestApp(
      new QueueLanguageModelClient([
        JSON.stringify(structuredBrief),
        JSON.stringify(startAgentTurn),
        JSON.stringify(doneTurn),
      ]),
    ));

    const strongProposal = await readFixture('start', 'strong-proposal.json');
    const strongAnswer = await readFixture('reply', 'strong-answer.json');

    const startResult = await startFlow(app, 'req-start-status', strongProposal);
    const replyResult = await replyFlow(app, 'req-reply-status', startResult.body.session_id, strongAnswer as { answer: string });

    expect(replyResult.statusCode).toBe(200);

    const startStatus = await app.inject({
      method: 'GET',
      url: '/api/v1/requests/req-start-status',
    });
    const replyStatus = await app.inject({
      method: 'GET',
      url: '/api/v1/requests/req-reply-status',
    });

    expect(startStatus.statusCode).toBe(200);
    expect(startStatus.json()).toMatchObject({
      request_id: 'req-start-status',
      request_kind: 'proposal_start',
      status: 'completed',
      session_id: startResult.body.session_id,
    });

    expect(replyStatus.statusCode).toBe(200);
    expect(replyStatus.json()).toMatchObject({
      request_id: 'req-reply-status',
      request_kind: 'proposal_reply',
      status: 'completed',
      session_id: startResult.body.session_id,
    });
  });

  it('can actively recover a start request that created the session but never opened the first turn', async () => {
    const structuredBrief = await readFixture('expected', 'structured-brief.strong.json');
    const startAgentTurn = {
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
        JSON.stringify(startAgentTurn),
      ]),
    ));

    const strongProposal = await readFixture('start', 'strong-proposal.json');
    const startContextResponse = await startContext(app, 'req-start-recover', strongProposal);

    expect(startContextResponse.statusCode).toBe(200);

    const pendingStatus = await app.inject({
      method: 'GET',
      url: '/api/v1/requests/req-start-recover',
    });

    expect(pendingStatus.statusCode).toBe(200);
    expect(pendingStatus.json()).toMatchObject({
      request_id: 'req-start-recover',
      request_kind: 'proposal_start',
      status: 'pending',
    });

    const recoveredStatus = await app.inject({
      method: 'POST',
      url: '/api/v1/requests/req-start-recover/recover',
    });

    expect(recoveredStatus.statusCode).toBe(200);
    expect(recoveredStatus.json()).toMatchObject({
      request_id: 'req-start-recover',
      request_kind: 'proposal_start',
      status: 'completed',
      session_id: startContextResponse.json().session_id,
    });

    const audit = await app.inject({
      method: 'GET',
      url: `/api/v1/sessions/${startContextResponse.json().session_id}`,
    });

    expect(audit.statusCode).toBe(200);
    expect(audit.json().turns).toHaveLength(1);
    expect(audit.json().turns[0]?.question_text).toContain('responsable');
  });

  it('returns controlled validation errors and avoids side effects for invalid inputs', async () => {
    ({ app } = await buildTestApp(new QueueLanguageModelClient([])));

    const emptySubmission = await readFixture('start', 'empty-submission.json');
    const emptyAnswer = await readFixture('reply', 'empty-answer.json');
    const unknownSession = await readFixture('reply', 'unknown-session.json');

    const startResponse = await startContext(app, 'req-empty-start', emptySubmission);
    expect(startResponse.statusCode).toBe(400);

    const replyEmptyResponse = await appendReply(app, 'req-empty-reply', {
      session_id: '00000000-0000-0000-0000-000000000001',
      answer: emptyAnswer.answer,
    });
    expect(replyEmptyResponse.statusCode).toBe(400);

    const replyUnknownResponse = await appendReply(app, 'req-unknown-reply', unknownSession);
    expect(replyUnknownResponse.statusCode).toBe(404);

    const sessions = await app.services.database.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM proposal_sessions',
    );
    const runs = await app.services.database.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM agent_runs',
    );

    expect(sessions.rows[0]?.count).toBe('0');
    expect(runs.rows[0]?.count).toBe('0');
  });
});

async function startFlow(app: FastifyInstance, requestId: string, payload: unknown) {
  const startContextResponse = await startContext(app, requestId, payload);
  expect(startContextResponse.statusCode).toBe(200);
  const startContextBody = startContextResponse.json();

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
      session_id: startContextBody.session_id,
      trigger: 'start',
    },
  });

  return {
    statusCode: agentResponse.statusCode,
    body: agentResponse.json(),
  };
}

async function replyFlow(app: FastifyInstance, requestId: string, sessionId: string, replyFixture: { answer: string }) {
  const appendReplyResponse = await appendReply(app, requestId, {
    session_id: sessionId,
    answer: replyFixture.answer,
  });
  expect(appendReplyResponse.statusCode).toBe(200);

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
      session_id: sessionId,
      trigger: 'reply',
    },
  });

  return {
    statusCode: agentResponse.statusCode,
    body: agentResponse.json(),
  };
}

async function startContext(app: FastifyInstance, requestId: string, payload: unknown) {
  return app.inject({
    method: 'POST',
    url: '/internal/sessions/start-context',
    headers: {
      'x-internal-shared-secret': 'test-secret',
      'x-request-id': requestId,
    },
    payload: {
      request_id: requestId,
      workflow_version: 'proposal_start_v1',
      payload,
    },
  });
}

async function appendReply(app: FastifyInstance, requestId: string, payload: unknown) {
  return app.inject({
    method: 'POST',
    url: '/internal/sessions/append-reply',
    headers: {
      'x-internal-shared-secret': 'test-secret',
      'x-request-id': requestId,
    },
    payload: {
      request_id: requestId,
      workflow_version: 'proposal_reply_v1',
      payload,
    },
  });
}
