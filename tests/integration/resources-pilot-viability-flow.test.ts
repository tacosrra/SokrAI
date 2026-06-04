import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FastifyInstance } from 'fastify';

import type { Database } from '../../apps/api/src/repositories/database';
import { QueueLanguageModelClient } from '../helpers/fake-language-model-client';
import { buildTestApp, readFixture } from '../helpers/test-environment';

describe('resources pilot viability flow integration', () => {
  const unsafeResourcesPilotClaims =
    /The pilot is approved|high viability score|full financial model|profitability|ROI/i;
  let app: FastifyInstance | undefined;
  let database: Database | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }

    database = undefined;
    vi.restoreAllMocks();
  });

  it('starts after solution, persists one question, resolves reply, generates section, and resumes audit state', async () => {
    ({ app } = await buildTestApp(await createResourcesPilotViabilityFlowModel()));

    const sessionId = await completeAlphaFlow(app);
    const start = await resourcesPilotStartFlow(app, 'req-resources-start', sessionId);

    expect(start.statusCode).toBe(200);
    expect(start.body).toMatchObject({
      stage: 'resources_pilot_viability',
      agent_status: 'continue',
    });
    expect(start.body.next_question).toMatch(/\?$/);

    const reply = await resourcesPilotReplyFlow(
      app,
      'req-resources-reply',
      sessionId,
      'El piloto lo ejecutan un clinical lead, dos enfermeras y coordinacion; usa SSO, metricas semanales, restricciones de agenda y riesgo de onboarding tardio.',
    );
    const audit = await app.inject({
      method: 'GET',
      url: `/api/v1/sessions/${sessionId}`,
    });
    const auditJson = audit.json();

    expect(reply.statusCode).toBe(200);
    expect(reply.body).toMatchObject({
      stage: 'resources_pilot_viability',
      agent_status: 'done',
    });
    expect(auditJson.module_chats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          module: 'resources_pilot_viability',
          chat_status: 'completed',
        }),
      ]),
    );
    expect(auditJson.generated_sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          section_kind: 'resources_pilot_viability',
          generated_by_run_id: expect.any(String),
          warnings: expect.arrayContaining([
            'This section is not a viability score, approval decision, ranking, or financial model.',
          ]),
        }),
      ]),
    );
    expect(auditJson.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event_type: 'resources_pilot_viability_turn_opened' }),
        expect.objectContaining({ event_type: 'resources_pilot_viability_section_generated' }),
      ]),
    );
    expect(JSON.stringify(auditJson.generated_sections)).not.toMatch(unsafeResourcesPilotClaims);
  });

  it('rejects start before the solution section exists', async () => {
    ({ app } = await buildTestApp(await createProblemOnlyModel()));

    const strongProposal = await readFixture('start', 'strong-proposal.json');
    const strongAnswer = await readFixture<{ answer: string }>('reply', 'strong-answer.json');
    const start = await startFlow(app, 'req-resources-missing-solution-start', strongProposal);
    await replyFlow(app, 'req-resources-missing-solution-problem-done', start.body.session_id, strongAnswer);
    const resourcesStart = await resourcesPilotStartFlow(
      app,
      'req-resources-missing-solution',
      start.body.session_id,
    );

    expect(resourcesStart.statusCode).toBe(409);
    expect(resourcesStart.body.error_code).toBe('solution_section_required_for_resources_pilot_viability');
  });

  it('replays reply request ids without duplicating answer side effects', async () => {
    ({ app, database } = await buildTestApp(await createResourcesPilotViabilityFlowModel()));

    const sessionId = await completeAlphaFlow(app);
    await resourcesPilotStartFlow(app, 'req-resources-retry-start', sessionId);

    const answer = 'El piloto tiene equipo, SSO, entorno ambulatorio, metricas semanales, restricciones de agenda y riesgos de onboarding.';
    const first = await resourcesPilotReplyFlow(app, 'req-resources-retry', sessionId, answer);
    const replay = await resourcesPilotReplyFlow(app, 'req-resources-retry', sessionId, answer);
    const counts = await database!.query<{
      answer_sources: string;
      sections: string;
      request_runs: string;
      answer_resolved_events: string;
    }>(
      [
        'SELECT',
        '  (SELECT COUNT(*) FROM proposal_sources ps JOIN proposals p ON p.id = ps.proposal_id',
        '   WHERE p.session_id = $1 AND ps.source_kind = \'user_answer\' AND ps.metadata_json->>\'request_id\' = $2) AS answer_sources,',
        '  (SELECT COUNT(*) FROM generated_sections gs JOIN proposals p ON p.id = gs.proposal_id',
        '   WHERE p.session_id = $1 AND gs.section_kind = \'resources_pilot_viability\') AS sections,',
        '  (SELECT COUNT(*) FROM agent_runs ar',
        '   WHERE ar.session_id = $1 AND ar.request_id = $2 AND ar.run_purpose = \'resources_pilot_viability\') AS request_runs,',
        '  (SELECT COUNT(*) FROM audit_events ae JOIN proposals p ON p.id = ae.proposal_id',
        '   WHERE p.session_id = $1 AND ae.request_id = $2 AND ae.event_type = \'resources_pilot_viability_answer_resolved\') AS answer_resolved_events',
      ].join(' '),
      [sessionId, 'req-resources-retry'],
    );

    expect(first.statusCode).toBe(200);
    expect(replay.statusCode).toBe(200);
    expect(replay.body.run_id).toBe(first.body.run_id);
    expect(Number(counts.rows[0].answer_sources)).toBe(1);
    expect(Number(counts.rows[0].sections)).toBe(1);
    expect(Number(counts.rows[0].request_runs)).toBe(1);
    expect(Number(counts.rows[0].answer_resolved_events)).toBe(1);
  });

  it('persists guardrail intervention metadata without exposing unsafe output', async () => {
    ({ app, database } = await buildTestApp(await createResourcesPilotViabilityGuardrailModel()));

    const sessionId = await completeAlphaFlow(app);
    const start = await resourcesPilotStartFlow(app, 'req-resources-guardrail-start', sessionId);
    const persisted = await database!.query<{
      metrics_json: {
        guardrail_intervention?: {
          applied?: boolean;
          reasons?: string[];
          normalizedFields?: string[];
          fallbackQuestionApplied?: boolean;
          scope?: string;
        };
      };
      payload_json: Record<string, unknown>;
    }>(
      [
        'SELECT ar.metrics_json, ae.payload_json',
        'FROM agent_runs ar',
        'JOIN audit_events ae ON ae.run_id = ar.id',
        'WHERE ar.session_id = $1',
        '  AND ar.request_id = $2',
        '  AND ar.run_purpose = \'resources_pilot_viability\'',
        '  AND ae.event_type = \'resources_pilot_viability_guardrail_fallback_applied\'',
      ].join(' '),
      [sessionId, 'req-resources-guardrail-start'],
    );

    expect(start.statusCode).toBe(200);
    expect(start.body.agent_status).toBe('continue');
    expect(start.body.warnings).toContain('Decision, score, ranking, or financial model wording was replaced before persistence');
    expect(JSON.stringify(start.body)).not.toMatch(unsafeResourcesPilotClaims);
    expect(persisted.rowCount).toBe(1);
    expect(persisted.rows[0].metrics_json.guardrail_intervention).toMatchObject({
      applied: true,
      reasons: ['forbidden_output_replaced'],
      fallbackQuestionApplied: true,
      scope: 'resources_pilot_viability_operational_inputs',
    });
    expect(persisted.rows[0].metrics_json.guardrail_intervention?.normalizedFields).toEqual(
      expect.arrayContaining(['diagnosis', 'updated_resources_pilot_viability.constraints']),
    );
    expect(persisted.rows[0].payload_json).toMatchObject({
      reasons: ['forbidden_output_replaced'],
      fallback_question_applied: true,
      forced_agent_status: 'continue',
      scope: 'resources_pilot_viability_operational_inputs',
    });
    expect(JSON.stringify(persisted.rows[0].payload_json)).not.toMatch(unsafeResourcesPilotClaims);
  });
});

