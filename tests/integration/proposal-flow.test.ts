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
      chat_turns_count: string;
      resolved_gaps_count: string;
      generated_sections_count: string;
      user_answer_sources_count: string;
    }>(
      [
        'SELECT',
        '  (SELECT COUNT(*)::text FROM proposals WHERE id = $1) AS proposals_count,',
        '  (SELECT COUNT(*)::text FROM proposal_documents WHERE proposal_id = $1) AS documents_count,',
        '  (SELECT COUNT(*)::text FROM proposal_sources WHERE proposal_id = $1) AS sources_count,',
        '  (SELECT COUNT(*)::text FROM module_chats WHERE proposal_id = $1 AND module = \'problem\') AS problem_chats_count,',
        '  (SELECT COUNT(*)::text FROM chat_turns WHERE proposal_id = $1 AND module = \'problem\') AS chat_turns_count,',
        '  (SELECT COUNT(*)::text FROM alpha_gaps WHERE proposal_id = $1 AND module = \'problem\' AND gap_status = \'resolved\') AS resolved_gaps_count,',
        '  (SELECT COUNT(*)::text FROM generated_sections WHERE proposal_id = $1 AND section_kind = \'problem\' AND section_status = \'generated\' AND section_version = 1) AS generated_sections_count,',
        '  (SELECT COUNT(*)::text FROM proposal_sources WHERE proposal_id = $1 AND source_kind = \'user_answer\') AS user_answer_sources_count',
      ].join(' '),
      [startResult.body.session_id],
    );
    const alphaChatTurns = await app.services.database.query<{
      turn_seq: number;
      answer_text: string | null;
      turn_status: string;
      agent_status: string | null;
      gap_refs_json: string[];
      source_refs_json: Array<{ source_kind: string }>;
    }>(
      [
        'SELECT turn_seq, answer_text, turn_status, agent_status, gap_refs_json, source_refs_json',
        'FROM chat_turns',
        'WHERE proposal_id = $1 AND module = \'problem\'',
        'ORDER BY turn_seq ASC',
      ].join(' '),
      [startResult.body.session_id],
    );
    const moduleChats = await app.services.database.query<{
      chat_status: string;
      active_turn_id: string | null;
    }>(
      [
        'SELECT chat_status, active_turn_id',
        'FROM module_chats',
        'WHERE proposal_id = $1 AND module = \'problem\'',
      ].join(' '),
      [startResult.body.session_id],
    );
    const activeLegacyTurns = await app.services.database.query<{ count: string }>(
      [
        'SELECT COUNT(*)::text AS count',
        'FROM conversation_turns',
        'WHERE session_id = $1 AND status IN (\'awaiting_user\', \'processing\')',
      ].join(' '),
      [startResult.body.session_id],
    );
    const generatedSections = await app.services.database.query<{
      section_id: string;
      section_kind: string;
      section_status: string;
      section_version: number;
      title: string;
      content_markdown: string;
      source_refs_json: Array<{ source_kind: string }>;
      gap_refs_json: string[];
      generated_by_run_id: string | null;
    }>(
      [
        'SELECT id AS section_id, section_kind, section_status, section_version, title, content_markdown, source_refs_json, gap_refs_json, generated_by_run_id',
        'FROM generated_sections',
        'WHERE proposal_id = $1 AND section_kind = \'problem\'',
      ].join(' '),
      [startResult.body.session_id],
    );
    const sectionAuditEvents = await app.services.database.query<{
      event_type: string;
      payload_json: {
        section_id?: string;
        section_version?: number;
        source_refs?: string[];
        gap_refs?: string[];
      };
    }>(
      [
        'SELECT event_type, payload_json',
        'FROM audit_events',
        'WHERE proposal_id = $1 AND event_type = \'problem_section_generated\'',
      ].join(' '),
      [startResult.body.session_id],
    );
    const audit = await app.inject({
      method: 'GET',
      url: `/api/v1/sessions/${startResult.body.session_id}`,
    });

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
    expect(alphaRows.rows[0]).toMatchObject({
      proposals_count: '1',
      documents_count: '1',
      sources_count: '3',
      problem_chats_count: '1',
      chat_turns_count: '1',
      generated_sections_count: '1',
      user_answer_sources_count: '1',
    });
    expect(Number(alphaRows.rows[0]?.resolved_gaps_count)).toBeGreaterThan(0);
    expect(moduleChats.rows[0]).toEqual({
      chat_status: 'completed',
      active_turn_id: null,
    });
    expect(activeLegacyTurns.rows[0]).toEqual({ count: '0' });
    expect(alphaChatTurns.rows[0]).toMatchObject({
      turn_seq: 1,
      turn_status: 'resolved',
      agent_status: 'done',
    });
    expect(alphaChatTurns.rows[0]?.answer_text?.toLowerCase()).toContain('enfermeria');
    expect(alphaChatTurns.rows[0]?.gap_refs_json.length).toBeGreaterThan(0);
    expect(alphaChatTurns.rows[0]?.source_refs_json).toEqual([
      expect.objectContaining({ source_kind: 'user_answer' }),
    ]);
    expect(generatedSections.rows[0]).toMatchObject({
      section_kind: 'problem',
      section_status: 'generated',
      section_version: 1,
      title: 'Problem definition',
      generated_by_run_id: runs.rows[2] ? expect.any(String) : null,
    });
    expect(generatedSections.rows[0]?.source_refs_json).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source_kind: 'pasted_text' }),
        expect.objectContaining({ source_kind: 'user_answer' }),
      ]),
    );
    expect(generatedSections.rows[0]?.source_refs_json).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source_kind: 'generated_section' }),
      ]),
    );
    expect(generatedSections.rows[0]?.gap_refs_json.length).toBeGreaterThan(0);
    expect(generatedSections.rows[0]?.content_markdown).toContain('## Problem owner');
    expect(generatedSections.rows[0]?.content_markdown).not.toMatch(/solution|Clinic Pilot|piloto clinico|soluci[oó]n/i);
    expect(sectionAuditEvents.rows).toEqual([
      {
        event_type: 'problem_section_generated',
        payload_json: expect.objectContaining({
          section_id: generatedSections.rows[0]?.section_id,
          section_version: 1,
          source_refs: expect.any(Array),
          gap_refs: expect.any(Array),
        }),
      },
    ]);
    expect(sectionAuditEvents.rows[0]?.payload_json.source_refs?.length).toBeGreaterThan(0);
    expect(sectionAuditEvents.rows[0]?.payload_json.gap_refs?.length).toBeGreaterThan(0);
    expect(audit.statusCode).toBe(200);
    expect(audit.json().module_chats[0]).toMatchObject({
      chat_status: 'completed',
    });
    expect(audit.json().module_chats[0].active_turn_id ?? null).toBeNull();
    expect(audit.json().module_chats[0].turns[0].gap_refs.length).toBeGreaterThan(0);
    expect(audit.json().generated_sections[0]).toMatchObject({
      section_kind: 'problem',
      section_version: 1,
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

  it('continues from generated problem section into generated solution section', async () => {
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

    ({ app } = await buildTestApp(
      new QueueLanguageModelClient([
        JSON.stringify(structuredBrief),
        JSON.stringify(startAgentTurn),
        JSON.stringify(doneProblemTurn),
        JSON.stringify(continueSolutionTurn),
        JSON.stringify(doneSolutionTurn),
      ]),
    ));

    const strongProposal = await readFixture('start', 'strong-proposal.json');
    const strongAnswer = await readFixture('reply', 'strong-answer.json');
    const solutionAnswer = await readFixture('reply', 'solution-workflow-change.json');

    const startResult = await startFlow(app, 'req-start-solution-path', strongProposal);
    const problemReplyResult = await replyFlow(app, 'req-problem-done-solution-path', startResult.body.session_id, strongAnswer);
    expect(problemReplyResult.body.agent_status).toBe('done');

    const solutionStartResult = await solutionStartFlow(app, 'req-solution-start', startResult.body.session_id);
    expect(solutionStartResult.statusCode).toBe(200);
    expect(solutionStartResult.body.stage).toBe('solution_definition');
    expect(solutionStartResult.body.agent_status).toBe('continue');

    const solutionReplyResult = await solutionReplyFlow(app, 'req-solution-reply', startResult.body.session_id, solutionAnswer);
    expect(solutionReplyResult.statusCode).toBe(200);
    expect(solutionReplyResult.body.agent_status).toBe('done');

    const generatedSections = await app.services.database.query<{
      section_kind: string;
      content_markdown: string;
      source_refs_json: Array<{ source_kind: string }>;
    }>(
      [
        'SELECT section_kind, content_markdown, source_refs_json',
        'FROM generated_sections',
        'WHERE proposal_id = $1 AND section_status = \'generated\'',
        'ORDER BY section_kind ASC',
      ].join(' '),
      [startResult.body.session_id],
    );
    const solutionChat = await app.services.database.query<{
      chat_status: string;
      active_turn_id: string | null;
    }>(
      'SELECT chat_status, active_turn_id FROM module_chats WHERE proposal_id = $1 AND module = \'solution\'',
      [startResult.body.session_id],
    );
    const solutionRuns = await app.services.database.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM agent_runs WHERE session_id = $1 AND run_purpose = \'solution_definition\'',
      [startResult.body.session_id],
    );
    const audit = await app.inject({
      method: 'GET',
      url: `/api/v1/sessions/${startResult.body.session_id}`,
    });
    const solutionStartStatus = await app.inject({
      method: 'GET',
      url: '/api/v1/requests/req-solution-start',
    });
    const solutionReplyStatus = await app.inject({
      method: 'GET',
      url: '/api/v1/requests/req-solution-reply',
    });
    const duplicateSolutionStart = await solutionStartFlow(
      app,
      'req-solution-start-after-complete',
      startResult.body.session_id,
    );

    expect(generatedSections.rows.map((section) => section.section_kind)).toEqual(['problem', 'solution']);
    expect(generatedSections.rows.find((section) => section.section_kind === 'solution')?.content_markdown).toContain('## Solution summary');
    expect(generatedSections.rows.find((section) => section.section_kind === 'solution')?.content_markdown).not.toMatch(/pricing|budget|regulatory|medical device|RAG|ranking/i);
    expect(generatedSections.rows.find((section) => section.section_kind === 'solution')?.source_refs_json).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source_kind: 'user_answer' }),
      ]),
    );
    expect(solutionChat.rows[0]).toEqual({
      chat_status: 'completed',
      active_turn_id: null,
    });
    expect(solutionRuns.rows[0]).toEqual({ count: '2' });
    expect(audit.json().generated_sections.map((section: { section_kind: string }) => section.section_kind)).toEqual(
      expect.arrayContaining(['problem', 'solution']),
    );
    expect(solutionStartStatus.json()).toMatchObject({
      request_id: 'req-solution-start',
      request_kind: 'solution_start',
      status: 'completed',
      session_id: startResult.body.session_id,
    });
    expect(solutionReplyStatus.json()).toMatchObject({
      request_id: 'req-solution-reply',
      request_kind: 'solution_reply',
      status: 'completed',
      session_id: startResult.body.session_id,
    });
    expect(duplicateSolutionStart.statusCode).toBe(409);
    expect(duplicateSolutionStart.body).toMatchObject({
      error_code: 'solution_start_already_completed',
    });
  });

  it('replays solution reply request ids without duplicating answer side effects', async () => {
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

    ({ app } = await buildTestApp(
      new QueueLanguageModelClient([
        JSON.stringify(structuredBrief),
        JSON.stringify(startAgentTurn),
        JSON.stringify(doneProblemTurn),
        JSON.stringify(continueSolutionTurn),
        JSON.stringify(doneSolutionTurn),
      ]),
    ));

    const strongProposal = await readFixture('start', 'strong-proposal.json');
    const strongAnswer = await readFixture('reply', 'strong-answer.json');
    const solutionAnswer = await readFixture('reply', 'solution-workflow-change.json');

    const startResult = await startFlow(app, 'req-start-solution-retry', strongProposal);
    await replyFlow(app, 'req-problem-done-solution-retry', startResult.body.session_id, strongAnswer);
    await solutionStartFlow(app, 'req-solution-start-retry', startResult.body.session_id);

    const first = await solutionReplyFlow(
      app,
      'req-solution-retry',
      startResult.body.session_id,
      solutionAnswer,
    );
    const secondAppend = await appendSolutionReply(app, 'req-solution-retry', {
      request_id: 'req-solution-retry',
      session_id: startResult.body.session_id,
      answer: solutionAnswer.answer,
    });
    const secondRun = await app.inject({
      method: 'POST',
      url: '/internal/agents/solution-definition/run',
      headers: {
        'x-internal-shared-secret': 'test-secret',
        'x-request-id': 'req-solution-retry',
      },
      payload: {
        request_id: 'req-solution-retry',
        workflow_version: 'agent_solution_definition_v1',
        session_id: startResult.body.session_id,
        trigger: 'reply',
      },
    });

    expect(first.body.agent_status).toBe('done');
    expect(secondAppend.statusCode).toBe(200);
    expect(secondRun.statusCode).toBe(200);
    expect(secondRun.json().agent_status).toBe('done');

    const rows = await app.services.database.query<{
      solution_answer_sources_count: string;
      solution_sections_count: string;
      solution_runs_count: string;
    }>(
      [
        'SELECT',
        '  (SELECT COUNT(*)::text FROM proposal_sources WHERE proposal_id = $1 AND source_kind = \'user_answer\' AND label LIKE \'Solution answer%\') AS solution_answer_sources_count,',
        '  (SELECT COUNT(*)::text FROM generated_sections WHERE proposal_id = $1 AND section_kind = \'solution\') AS solution_sections_count,',
        '  (SELECT COUNT(*)::text FROM agent_runs WHERE session_id = $1 AND request_id = $2 AND run_purpose = \'solution_definition\') AS solution_runs_count',
      ].join(' '),
      [startResult.body.session_id, 'req-solution-retry'],
    );

    expect(rows.rows[0]).toEqual({
      solution_answer_sources_count: '1',
      solution_sections_count: '1',
      solution_runs_count: '1',
    });
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
        problem_owner: 'Enfermeria de admision',
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

    const alphaSideEffects = await app.services.database.query<{
      resolved_gaps_count: string;
      generated_sections_count: string;
    }>(
      [
        'SELECT',
        '  (SELECT COUNT(*)::text FROM alpha_gaps WHERE proposal_id = $1 AND module = \'problem\' AND gap_status = \'resolved\') AS resolved_gaps_count,',
        '  (SELECT COUNT(*)::text FROM generated_sections WHERE proposal_id = $1 AND section_kind = \'problem\') AS generated_sections_count',
      ].join(' '),
      [startResult.body.session_id],
    );

    expect(alphaSideEffects.rows[0]).toEqual({
      resolved_gaps_count: '0',
      generated_sections_count: '0',
    });
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
    const alphaRows = await app.services.database.query<{
      proposals_count: string;
      chat_turns_count: string;
      generated_sections_count: string;
    }>(
      [
        'SELECT',
        '  (SELECT COUNT(*)::text FROM proposals) AS proposals_count,',
        '  (SELECT COUNT(*)::text FROM chat_turns) AS chat_turns_count,',
        '  (SELECT COUNT(*)::text FROM generated_sections) AS generated_sections_count',
      ].join(' '),
    );

    expect(sessions.rows[0]?.count).toBe('0');
    expect(runs.rows[0]?.count).toBe('0');
    expect(alphaRows.rows[0]).toEqual({
      proposals_count: '0',
      chat_turns_count: '0',
      generated_sections_count: '0',
    });
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

async function solutionStartFlow(app: FastifyInstance, requestId: string, sessionId: string) {
  const agentResponse = await app.inject({
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
    statusCode: agentResponse.statusCode,
    body: agentResponse.json(),
  };
}

async function solutionReplyFlow(app: FastifyInstance, requestId: string, sessionId: string, replyFixture: { answer: string }) {
  const appendReplyResponse = await appendSolutionReply(app, requestId, {
    request_id: requestId,
    session_id: sessionId,
    answer: replyFixture.answer,
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

async function appendSolutionReply(app: FastifyInstance, requestId: string, payload: unknown) {
  return app.inject({
    method: 'POST',
    url: '/internal/sessions/solution-reply',
    headers: {
      'x-internal-shared-secret': 'test-secret',
      'x-request-id': requestId,
    },
    payload: {
      request_id: requestId,
      workflow_version: 'solution_reply_v1',
      payload,
    },
  });
}
