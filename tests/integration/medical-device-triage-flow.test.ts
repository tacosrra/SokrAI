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

  it('persists medical-device guardrail intervention metadata without exposing unsafe output', async () => {
    ({ app, database } = await buildTestApp(await createMedicalDeviceGuardrailModel()));

    const sessionId = await completeClinicFlow(app, 'req-med-guardrail');
    const start = await medicalDeviceStartFlow(app, 'req-med-guardrail-start', sessionId);
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
        '  AND ar.run_purpose = \'medical_device_triage\'',
        '  AND ae.event_type = \'medical_device_triage_guardrail_fallback_applied\'',
      ].join(' '),
      [sessionId, 'req-med-guardrail-start'],
    );

    expect(start.statusCode).toBe(200);
    expect(start.body.agent_status).toBe('continue');
    expect(start.body.warnings).toContain('Definitive medical-device wording was replaced before persistence');
    expect(JSON.stringify(start.body)).not.toMatch(/is a medical device|MDR class|approved|rejected/i);
    expect(persisted.rowCount).toBe(1);
    expect(persisted.rows[0].metrics_json.guardrail_intervention).toMatchObject({
      applied: true,
      reasons: ['forbidden_output_replaced'],
      fallbackQuestionApplied: true,
      scope: 'medical_device_triage_gap_question_framework',
    });
    expect(persisted.rows[0].metrics_json.guardrail_intervention?.normalizedFields).toEqual(
      expect.arrayContaining(['diagnosis', 'updated_medical_device_triage.clinical_decision_role']),
    );
    expect(persisted.rows[0].payload_json).toMatchObject({
      reasons: ['forbidden_output_replaced'],
      fallback_question_applied: true,
      forced_agent_status: 'continue',
      competent_human_review_required: true,
      scope: 'medical_device_triage_gap_question_framework',
    });
    expect(JSON.stringify(persisted.rows[0].payload_json)).not.toMatch(/is a medical device|MDR class|approved|rejected/i);
  });

  it('persists medical-device repair failure and marks the active turn failed', async () => {
    ({ app, database } = await buildTestApp(await createMedicalDeviceRepairFailureModel()));

    const sessionId = await completeClinicFlow(app, 'req-med-error');
    await medicalDeviceStartFlow(app, 'req-med-error-start', sessionId);
    const response = await medicalDeviceReplyFlow(
      app,
      'req-med-error-reply',
      sessionId,
      'No lo se todavia, debe revisarlo una persona competente.',
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
        '   WHERE ct.proposal_id = p.id AND ct.module = \'medical_device_triage\' AND ct.turn_status = \'failed\') AS failed_turns',
        'FROM proposals p',
        'JOIN agent_runs ar ON ar.session_id = p.session_id AND ar.request_id = $2',
        'JOIN module_chats mc ON mc.proposal_id = p.id AND mc.module = \'medical_device_triage\'',
        'WHERE p.session_id = $1',
      ].join(' '),
      [sessionId, 'req-med-error-reply'],
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

  it('opens an uncertain medical-device triage turn for clinical uncertainty without explicit signals', async () => {
    ({ app, database } = await buildTestApp(await createMedicalDeviceUncertainModel()));

    const sessionId = await completeClinicFlow(app, 'req-med-uncertain');
    const start = await medicalDeviceStartFlow(app, 'req-med-uncertain-start', sessionId);
    const persisted = await database!.query<{
      gaps: string;
      turns: string;
      review_warnings: string;
    }>(
      [
        'SELECT',
        '  (SELECT COUNT(*) FROM alpha_gaps ag JOIN proposals p ON p.id = ag.proposal_id',
        '   WHERE p.session_id = $1 AND ag.module = \'medical_device_triage\') AS gaps,',
        '  (SELECT COUNT(*) FROM chat_turns ct JOIN proposals p ON p.id = ct.proposal_id',
        '   WHERE p.session_id = $1 AND ct.module = \'medical_device_triage\' AND ct.turn_status = \'awaiting_user\') AS turns,',
        '  (SELECT COUNT(*) FROM module_chats mc JOIN proposals p ON p.id = mc.proposal_id',
        '   WHERE p.session_id = $1 AND mc.module = \'medical_device_triage\'',
        '     AND mc.warnings_json ? \'requires competent human review\') AS review_warnings',
      ].join(' '),
      [sessionId],
    );

    expect(start.statusCode).toBe(200);
    expect(start.body.activation_result).toBe('uncertain');
    expect(start.body.updated_medical_device_triage.requires_competent_human_review).toBe(true);
    expect(start.body.agent_status).toBe('continue');
    expect(start.body.next_question).toMatch(/\?$/);
    expect(Number(persisted.rows[0].gaps)).toBeGreaterThan(0);
    expect(Number(persisted.rows[0].turns)).toBe(1);
    expect(Number(persisted.rows[0].review_warnings)).toBe(1);
  });

  it('returns completed status for medical-device triage start recovery without duplicating side effects', async () => {
    ({ app, database } = await buildTestApp(await createMedicalDeviceApplicableModel()));

    const sessionId = await completeClinicFlow(app, 'req-med-recover-start');
    const start = await medicalDeviceStartFlow(app, 'req-med-recover-start-run', sessionId);
    const recoverStatus = await app.inject({
      method: 'POST',
      url: '/api/v1/requests/req-med-recover-start-run/recover',
    });
    const secondRecoverStatus = await app.inject({
      method: 'POST',
      url: '/api/v1/requests/req-med-recover-start-run/recover',
    });
    const sideEffects = await database!.query<{
      request_runs: string;
      medical_chats: string;
      medical_turns: string;
      medical_sections: string;
    }>(
      [
        'SELECT',
        '  (SELECT COUNT(*) FROM agent_runs WHERE request_id = $2 AND run_purpose = \'medical_device_triage\') AS request_runs,',
        '  (SELECT COUNT(*) FROM module_chats mc JOIN proposals p ON p.id = mc.proposal_id',
        '   WHERE p.session_id = $1 AND mc.module = \'medical_device_triage\') AS medical_chats,',
        '  (SELECT COUNT(*) FROM chat_turns ct JOIN proposals p ON p.id = ct.proposal_id',
        '   WHERE p.session_id = $1 AND ct.module = \'medical_device_triage\') AS medical_turns,',
        '  (SELECT COUNT(*) FROM generated_sections gs JOIN proposals p ON p.id = gs.proposal_id',
        '   WHERE p.session_id = $1 AND gs.section_kind = \'medical_device_triage\') AS medical_sections',
      ].join(' '),
      [sessionId, 'req-med-recover-start-run'],
    );

    expect(start.statusCode).toBe(200);
    expect(recoverStatus.statusCode).toBe(200);
    expect(recoverStatus.json()).toMatchObject({
      request_id: 'req-med-recover-start-run',
      request_kind: 'medical_device_triage_start',
      status: 'completed',
      session_id: sessionId,
    });
    expect(secondRecoverStatus.json()).toMatchObject(recoverStatus.json());
    expect(sideEffects.rows[0]).toMatchObject({
      request_runs: '1',
      medical_chats: '1',
      medical_turns: '1',
      medical_sections: '0',
    });
  });

  it('actively recovers a medical-device triage reply request without duplicating side effects', async () => {
    ({ app, database } = await buildTestApp(await createMedicalDeviceReplyRecoveryModel()));

    const sessionId = await completeClinicFlow(app, 'req-med-recover-reply');
    await medicalDeviceStartFlow(app, 'req-med-recover-reply-start', sessionId);

    const firstReply = await medicalDeviceReplyFlow(
      app,
      'req-med-recover-reply-run',
      sessionId,
      'The intended-use boundary, clinical decision role, required evidence, and competent human review are documented before any pilot use.',
    );
    const pendingStatus = await app.inject({
      method: 'GET',
      url: '/api/v1/requests/req-med-recover-reply-run',
    });
    const recoverStatus = await app.inject({
      method: 'POST',
      url: '/api/v1/requests/req-med-recover-reply-run/recover',
    });
    const sideEffects = await database!.query<{
      request_runs: string;
      answer_sources: string;
      medical_turns: string;
      medical_sections: string;
    }>(
      [
        'SELECT',
        '  (SELECT COUNT(*) FROM agent_runs WHERE request_id = $2 AND run_purpose = \'medical_device_triage\') AS request_runs,',
        '  (SELECT COUNT(*) FROM proposal_sources ps JOIN proposals p ON p.id = ps.proposal_id',
        '   WHERE p.session_id = $1 AND ps.source_kind = \'user_answer\' AND ps.metadata_json->>\'request_id\' = $2) AS answer_sources,',
        '  (SELECT COUNT(*) FROM chat_turns ct JOIN proposals p ON p.id = ct.proposal_id',
        '   WHERE p.session_id = $1 AND ct.module = \'medical_device_triage\') AS medical_turns,',
        '  (SELECT COUNT(*) FROM generated_sections gs JOIN proposals p ON p.id = gs.proposal_id',
        '   WHERE p.session_id = $1 AND gs.section_kind = \'medical_device_triage\') AS medical_sections',
      ].join(' '),
      [sessionId, 'req-med-recover-reply-run'],
    );

    expect(firstReply.statusCode).toBe(500);
    expect(pendingStatus.json()).toMatchObject({
      request_id: 'req-med-recover-reply-run',
      request_kind: 'medical_device_triage_reply',
      status: 'pending',
      session_id: sessionId,
    });
    expect(recoverStatus.statusCode).toBe(200);
    expect(recoverStatus.json()).toMatchObject({
      request_id: 'req-med-recover-reply-run',
      request_kind: 'medical_device_triage_reply',
      status: 'completed',
      session_id: sessionId,
    });
    expect(sideEffects.rows[0]).toMatchObject({
      request_runs: '1',
      answer_sources: '1',
      medical_turns: '1',
      medical_sections: '1',
    });
  });

  it('persists prerequisite failures for medical-device start request recovery', async () => {
    ({ app, database } = await buildTestApp(await createDataAiPrivacyPrerequisiteMissingModel()));

    const strongProposal = await readFixture('start', 'strong-proposal.json');
    const strongAnswer = await readFixture<{ answer: string }>('reply', 'strong-answer.json');
    const solutionAnswer = await readFixture<{ answer: string }>('reply', 'solution-workflow-change.json');
    const start = await startFlow(app, 'req-med-prereq-proposal', strongProposal);
    await replyFlow(app, 'req-med-prereq-problem-done', start.body.session_id, strongAnswer);
    await solutionStartFlow(app, 'req-med-prereq-solution-start', start.body.session_id);
    await solutionReplyFlow(app, 'req-med-prereq-solution-reply', start.body.session_id, solutionAnswer);

    const medicalStart = await medicalDeviceStartFlow(app, 'req-med-prereq-start', start.body.session_id);
    const requestStatus = await app.inject({
      method: 'GET',
      url: '/api/v1/requests/req-med-prereq-start',
    });
    const recoverStatus = await app.inject({
      method: 'POST',
      url: '/api/v1/requests/req-med-prereq-start/recover',
    });
    const failedRun = await database!.query<{ status: string; error_code: string | null }>(
      'SELECT status, error_code FROM agent_runs WHERE request_id = $1 AND run_purpose = $2',
      ['req-med-prereq-start', 'medical_device_triage'],
    );
    const sideEffects = await database!.query<{
      request_runs: string;
      medical_chats: string;
      medical_turns: string;
      medical_gaps: string;
      medical_sections: string;
    }>(
      [
        'SELECT',
        '  (SELECT COUNT(*) FROM agent_runs WHERE request_id = $2 AND run_purpose = \'medical_device_triage\') AS request_runs,',
        '  (SELECT COUNT(*) FROM module_chats mc JOIN proposals p ON p.id = mc.proposal_id',
        '   WHERE p.session_id = $1 AND mc.module = \'medical_device_triage\') AS medical_chats,',
        '  (SELECT COUNT(*) FROM chat_turns ct JOIN proposals p ON p.id = ct.proposal_id',
        '   WHERE p.session_id = $1 AND ct.module = \'medical_device_triage\') AS medical_turns,',
        '  (SELECT COUNT(*) FROM alpha_gaps ag JOIN proposals p ON p.id = ag.proposal_id',
        '   WHERE p.session_id = $1 AND ag.module = \'medical_device_triage\') AS medical_gaps,',
        '  (SELECT COUNT(*) FROM generated_sections gs JOIN proposals p ON p.id = gs.proposal_id',
        '   WHERE p.session_id = $1 AND gs.section_kind = \'medical_device_triage\') AS medical_sections',
      ].join(' '),
      [start.body.session_id, 'req-med-prereq-start'],
    );

    expect(medicalStart.statusCode).toBe(409);
    expect(medicalStart.body.error_code).toBe('data_ai_privacy_section_required_for_medical_device_triage');
    expect(medicalStart.body.safe_message).toBe(
      'Generated problem, solution, and data AI privacy sections are required before medical-device triage',
    );
    expect(failedRun.rowCount).toBe(1);
    expect(failedRun.rows[0]).toMatchObject({
      status: 'controlled_error',
      error_code: 'data_ai_privacy_section_required_for_medical_device_triage',
    });
    expect(requestStatus.json()).toMatchObject({
      request_id: 'req-med-prereq-start',
      request_kind: 'medical_device_triage_start',
      status: 'failed',
      error_code: 'data_ai_privacy_section_required_for_medical_device_triage',
      session_id: start.body.session_id,
    });
    expect(recoverStatus.statusCode).toBe(200);
    expect(recoverStatus.json().status).toBe('failed');
    expect(sideEffects.rows[0]).toMatchObject({
      request_runs: '1',
      medical_chats: '0',
      medical_turns: '0',
      medical_gaps: '0',
      medical_sections: '0',
    });
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

async function createMedicalDeviceGuardrailModel() {
  const { prefix, continueMedicalTurn } = await createApplicableMedicalDeviceBaseOutputs();
  const guardrailTurn = {
    ...continueMedicalTurn,
    diagnosis: ['This is a medical device and MDR class IIb.'],
    updated_medical_device_triage: {
      ...continueMedicalTurn.updated_medical_device_triage,
      clinical_decision_role: 'This is a medical device and approved for use.',
      evidence_needed: ['MDR class IIb evidence is approved.'],
      human_review_plan: 'Rejected until MDR class is approved.',
    },
    next_question: 'Is this approved as a medical device?',
  };

  return new QueueLanguageModelClient([
    ...prefix,
    JSON.stringify(guardrailTurn),
  ]);
}

async function createMedicalDeviceRepairFailureModel() {
  const { prefix, continueMedicalTurn } = await createApplicableMedicalDeviceBaseOutputs();

  return new QueueLanguageModelClient([
    ...prefix,
    JSON.stringify(continueMedicalTurn),
    'not json',
    'not json',
  ]);
}

async function createMedicalDeviceReplyRecoveryModel() {
  const { prefix, continueMedicalTurn } = await createApplicableMedicalDeviceBaseOutputs();
  const doneMedicalTurn = {
    ...continueMedicalTurn,
    agent_status: 'done',
    updated_medical_device_triage: {
      ...continueMedicalTurn.updated_medical_device_triage,
      intended_use_claims: ['The assistant drafts risk stratification context for competent human review.'],
      clinical_decision_role: 'The assistant does not decide triage priority and requires reviewer confirmation.',
      evidence_needed: ['Clarify intended use, validation evidence, and workflow boundaries.'],
      human_review_plan: 'Clinical governance and regulatory owners review before any pilot use.',
    },
    next_question: '',
    completion_reason: 'medical-device triage gaps sufficiently clarified for human review',
  };

  return new QueueLanguageModelClient([
    ...prefix,
    JSON.stringify(continueMedicalTurn),
    new Error('transient medical-device reply failure'),
    JSON.stringify(doneMedicalTurn),
  ]);
}

async function createApplicableMedicalDeviceBaseOutputs() {
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
  const continueMedicalTurn = await readFixture<{
    agent_status: string;
    diagnosis: string[];
    updated_medical_device_triage: Record<string, unknown>;
    next_question: string;
    completion_reason: string;
  }>('expected', 'medical-device-triage.applicable.json');
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

  return {
    prefix: [
      JSON.stringify(structuredBrief),
      JSON.stringify(startAgentTurn),
      JSON.stringify(doneProblemTurn),
      JSON.stringify(continueSolutionTurn),
      JSON.stringify(doneSolutionTurn),
      JSON.stringify(continueDataTurn),
      JSON.stringify(doneDataTurn),
    ],
    continueMedicalTurn,
  };
}

async function createMedicalDeviceUncertainModel() {
  const structuredBrief = {
    ...(await readFixture<Record<string, unknown>>('expected', 'structured-brief.strong.json')),
    project_title: 'Hospital follow-up assistant',
    goal: 'Help hospital teams summarize follow-up context when ownership is unclear.',
    target_user: 'Hospital coordination staff',
    problem_owner: 'Hospital operations team',
    problem_statement: 'Follow-up ownership for patient administration is unclear across shifts.',
    evidence_of_problem: 'Hospital staff report duplicated calls and unclear handoffs.',
    current_alternatives: 'Manual notes and phone calls.',
    scope: 'Administrative follow-up coordination inside the hospital.',
    constraints_known: ['Internal pilot', 'Staff review before use'],
    assumptions: ['The assistant prepares summaries only.'],
    ambiguities: ['It is unclear whether any clinical workflow boundary is affected.'],
    missing_information: ['Needs review by hospital governance before pilot use.'],
  };
  const doneProblemTurn = {
    agent_status: 'done',
    diagnosis: ['Hospital follow-up problem is sufficiently defined.'],
    updated_problem_definition: {
      problem_owner: structuredBrief.problem_owner,
      problem_statement: structuredBrief.problem_statement,
      evidence_of_problem: structuredBrief.evidence_of_problem,
      scope: structuredBrief.scope,
      current_alternatives: structuredBrief.current_alternatives,
      assumptions: structuredBrief.assumptions,
      ambiguities_remaining: structuredBrief.ambiguities,
    },
    next_question: '',
    completion_reason: 'problem sufficiently defined',
  };
  const continueSolutionTurn = {
    agent_status: 'continue',
    diagnosis: ['Follow-up workflow details need one more clarification.'],
    updated_solution_definition: {
      solution_summary: 'A guided assistant prepares hospital follow-up summaries.',
      target_user: 'Hospital coordination staff',
      how_it_works: '',
      workflow_change: '',
      current_solutions: 'Manual notes and phone calls.',
      value_differential: '',
      scope_limits: 'Administrative follow-up coordination only.',
      assumptions: [],
      ambiguities_remaining: ['Workflow handoff details need confirmation.'],
    },
    next_question: 'How does the assistant change the hospital follow-up workflow?',
    completion_reason: '',
  };
  const doneSolutionTurn = {
    agent_status: 'done',
    diagnosis: ['Hospital follow-up solution is sufficiently defined.'],
    updated_solution_definition: {
      solution_summary: 'A guided assistant prepares hospital follow-up summaries.',
      target_user: 'Hospital coordination staff',
      how_it_works: 'It gathers administrative notes and drafts a staff-reviewed summary.',
      workflow_change: 'Staff review the summary before continuing the follow-up handoff.',
      current_solutions: 'Manual notes and phone calls.',
      value_differential: 'The summary reduces duplicated calls without changing care decisions.',
      scope_limits: 'Administrative follow-up coordination only.',
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
      personal_or_health_data: 'The pilot may use hospital follow-up notes.',
      data_sources: '',
      ai_system_role: 'The AI drafts an administrative summary for staff review.',
      validation_evidence: '',
      privacy_governance: '',
      cybersecurity_controls: '',
      regulatory_context: 'Sensitive handling remains contextual and unclear.',
      human_review_plan: '',
      assumptions: ['Outputs stay internal.'],
      uncertainties: ['Needs review by hospital governance.'],
      requires_competent_human_review: true,
    },
    next_question: 'Which hospital source systems provide the follow-up text?',
    completion_reason: '',
  };
  const doneDataTurn = {
    agent_status: 'done',
    diagnosis: ['Data sources and governance are clear for review.'],
    updated_data_ai_privacy: {
      personal_or_health_data: 'The pilot may use hospital follow-up notes.',
      data_sources: 'Data comes from hospital follow-up forms.',
      ai_system_role: 'The AI drafts an administrative summary for staff review.',
      validation_evidence: 'The team compares summaries with staff references.',
      privacy_governance: 'Privacy owners review before use.',
      cybersecurity_controls: 'Access is limited to pilot staff.',
      regulatory_context: 'Sensitive handling remains contextual and unclear.',
      human_review_plan: 'Privacy and governance owners review before use.',
      assumptions: ['Outputs stay internal.'],
      uncertainties: ['It is unclear whether any clinical workflow boundary is affected.'],
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
  const continueMedicalTurn = {
    agent_status: 'continue',
    diagnosis: ['Clinical-context uncertainty is present and intended-use boundaries need review.'],
    updated_medical_device_triage: {
      triage_status: 'uncertain',
      activation_signals: [],
      uncertainties: ['It is unclear whether any clinical workflow boundary is affected.'],
      intended_use_claims: [],
      clinical_decision_role: '',
      evidence_needed: [],
      human_review_plan: 'requires competent human review',
      needs_human_review: true,
      requires_competent_human_review: true,
    },
    next_question: 'What intended-use boundary should a competent reviewer examine before the pilot?',
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
  ]);
}

async function createDataAiPrivacyPrerequisiteMissingModel() {
  const structuredBrief = await readFixture<Record<string, unknown>>('expected', 'structured-brief.strong.json');
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