async function createProblemOnlyModel() {
  const structuredBrief = await readFixture('expected', 'structured-brief.strong.json');
  const doneProblemTurn = await readFixture('expected', 'problem-definition.done.json');
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
    next_question: 'Que equipo o responsable responde hoy por este problema en urgencias?',
    completion_reason: '',
  };

  return new QueueLanguageModelClient([
    JSON.stringify(structuredBrief),
    JSON.stringify(startAgentTurn),
    JSON.stringify(doneProblemTurn),
  ]);
}

async function createResourcesPilotViabilityFlowModel() {
  const base = await createAlphaModelResponses();
  const continueResourcesTurn = await readFixture('expected', 'resources-pilot-viability.continue.json');
  const doneResourcesTurn = await readFixture('expected', 'resources-pilot-viability.done.json');

  return new QueueLanguageModelClient([
    ...base,
    JSON.stringify(continueResourcesTurn),
    JSON.stringify(doneResourcesTurn),
  ]);
}

async function createResourcesPilotViabilityGuardrailModel() {
  const base = await createAlphaModelResponses();
  const doneResourcesTurn = await readFixture<{
    updated_resources_pilot_viability: Record<string, unknown>;
  }>('expected', 'resources-pilot-viability.done.json');
  const unsafeResourcesTurn = {
    ...doneResourcesTurn,
    diagnosis: ['The pilot is approved with a high viability score.'],
    updated_resources_pilot_viability: {
      ...doneResourcesTurn.updated_resources_pilot_viability,
      constraints: ['A full financial model proves profitability and ROI.'],
    },
  };

  return new QueueLanguageModelClient([
    ...base,
    JSON.stringify(unsafeResourcesTurn),
  ]);
}

