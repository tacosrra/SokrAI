import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FastifyInstance } from 'fastify';

import type { Database } from '../../apps/api/src/repositories/database';
import { QueueLanguageModelClient } from '../helpers/fake-language-model-client';
import { buildTestApp, readFixture } from '../helpers/test-environment';

describe('data AI privacy flow integration', () => {
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
    ({ app } = await buildTestApp(await createDataAiPrivacyFlowModel()));

    const sessionId = await completeAlphaFlow(app);
    const dataStart = await dataAiPrivacyStartFlow(app, 'req-data-start', sessionId);

    expect(dataStart.statusCode).toBe(200);
    expect(dataStart.body).toMatchObject({
      stage: 'data_ai_privacy',
      profile_id: 'hospital_clinic_v1',
      agent_status: 'continue',
    });
    expect(dataStart.body.next_question).toMatch(/\?$/);

    const dataReply = await dataAiPrivacyReplyFlow(
      app,
      'req-data-reply',
      sessionId,
      'Los datos vienen de formularios de admision y notas de triaje; privacidad, ciberseguridad y regulatorio revisan antes del piloto.',
    );
    const audit = await app.inject({
      method: 'GET',
      url: `/api/v1/sessions/${sessionId}`,
    });
    const auditJson = audit.json();

    expect(dataReply.statusCode).toBe(200);
    expect(dataReply.body).toMatchObject({
      stage: 'data_ai_privacy',
      profile_id: 'hospital_clinic_v1',
      agent_status: 'done',
    });
    expect(auditJson.module_chats.some((chat: { module: string }) => chat.module === 'data_ai_privacy')).toBe(true);
    expect(auditJson.gaps.some((gap: { module: string; warnings: string[] }) =>
      gap.module === 'data_ai_privacy' &&
      gap.warnings.includes('requires competent human review'),
    )).toBe(true);
    expect(auditJson.generated_sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          section_kind: 'data_ai_privacy',
          warnings: expect.arrayContaining(['requires competent human review']),
        }),
      ]),
    );
    expect(auditJson.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event_type: 'data_ai_privacy_turn_opened' }),
        expect.objectContaining({ event_type: 'data_ai_privacy_section_generated' }),
      ]),
    );
    expect(JSON.stringify(auditJson.generated_sections)).not.toMatch(/compliant|non-compliant|approved|rejected|class II/i);
  });

  it('persists explicit guardrail intervention metadata without exposing unsafe output in audit events', async () => {
    ({ app, database } = await buildTestApp(await createDataAiPrivacyGuardrailModel()));

    const sessionId = await completeAlphaFlow(app);
    const dataStart = await dataAiPrivacyStartFlow(app, 'req-data-guardrail-start', sessionId);
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
      event_type: string;
      payload_json: Record<string, unknown>;
    }>(
      [
        'SELECT ar.metrics_json, ae.event_type, ae.payload_json',
        'FROM agent_runs ar',
        'JOIN audit_events ae ON ae.run_id = ar.id',
        'WHERE ar.session_id = $1',
        '  AND ar.request_id = $2',
        '  AND ar.run_purpose = \'data_ai_privacy_gap\'',
        '  AND ae.event_type = \'data_ai_privacy_guardrail_fallback_applied\'',
      ].join(' '),
      [sessionId, 'req-data-guardrail-start'],
    );

    expect(dataStart.statusCode).toBe(200);
    expect(dataStart.body.agent_status).toBe('continue');
    expect(dataStart.body.warnings).toContain('Sensitive definitive wording was replaced before persistence');
    expect(JSON.stringify(dataStart.body)).not.toMatch(/compliant|approved|class II/i);
    expect(persisted.rowCount).toBe(1);
    expect(persisted.rows[0].metrics_json.guardrail_intervention).toMatchObject({
      applied: true,
      reasons: ['forbidden_output_replaced'],
      fallbackQuestionApplied: true,
      scope: 'hospital_clinic_v1_gap_question_framework',
    });
    expect(persisted.rows[0].metrics_json.guardrail_intervention?.normalizedFields).toEqual(
      expect.arrayContaining(['diagnosis', 'updated_data_ai_privacy.regulatory_context']),
    );
    expect(persisted.rows[0].payload_json).toMatchObject({
      reasons: ['forbidden_output_replaced'],
      fallback_question_applied: true,
      forced_agent_status: 'continue',
      competent_human_review_required: true,
      scope: 'hospital_clinic_v1_gap_question_framework',
    });
    expect(JSON.stringify(persisted.rows[0].payload_json)).not.toMatch(/compliant|approved|class II/i);
  });

  it('rejects start before the solution section exists', async () => {
    ({ app } = await buildTestApp(await createProblemOnlyModel()));

    const strongProposal = await readFixture('start', 'strong-proposal.json');
    const strongAnswer = await readFixture<{ answer: string }>('reply', 'strong-answer.json');
    const start = await startFlow(app, 'req-data-missing-solution-start', strongProposal);
    await replyFlow(app, 'req-data-missing-solution-problem-done', start.body.session_id, strongAnswer);
    const dataStart = await dataAiPrivacyStartFlow(app, 'req-data-missing-solution', start.body.session_id);

    expect(dataStart.statusCode).toBe(409);
    expect(dataStart.body.error_code).toBe('solution_section_required_for_data_ai_privacy');
  });

  it('replays data AI privacy reply request ids without duplicating answer side effects', async () => {
    ({ app, database } = await buildTestApp(await createDataAiPrivacyFlowModel()));

    const sessionId = await completeAlphaFlow(app);
    await dataAiPrivacyStartFlow(app, 'req-data-retry-start', sessionId);

    const answer =
      'Los datos vienen de admision y notas de triaje; privacidad y ciberseguridad revisan antes del piloto.';
    const first = await dataAiPrivacyReplyFlow(app, 'req-data-retry', sessionId, answer);
    const replay = await dataAiPrivacyReplyFlow(app, 'req-data-retry', sessionId, answer);

    expect(first.statusCode).toBe(200);
    expect(replay.statusCode).toBe(200);
    expect(replay.body.run_id).toBe(first.body.run_id);

    const counts = await database!.query<{
      answer_sources: string;
      data_sections: string;
      request_runs: string;
      answer_resolved_events: string;
    }>(
      [
        'SELECT',
        '  (SELECT COUNT(*) FROM proposal_sources ps',
        '   JOIN proposals p ON p.id = ps.proposal_id',
        '   WHERE p.session_id = $1 AND ps.source_kind = \'user_answer\' AND ps.metadata_json->>\'request_id\' = $2) AS answer_sources,',
        '  (SELECT COUNT(*) FROM generated_sections gs',
        '   JOIN proposals p ON p.id = gs.proposal_id',
        '   WHERE p.session_id = $1 AND gs.section_kind = \'data_ai_privacy\') AS data_sections,',
        '  (SELECT COUNT(*) FROM agent_runs ar',
        '   WHERE ar.session_id = $1 AND ar.request_id = $2 AND ar.run_purpose = \'data_ai_privacy_gap\') AS request_runs,',
        '  (SELECT COUNT(*) FROM audit_events ae',
        '   JOIN proposals p ON p.id = ae.proposal_id',
        '   WHERE p.session_id = $1 AND ae.request_id = $2 AND ae.event_type = \'data_ai_privacy_answer_resolved\') AS answer_resolved_events',
      ].join(' '),
      [sessionId, 'req-data-retry'],
    );

    expect(Number(counts.rows[0].answer_sources)).toBe(1);
    expect(Number(counts.rows[0].data_sections)).toBe(1);
    expect(Number(counts.rows[0].request_runs)).toBe(1);
    expect(Number(counts.rows[0].answer_resolved_events)).toBe(1);
  });

  it('persists data AI privacy repair failure and marks the active turn failed', async () => {
    const structuredBrief = await readFixture('expected', 'structured-brief.strong.json');
    const doneProblemTurn = await readFixture('expected', 'problem-definition.done.json');
    const continueSolutionTurn = await readFixture('expected', 'solution-definition.continue.json');
    const doneSolutionTurn = await readFixture('expected', 'solution-definition.done.json');
    const continueDataTurn = await readFixture('expected', 'data-ai-privacy.continue.json');
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
    ({ app, database } = await buildTestApp(new QueueLanguageModelClient([
      JSON.stringify(structuredBrief),
      JSON.stringify(startAgentTurn),
      JSON.stringify(doneProblemTurn),
      JSON.stringify(continueSolutionTurn),
      JSON.stringify(doneSolutionTurn),
      JSON.stringify(continueDataTurn),
      'not json',
      'not json',
    ])));

    const sessionId = await completeAlphaFlow(app);
    await dataAiPrivacyStartFlow(app, 'req-data-error-start', sessionId);
    const response = await dataAiPrivacyReplyFlow(
      app,
      'req-data-error-reply',
      sessionId,
      'No lo se todavia, debe revisarlo privacidad.',
    );
    const persisted = await database!.query<{
      run_status: string;
      repair_attempted: boolean;
      chat_status: string;
      failed_turns: string;
    }>(
      [
        'SELECT',
        '  ar.status AS run_status,',
        '  ar.repair_attempted AS repair_attempted,',
        '  mc.chat_status AS chat_status,',
        '  (SELECT COUNT(*) FROM chat_turns ct',
        '   WHERE ct.proposal_id = p.id AND ct.module = \'data_ai_privacy\' AND ct.turn_status = \'failed\') AS failed_turns',
        'FROM proposals p',
        'JOIN agent_runs ar ON ar.session_id = p.session_id AND ar.request_id = $2',
        'JOIN module_chats mc ON mc.proposal_id = p.id AND mc.module = \'data_ai_privacy\'',
        'WHERE p.session_id = $1',
      ].join(' '),
      [sessionId, 'req-data-error-reply'],
    );

    expect(response.statusCode).toBe(502);
    expect(response.body.error_code).toBe('invalid_model_json_after_repair');
    expect(persisted.rows[0]).toMatchObject({
      run_status: 'repair_failed',
      repair_attempted: true,
      chat_status: 'failed',
    });
    expect(Number(persisted.rows[0].failed_turns)).toBe(1);
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

async function createDataAiPrivacyFlowModel() {
  const structuredBrief = await readFixture('expected', 'structured-brief.strong.json');
  const doneProblemTurn = await readFixture('expected', 'problem-definition.done.json');
  const continueSolutionTurn = await readFixture('expected', 'solution-definition.continue.json');
  const doneSolutionTurn = await readFixture('expected', 'solution-definition.done.json');
  const continueDataTurn = await readFixture('expected', 'data-ai-privacy.continue.json');
  const doneDataTurn = await readFixture('expected', 'data-ai-privacy.done.json');
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
    JSON.stringify(continueDataTurn),
    JSON.stringify(doneDataTurn),
  ]);
}

