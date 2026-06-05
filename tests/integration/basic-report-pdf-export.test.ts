import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FastifyInstance } from 'fastify';

import { QueueLanguageModelClient } from '../helpers/fake-language-model-client';
import { buildTestApp, readFixture } from '../helpers/test-environment';

describe('Basic Alpha report PDF export integration', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }

    vi.restoreAllMocks();
  });

  it('returns PDF bytes, headers, and an export audit event without raw model output', async () => {
    ({ app } = await buildTestApp(await createReportFlowModel()));

    const sessionId = await completeAlphaFlow(app);
    const compose = await composeReport(app, 'req-pdf-compose', sessionId);
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/sessions/${sessionId}/report.pdf`,
      headers: {
        'x-request-id': 'req-pdf-export',
      },
    });
    const pdfBytes = response.rawPayload;
    const exportId = String(response.headers['x-sokrai-export-id']);
    const reportSha256 = String(response.headers['x-sokrai-report-sha256']);
    const pdfSha256 = String(response.headers['x-sokrai-pdf-sha256']);
    const auditEvent = await app.services.database.query<{
      event_type: string;
      payload_json: Record<string, unknown>;
    }>(
      'SELECT event_type, payload_json FROM audit_events WHERE proposal_id = $1 AND event_type = $2 ORDER BY event_seq DESC LIMIT 1',
      [sessionId, 'basic_report_pdf_exported'],
    );
    const payload = auditEvent.rows[0]?.payload_json;

    expect(compose.statusCode).toBe(200);
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toMatch(/^attachment; filename="sokrai-report-/);
    expect(pdfBytes.subarray(0, 4).toString('utf8')).toBe('%PDF');
    expect(exportId).toMatch(/^[0-9a-f-]{36}$/);
    expect(reportSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(pdfSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(auditEvent.rows).toHaveLength(1);
    expect(payload).toMatchObject({
      export_id: exportId,
      report_id: compose.body.report_id,
      proposal_id: sessionId,
      report_payload_sha256: reportSha256,
      pdf_sha256: pdfSha256,
      section_count: 2,
      open_gap_count: expect.any(Number),
      source_count: expect.any(Number),
      warning_count: 3,
    });
    expect(JSON.stringify(payload)).not.toContain('raw_model_output');
    expect(JSON.stringify(payload)).not.toContain('validated_output_json');
    expect(JSON.stringify(payload)).not.toContain('prompt_name');
    expect(JSON.stringify(payload)).not.toContain('model_params_json');
  });

  it('maps invalid server-produced reports to invalid_response_contract', async () => {
    ({ app } = await buildTestApp(await createProblemOnlyModel()));

    vi.spyOn(app.services.basicReportService, 'getForSession').mockResolvedValue({
      report_id: 'report-1',
      proposal_id: 'session-1',
      report_status: 'ready',
      schema_version: 'basic-alpha-report.v1',
      raw_model_output: '{"not":"public"}',
    } as never);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/sessions/session-1/report.pdf',
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({
      error_code: 'invalid_response_contract',
      session_id: 'session-1',
    });
  });

  it('returns report_not_found before a report has been composed', async () => {
    ({ app } = await buildTestApp(await createProblemOnlyModel()));

    const strongProposal = await readFixture('start', 'strong-proposal.json');
    const strongAnswer = await readFixture('reply', 'strong-answer.json');
    const start = await startFlow(app, 'req-pdf-start-not-ready', strongProposal);
    await replyFlow(app, 'req-pdf-problem-done-not-ready', start.body.session_id, strongAnswer);
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/sessions/${start.body.session_id}/report.pdf`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error_code: 'report_not_found' });
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
    next_question: 'Que equipo o responsable responde hoy por este problema en urgencias?',
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
  const start = await startFlow(app, 'req-pdf-start', strongProposal);
  const problemReply = await replyFlow(app, 'req-pdf-problem-done', start.body.session_id, strongAnswer);
  const solutionStart = await solutionStartFlow(app, 'req-pdf-solution-start', start.body.session_id);
  const solutionReply = await solutionReplyFlow(
    app,
    'req-pdf-solution-reply',
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

  const agentResponse = await app.inject({
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
    statusCode: agentResponse.statusCode,
    body: agentResponse.json(),
  };
}