async function createAlphaModelResponses(): Promise<string[]> {
  const structuredBrief = await readFixture('expected', 'structured-brief.strong.json');
  const doneProblemTurn = await readFixture('expected', 'problem-definition.done.json');
  const continueSolutionTurn = await readFixture('expected', 'solution-definition.continue.json');
  const doneSolutionTurn = await readFixture('expected', 'solution-definition.done.json');
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
    next_question: 'Que equipo o responsable responde hoy por este problema en urgencias?',
    completion_reason: '',
  };

  return [
    JSON.stringify(structuredBrief),
    JSON.stringify(startAgentTurn),
    JSON.stringify(doneProblemTurn),
    JSON.stringify(continueSolutionTurn),
    JSON.stringify(doneSolutionTurn),
  ];
}

async function completeAlphaFlow(app: FastifyInstance): Promise<string> {
  const strongProposal = await readFixture('start', 'strong-proposal.json');
  const strongAnswer = await readFixture<{ answer: string }>('reply', 'strong-answer.json');
  const solutionAnswer = await readFixture<{ answer: string }>('reply', 'solution-workflow-change.json');
  const start = await startFlow(app, 'req-resources-start-proposal', strongProposal);
  const problemReply = await replyFlow(app, 'req-resources-problem-done', start.body.session_id, strongAnswer);
  const solutionStart = await solutionStartFlow(app, 'req-resources-solution-start', start.body.session_id);
  const solutionReply = await solutionReplyFlow(
    app,
    'req-resources-solution-reply',
    start.body.session_id,
    solutionAnswer,
  );

  expect(problemReply.body.agent_status).toBe('done');
  expect(solutionStart.body.agent_status).toBe('continue');
  expect(solutionReply.body.agent_status).toBe('done');

  return start.body.session_id as string;
}

async function startFlow(app: FastifyInstance, requestId: string, payload: unknown) {
  const startContextResponse = await app.inject({
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
  expect(startContextResponse.statusCode).toBe(200);

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
      session_id: startContextResponse.json().session_id,
      trigger: 'start',
    },
  });

  return {
    statusCode: agentResponse.statusCode,
    body: agentResponse.json(),
  };
}

async function replyFlow(app: FastifyInstance, requestId: string, sessionId: string, replyFixture: { answer: string }) {
  const appendReplyResponse = await app.inject({
    method: 'POST',
    url: '/internal/sessions/append-reply',
    headers: {
      'x-internal-shared-secret': 'test-secret',
      'x-request-id': requestId,
    },
    payload: {
      request_id: requestId,
      workflow_version: 'proposal_reply_v1',
      payload: {
        request_id: requestId,
        session_id: sessionId,
        answer: replyFixture.answer,
      },
    },
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

async function solutionStartFlow(app: FastifyInstance, requestId: string, sessionId: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/internal/sessions/solution-start',
    headers: {
      'x-internal-shared-secret': 'test-secret',
      'x-request-id': requestId,
    },
    payload: {
      request_id: requestId,
      workflow_version: 'solution_start_v1',
      payload: {
        request_id: requestId,
        session_id: sessionId,
      },
    },
  });

  return {
    statusCode: response.statusCode,
    body: response.json(),
  };
}

async function solutionReplyFlow(app: FastifyInstance, requestId: string, sessionId: string, replyFixture: { answer: string }) {
  const appendReplyResponse = await app.inject({
    method: 'POST',
    url: '/internal/sessions/solution-reply',
    headers: {
      'x-internal-shared-secret': 'test-secret',
      'x-request-id': requestId,
    },
    payload: {
      request_id: requestId,
      workflow_version: 'solution_reply_v1',
      payload: {
        request_id: requestId,
        session_id: sessionId,
        answer: replyFixture.answer,
      },
    },
  });
  expect(appendReplyResponse.statusCode).toBe(200);

  const response = await app.inject({
    method: 'POST',
    url: '/internal/agents/solution-definition/run',
    headers: {
      'x-internal-shared-secret': 'test-secret',
      'x-request-id': requestId,
    },
    payload: {
      request_id: requestId,
      workflow_version: 'agent_solution_definition_v1',
      session_id: sessionId,
      trigger: 'reply',
    },
  });

  return {
    statusCode: response.statusCode,
    body: response.json(),
  };
}

async function resourcesPilotStartFlow(app: FastifyInstance, requestId: string, sessionId: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/internal/sessions/resources-pilot-viability-start',
    headers: {
      'x-internal-shared-secret': 'test-secret',
      'x-request-id': requestId,
    },
    payload: {
      request_id: requestId,
      workflow_version: 'resources_pilot_viability_start_v1',
      payload: {
        request_id: requestId,
        session_id: sessionId,
      },
    },
  });

  return {
    statusCode: response.statusCode,
    body: response.json(),
  };
}

async function resourcesPilotReplyFlow(app: FastifyInstance, requestId: string, sessionId: string, answer: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/internal/sessions/resources-pilot-viability-reply',
    headers: {
      'x-internal-shared-secret': 'test-secret',
      'x-request-id': requestId,
    },
    payload: {
      request_id: requestId,
      workflow_version: 'resources_pilot_viability_reply_v1',
      payload: {
        request_id: requestId,
        session_id: sessionId,
        answer,
      },
    },
  });

  return {
    statusCode: response.statusCode,
    body: response.json(),
  };
}
