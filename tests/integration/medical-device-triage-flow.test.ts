import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FastifyInstance } from 'fastify';

import type { Database } from '../../apps/api/src/repositories/database';
import { QueueLanguageModelClient } from '../helpers/fake-language-model-client';
import { buildTestApp, readFixture } from '../helpers/test-environment';

describe('medical-device triage flow integration', () => {
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

  it('activates, asks one question, resolves reply, generates section, and resumes audit state', async () => {
    ({ app } = await buildTestApp(await createMedicalDeviceApplicableModel()));

    const sessionId = await completeClinicFlow(app, 'req-med-applicable');
    const start = await medicalDeviceStartFlow(app, 'req-med-start', sessionId);

    expect(start.statusCode).toBe(200);
    expect(start.body).toMatchObject({
      stage: 'medical_device_triage',
      profile_id: 'hospital_clinic_v1',
      activation_result: 'applicable',
      agent_status: 'continue',
    });
    expect(start.body.next_question).toMatch(/\?$/);

    const reply = await medicalDeviceReplyFlow(
      app,
      'req-med-reply',
      sessionId,
      'The assistant drafts risk stratification suggestions for nurses, and clinical governance reviews intended use and evidence before pilot use.',
    );
    const audit = await app.inject({
      method: 'GET',
      url: `/api/v1/sessions/${sessionId}`,
    });
    const auditJson = audit.json();

    expect(reply.statusCode).toBe(200);
    expect(reply.body).toMatchObject({
      stage: 'medical_device_triage',
      activation_result: 'applicable',
      agent_status: 'done',
    });
    expect(auditJson.module_chats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          module: 'medical_device_triage',
          chat_status: 'completed',
        }),
      ]),
    );
    expect(auditJson.generated_sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          section_kind: 'medical_device_triage',
          warnings: expect.arrayContaining(['requires competent human review']),
        }),
      ]),
    );
    expect(auditJson.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event_type: 'medical_device_triage_turn_opened' }),
        expect.objectContaining({ event_type: 'medical_device_triage_section_generated' }),
      ]),
    );
    expect(JSON.stringify(auditJson.generated_sections)).not.toMatch(
      /is a medical device|not a medical device|MDR class|class II|approved|rejected/i,
    );
  });

  it('records no-signal not_applicable path without model question or definitive classification', async () => {
    ({ app, database } = await buildTestApp(await createMedicalDeviceNotApplicableModel()));

    const sessionId = await completeClinicFlow(app, 'req-med-no-signal');
    const start = await medicalDeviceStartFlow(app, 'req-med-no-signal-start', sessionId);
    const counts = await database!.query<{
      turns: string;
      runs: string;
      sections: string;
    }>(
      [
        'SELECT',
        '  (SELECT COUNT(*) FROM chat_turns ct JOIN proposals p ON p.id = ct.proposal_id',
        '   WHERE p.session_id = $1 AND ct.module = \'medical_device_triage\') AS turns,',
        '  (SELECT COUNT(*) FROM agent_runs ar',
        '   WHERE ar.session_id = $1 AND ar.request_id = $2 AND ar.run_purpose = \'medical_device_triage\') AS runs,',
        '  (SELECT COUNT(*) FROM generated_sections gs JOIN proposals p ON p.id = gs.proposal_id',
        '   WHERE p.session_id = $1 AND gs.section_kind = \'medical_device_triage\') AS sections',
      ].join(' '),
      [sessionId, 'req-med-no-signal-start'],
    );

    expect(start.statusCode).toBe(200);
    expect(start.body).toMatchObject({
      activation_result: 'not_applicable',
      agent_status: 'done',
      next_question: '',
    });
    expect(Number(counts.rows[0].turns)).toBe(0);
    expect(Number(counts.rows[0].runs)).toBe(1);
    expect(Number(counts.rows[0].sections)).toBe(1);
    expect(JSON.stringify(start.body)).not.toMatch(/not a medical device|is a medical device|classified as a medical device/i);
  });

  it('replays reply request ids without duplicating answer side effects', async () => {
    ({ app, database } = await buildTestApp(await createMedicalDeviceApplicableModel()));

    const sessionId = await completeClinicFlow(app, 'req-med-replay');
    await medicalDeviceStartFlow(app, 'req-med-replay-start', sessionId);

    const answer = 'Clinical governance reviews intended use, risk stratification boundaries, and evidence before pilot use.';
    const first = await medicalDeviceReplyFlow(app, 'req-med-replay-reply', sessionId, answer);
    const replay = await medicalDeviceReplyFlow(app, 'req-med-replay-reply', sessionId, answer);
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
        '   WHERE p.session_id = $1 AND gs.section_kind = \'medical_device_triage\') AS sections,',
        '  (SELECT COUNT(*) FROM agent_runs ar',
        '   WHERE ar.session_id = $1 AND ar.request_id = $2 AND ar.run_purpose = \'medical_device_triage\') AS request_runs,',
        '  (SELECT COUNT(*) FROM audit_events ae JOIN proposals p ON p.id = ae.proposal_id',
        '   WHERE p.session_id = $1 AND ae.request_id = $2 AND ae.event_type = \'medical_device_triage_answer_resolved\') AS answer_resolved_events',
      ].join(' '),
      [sessionId, 'req-med-replay-reply'],
    );

    expect(first.statusCode).toBe(200);
    expect(replay.statusCode).toBe(200);
    expect(replay.body.run_id).toBe(first.body.run_id);
    expect(Number(counts.rows[0].answer_sources)).toBe(1);
    expect(Number(counts.rows[0].sections)).toBe(1);
    expect(Number(counts.rows[0].request_runs)).toBe(1);
    expect(Number(counts.rows[0].answer_resolved_events)).toBe(1);
  });
});

