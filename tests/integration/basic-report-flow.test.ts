import { afterEach, describe, expect, it } from 'vitest';

import type { FastifyInstance } from 'fastify';

import { assertBasicAlphaReport } from '../../apps/api/src/contracts/schema-registry.ts';
import { QueueLanguageModelClient } from '../helpers/fake-language-model-client';
import { buildTestApp, readFixture } from '../helpers/test-environment';

describe('basic report flow integration', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('composes and reads a report after problem and solution sections exist without exposing raw model output', async () => {
    ({ app } = await buildTestApp(await createReportFlowModel()));

    const sessionId = await completeAlphaFlow(app);
    const compose = await composeReport(app, 'req-report-compose', sessionId);

    expect(compose.statusCode).toBe(200);
    const report = assertBasicAlphaReport(compose.body);

    expect(report.problem_section.section_version).toBe(1);
    expect(report.solution_section.section_version).toBe(1);
    expect(report.structured_brief.project_title).toContain('Triage');
    expect(report.current_gaps.length).toBeGreaterThan(0);
    expect(report.internal_sources.length).toBeGreaterThan(0);
    expect(report.warnings.join(' ')).toMatch(/not a dictamen/i);
    expect(report.warnings.join(' ')).toMatch(/does not approve, reject/i);
    expect(report.warnings.join(' ')).toMatch(/legal, clinical, or regulatory decision/i);
    expect(JSON.stringify(report)).not.toContain('raw_model_output');
    expect(JSON.stringify(report)).not.toContain('validated_output_json');
    expect(JSON.stringify(report)).not.toContain('prompt_name');
    expect(JSON.stringify(report)).not.toContain('model_params_json');

    const persisted = await app.services.database.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM basic_reports WHERE proposal_id = $1',
      [sessionId],
    );
    const auditEvent = await app.services.database.query<{ event_type: string }>(
      'SELECT event_type FROM audit_events WHERE proposal_id = $1 AND event_type = $2',
      [sessionId, 'basic_report_composed'],
    );
    const audit = await app.inject({
      method: 'GET',
      url: `/api/v1/sessions/${sessionId}`,
    });
    const getReport = await app.inject({
      method: 'GET',
      url: `/api/v1/sessions/${sessionId}/report`,
    });

    expect(persisted.rows[0]).toEqual({ count: '1' });
    expect(auditEvent.rows).toHaveLength(1);
    expect(audit.json().runs.some((run: { raw_model_output: string | null }) => run.raw_model_output)).toBe(true);
    expect(getReport.statusCode).toBe(200);
    expect(getReport.json().report_id).toBe(report.report_id);
    expect(JSON.stringify(getReport.json())).not.toContain('raw_model_output');
  });

  it('returns the existing report on repeated compose requests', async () => {
    ({ app } = await buildTestApp(await createReportFlowModel()));

    const sessionId = await completeAlphaFlow(app);
    const first = await composeReport(app, 'req-report-compose-first', sessionId);
    const second = await composeReport(app, 'req-report-compose-second', sessionId);
    const persisted = await app.services.database.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM basic_reports WHERE proposal_id = $1',
      [sessionId],
    );

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.body.report_id).toBe(first.body.report_id);
    expect(persisted.rows[0]).toEqual({ count: '1' });
  });

  it('returns the same report for concurrent compose retries', async () => {
    ({ app } = await buildTestApp(await createReportFlowModel()));

    const sessionId = await completeAlphaFlow(app);
    const [first, second] = await Promise.all([
      composeReport(app, 'req-report-compose-race-1', sessionId),
      composeReport(app, 'req-report-compose-race-2', sessionId),
    ]);
    const persisted = await app.services.database.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM basic_reports WHERE proposal_id = $1',
      [sessionId],
    );

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.body.report_id).toBe(first.body.report_id);
    expect(persisted.rows[0]).toEqual({ count: '1' });
  });

  it('returns controlled not-ready responses before compose or before solution section generation', async () => {
    ({ app } = await buildTestApp(await createProblemOnlyModel()));

    const strongProposal = await readFixture('start', 'strong-proposal.json');
    const strongAnswer = await readFixture('reply', 'strong-answer.json');
    const start = await startFlow(app, 'req-report-start-not-ready', strongProposal);
    await replyFlow(app, 'req-report-problem-done-not-ready', start.body.session_id, strongAnswer);

    const getBeforeCompose = await app.inject({
      method: 'GET',
      url: `/api/v1/sessions/${start.body.session_id}/report`,
    });
    const composeBeforeSolution = await composeReport(app, 'req-report-compose-not-ready', start.body.session_id);

    expect(getBeforeCompose.statusCode).toBe(404);
    expect(getBeforeCompose.json()).toMatchObject({ error_code: 'report_not_found' });
    expect(composeBeforeSolution.statusCode).toBe(409);
    expect(composeBeforeSolution.body).toMatchObject({
      error_code: 'solution_section_required_for_report',
    });
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
    next_question: '¿Qué equipo o responsable responde hoy por este problema en urgencias?',
    completion_reason: '',
  };

  return new QueueLanguageModelClient([
    JSON.stringify(structuredBrief),
    JSON.stringify(startAgentTurn),
    JSON.stringify(doneProblemTurn),
  ]);
}

async function createReportFlowModel() {
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
    next_question: '¿Qué equipo o responsable responde hoy por este problema en urgencias?',
    completion_reason: '',
  };

  return new QueueLanguageModelClient([
    JSON.stringify(structuredBrief),
    JSON.stringify(startAgentTurn),
    JSON.stringify(doneProblemTurn),
    JSON.stringify(continueSolutionTurn),
    JSON.stringify(doneSolutionTurn),
  ]);
}

async function completeAlphaFlow(app: FastifyInstance): Promise<string> {
  const strongProposal = await readFixture('start', 'strong-proposal.json');
  const strongAnswer = await readFixture('reply', 'strong-answer.json');
  const solutionAnswer = await readFixture('reply', 'solution-workflow-change.json');
  const start = await startFlow(app, 'req-report-start', strongProposal);
  const problemReply = await replyFlow(app, 'req-report-problem-done', start.body.session_id, strongAnswer);
  const solutionStart = await solutionStartFlow(app, 'req-report-solution-start', start.body.session_id);
  const solutionReply = await solutionReplyFlow(
    app,
    'req-report-solution-reply',
    start.body.session_id,
    solutionAnswer,
  );

  expect(problemReply.body.agent_status).toBe('done');
  expect(solutionStart.body.agent_status).toBe('continue');
  expect(solutionReply.body.agent_status).toBe('done');

  return start.body.session_id as string;
}

async function composeReport(app: FastifyInstance, requestId: string, sessionId: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/internal/reports/basic-alpha/compose',
    headers: {
      'x-internal-shared-secret': 'test-secret',
      'x-request-id': requestId,
    },
    payload: {
      request_id: requestId,
      workflow_version: 'basic_alpha_report_v1',
      session_id: sessionId,
    },
  });

  return {
    statusCode: response.statusCode,
    body: response.json(),
  };
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