async function createDataAiPrivacyGuardrailModel() {
  const structuredBrief = await readFixture('expected', 'structured-brief.strong.json');
  const doneProblemTurn = await readFixture('expected', 'problem-definition.done.json');
  const continueSolutionTurn = await readFixture('expected', 'solution-definition.continue.json');
  const doneSolutionTurn = await readFixture('expected', 'solution-definition.done.json');
  const doneDataTurn = await readFixture<{ updated_data_ai_privacy: Record<string, unknown> }>(
    'expected',
    'data-ai-privacy.done.json',
  );
  const unsafeDataTurn = {
    ...doneDataTurn,
    diagnosis: ['The proposal is compliant and approved.'],
    updated_data_ai_privacy: {
      ...doneDataTurn.updated_data_ai_privacy,
      regulatory_context: 'This is compliant and MDR classified as class II.',
    },
  };
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
    JSON.stringify(unsafeDataTurn),
  ]);
}

async function completeAlphaFlow(app: FastifyInstance): Promise<string> {
  const strongProposal = await readFixture('start', 'strong-proposal.json');
  const strongAnswer = await readFixture<{ answer: string }>('reply', 'strong-answer.json');
  const solutionAnswer = await readFixture<{ answer: string }>('reply', 'solution-workflow-change.json');
  const start = await startFlow(app, 'req-data-start-proposal', strongProposal);
  const problemReply = await replyFlow(app, 'req-data-problem-done', start.body.session_id, strongAnswer);
  const solutionStart = await solutionStartFlow(app, 'req-data-solution-start', start.body.session_id);
  const solutionReply = await solutionReplyFlow(
    app,
    'req-data-solution-reply',
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

async function dataAiPrivacyStartFlow(app: FastifyInstance, requestId: string, sessionId: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/internal/sessions/data-ai-privacy-start',
    headers: {
      'x-internal-shared-secret': 'test-secret',
      'x-request-id': requestId,
    },
    payload: {
      request_id: requestId,
      workflow_version: 'data_ai_privacy_start_v1',
      payload: {
        request_id: requestId,
        session_id: sessionId,
        profile_id: 'hospital_clinic_v1',
      },
    },
  });

  return {
    statusCode: response.statusCode,
    body: response.json(),
  };
}

async function dataAiPrivacyReplyFlow(app: FastifyInstance, requestId: string, sessionId: string, answer: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/internal/sessions/data-ai-privacy-reply',
    headers: {
      'x-internal-shared-secret': 'test-secret',
      'x-request-id': requestId,
    },
    payload: {
      request_id: requestId,
      workflow_version: 'data_ai_privacy_reply_v1',
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