async function createMedicalDeviceApplicableModel() {
  const structuredBrief = {
    ...(await readFixture<Record<string, unknown>>('expected', 'structured-brief.strong.json')),
    goal: 'Clarify clinical decision support and risk stratification uncertainty before pilot review.',
    problem_statement: 'The clinical decision support workflow for risk stratification is ambiguous.',
  };
  const doneProblemTurn = await readFixture('expected', 'problem-definition.done.json');
  const continueSolutionTurn = await readFixture('expected', 'solution-definition.continue.json');
  const doneSolutionTurn = await readFixture('expected', 'solution-definition.done.json');
  const continueDataTurn = await readFixture('expected', 'data-ai-privacy.continue.json');
  const doneDataTurn = await readFixture('expected', 'data-ai-privacy.done.json');
  const continueMedicalTurn = await readFixture('expected', 'medical-device-triage.applicable.json');
  const doneMedicalTurn = {
    ...continueMedicalTurn,
    agent_status: 'done',
    updated_medical_device_triage: {
      ...continueMedicalTurn.updated_medical_device_triage,
      intended_use_claims: ['The assistant drafts risk stratification suggestions for staff review.'],
      clinical_decision_role: 'The assistant may influence triage prioritization before staff review.',
      evidence_needed: ['Clarify intended use, validation evidence, and workflow boundaries.'],
      human_review_plan: 'Clinical governance and regulatory owners review before pilot use.',
    },
    next_question: '',
    completion_reason: 'medical-device triage gaps sufficiently clarified for human review',
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
    JSON.stringify(continueDataTurn),
    JSON.stringify(doneDataTurn),
    JSON.stringify(continueMedicalTurn),
    JSON.stringify(doneMedicalTurn),
  ]);
}

async function createMedicalDeviceNotApplicableModel() {
  const structuredBrief = {
    ...(await readFixture<Record<string, unknown>>('expected', 'structured-brief.strong.json')),
    project_title: 'Administrative intake assistant',
    goal: 'Reduce administrative intake paperwork delays.',
    target_user: 'Admission staff',
    problem_owner: 'Operations team',
    problem_statement: 'Manual administrative intake creates duplicated fields and long queues.',
    evidence_of_problem: 'Staff report repeated forms and avoidable waiting.',
    current_alternatives: 'Manual forms and phone calls.',
    scope: 'Administrative intake only.',
    constraints_known: ['Internal workflow pilot', 'Staff review before use'],
    assumptions: [],
    ambiguities: [],
    missing_information: [],
  };
  const doneProblemTurn = {
    agent_status: 'done',
    diagnosis: ['Administrative intake problem is sufficiently defined.'],
    updated_problem_definition: {
      problem_owner: structuredBrief.problem_owner,
      problem_statement: structuredBrief.problem_statement,
      evidence_of_problem: structuredBrief.evidence_of_problem,
      scope: structuredBrief.scope,
      current_alternatives: structuredBrief.current_alternatives,
      assumptions: structuredBrief.assumptions,
      ambiguities_remaining: [],
    },
    next_question: '',
    completion_reason: 'problem sufficiently defined',
  };
  const continueSolutionTurn = {
    agent_status: 'continue',
    diagnosis: ['Workflow handoff details need one more clarification.'],
    updated_solution_definition: {
      solution_summary: 'A guided assistant prepares administrative intake summaries.',
      target_user: 'Admission staff',
      how_it_works: '',
      workflow_change: '',
      current_solutions: 'Manual forms and phone calls.',
      value_differential: '',
      scope_limits: 'Administrative intake only.',
      assumptions: [],
      ambiguities_remaining: ['Workflow handoff details need confirmation.'],
    },
    next_question: 'How does the assistant change the administrative intake workflow?',
    completion_reason: '',
  };
  const doneSolutionTurn = {
    agent_status: 'done',
    diagnosis: ['Administrative solution is sufficiently defined.'],
    updated_solution_definition: {
      solution_summary: 'A guided assistant prepares administrative intake summaries.',
      target_user: 'Admission staff',
      how_it_works: 'It asks bounded administrative questions and prepares a staff-reviewed summary.',
      workflow_change: 'Staff review the administrative summary before continuing paperwork.',
      current_solutions: 'Manual forms and phone calls.',
      value_differential: 'The summary reduces repeated typing without changing service decisions.',
      scope_limits: 'The first version covers internal administrative intake only.',
      assumptions: ['Staff review every generated summary.'],
      ambiguities_remaining: [],
    },
    next_question: '',
    completion_reason: 'solution sufficiently defined',
  };
  const continueDataTurn = {
    agent_status: 'continue',
    diagnosis: ['Data sources need detail.'],
    updated_data_ai_privacy: {
      personal_or_health_data: 'The pilot uses administrative contact and scheduling text only.',
      data_sources: '',
      ai_system_role: 'The AI drafts an administrative summary for staff review.',
      validation_evidence: '',
      privacy_governance: '',
      cybersecurity_controls: '',
      regulatory_context: 'Sensitive handling remains contextual and review-bound.',
      human_review_plan: '',
      assumptions: ['Outputs stay internal.'],
      uncertainties: [],
      requires_competent_human_review: true,
    },
    next_question: 'Which administrative source systems provide the intake text?',
    completion_reason: '',
  };
  const doneDataTurn = {
    agent_status: 'done',
    diagnosis: ['Data sources and governance are clear for review.'],
    updated_data_ai_privacy: {
      personal_or_health_data: 'The pilot uses administrative intake text only.',
      data_sources: 'Data comes from administrative forms.',
      ai_system_role: 'The AI drafts an administrative summary for staff review.',
      validation_evidence: 'The team compares summaries with staff references.',
      privacy_governance: 'Privacy owners review before use.',
      cybersecurity_controls: 'Access is limited to pilot staff.',
      regulatory_context: 'Sensitive handling remains contextual and review-bound.',
      human_review_plan: 'Privacy and governance owners review before use.',
      assumptions: ['Outputs stay internal.'],
      uncertainties: [],
      requires_competent_human_review: true,
    },
    next_question: '',
    completion_reason: 'data AI privacy gaps sufficiently clarified for human review',
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
    next_question: 'Que equipo o responsable responde hoy por este problema?',
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

async function completeClinicFlow(app: FastifyInstance, prefix: string): Promise<string> {
  const strongProposal = await readFixture('start', 'strong-proposal.json');
  const strongAnswer = await readFixture<{ answer: string }>('reply', 'strong-answer.json');
  const solutionAnswer = await readFixture<{ answer: string }>('reply', 'solution-workflow-change.json');
  const start = await startFlow(app, `${prefix}-proposal`, strongProposal);
  const problemReply = await replyFlow(app, `${prefix}-problem-done`, start.body.session_id, strongAnswer);
  const solutionStart = await solutionStartFlow(app, `${prefix}-solution-start`, start.body.session_id);
  const solutionReply = await solutionReplyFlow(app, `${prefix}-solution-reply`, start.body.session_id, solutionAnswer);
  const dataStart = await dataAiPrivacyStartFlow(app, `${prefix}-data-start`, start.body.session_id);
  const dataReply = await dataAiPrivacyReplyFlow(
    app,
    `${prefix}-data-reply`,
    start.body.session_id,
    'Data comes from administrative forms and staff notes; governance owners review before pilot use.',
  );

  expect(problemReply.body.agent_status).toBe('done');
  expect(solutionStart.body.agent_status).toBe('continue');
  expect(solutionReply.body.agent_status).toBe('done');
  expect(dataStart.body.agent_status).toBe('continue');
  expect(dataReply.body.agent_status).toBe('done');

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

async function medicalDeviceStartFlow(app: FastifyInstance, requestId: string, sessionId: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/internal/sessions/medical-device-triage-start',
    headers: {
      'x-internal-shared-secret': 'test-secret',
      'x-request-id': requestId,
    },
    payload: {
      request_id: requestId,
      workflow_version: 'medical_device_triage_start_v1',
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

async function medicalDeviceReplyFlow(app: FastifyInstance, requestId: string, sessionId: string, answer: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/internal/sessions/medical-device-triage-reply',
    headers: {
      'x-internal-shared-secret': 'test-secret',
      'x-request-id': requestId,
    },
    payload: {
      request_id: requestId,
      workflow_version: 'medical_device_triage_reply_v1',
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
