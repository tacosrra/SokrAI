import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FastifyInstance } from 'fastify';

import type {
  AiCompletionResult,
  AiGenerationParams,
  AiProviderPort,
} from '../../apps/api/src/services/ai-provider';
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
      [
        'SELECT run_purpose, prompt_version, model_provider, model_name, model_params_json',
        'FROM agent_runs',
        'ORDER BY',
        "  CASE run_purpose WHEN 'brief_extraction' THEN 0 ELSE 1 END ASC,",
        '  turn_seq ASC NULLS FIRST,',
        '  attempt_no ASC,',
        '  id ASC',
      ].join(' '),
    );
    const snapshots = await app.services.database.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM session_snapshots',
    );
    const snapshotVersions = await app.services.database.query<{
      snapshot_seq: number;
      state_version: string;
    }>(
      [
        'SELECT snapshot_seq, state_version::text AS state_version',
        'FROM session_snapshots',
        'WHERE session_id = $1',
        'ORDER BY snapshot_seq ASC',
      ].join(' '),
      [startResult.body.session_id],
    );
    const sessionHead = await app.services.database.query<{ state_version: string }>(
      'SELECT state_version::text AS state_version FROM proposal_sessions WHERE id = $1',
      [startResult.body.session_id],
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
    expect(snapshotVersions.rows).toEqual([
      { snapshot_seq: 0, state_version: '0' },
      { snapshot_seq: 1, state_version: '1' },
      { snapshot_seq: 2, state_version: '2' },
    ]);
    expect(sessionHead.rows[0]?.state_version).toBe('2');
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

  it('persists a preparing solution chat before the background prefetch model call finishes', async () => {
    const structuredBrief = await readFixture('expected', 'structured-brief.strong.json');
    const doneTurn = await readFixture('expected', 'problem-definition.done.json');
    const solutionContinue = await readFixture('expected', 'solution-definition.continue.json');
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
    const model = new BlockingPrefetchModel([
      JSON.stringify(structuredBrief),
      JSON.stringify(startAgentTurn),
      JSON.stringify(doneTurn),
    ]);

    ({ app } = await buildTestApp(model, {
      config: {
        phasePrefetchEnabled: true,
      },
    }));

    const strongProposal = await readFixture('start', 'strong-proposal.json');
    const strongAnswer = await readFixture('reply', 'strong-answer.json');
    const startResult = await startFlow(app, 'req-prefetch-start', strongProposal);
    const replyResult = await replyFlow(app, 'req-prefetch-problem-done', startResult.body.session_id, strongAnswer);

    expect(replyResult.statusCode).toBe(200);
    expect(replyResult.body.agent_status).toBe('done');

    const preparingChat = await app.services.database.query<{ chat_status: string }>(
      'SELECT chat_status FROM module_chats WHERE proposal_id = $1 AND module = $2',
      [replyResult.body.session_id, 'solution'],
    );

    expect(preparingChat.rows[0]).toMatchObject({
      chat_status: 'preparing',
    });

    model.resolvePrefetch(JSON.stringify(solutionContinue));
    await waitForModuleChatStatus(app, replyResult.body.session_id, 'solution', 'waiting_for_user');
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

  it('blocks premature initial problem completion and opens a clarification question', async () => {
    const demoBrief = {
      project_title: 'Asistente administrativo ficticio',
      goal: 'Ordenar solicitudes administrativas antes de revision humana',
      target_user: 'Personal administrativo interno',
      problem_owner: '',
      problem_statement: 'Solicitudes administrativas mezclan tramites y sintomas imprecisos.',
      evidence_of_problem: 'En una semana simulada hubo 240 solicitudes y derivaciones innecesarias a enfermeria.',
      current_alternatives: 'El personal administrativo lee cada mensaje y deriva a enfermeria cuando duda.',
      scope: 'Centro de salud ficticio, adultos y mensajes administrativos internos.',
      constraints_known: ['No usar datos reales de pacientes'],
      assumptions: [],
      ambiguities: [
        'No esta claro cual es exactamente el cuello de botella principal',
        'No esta claro quien debe ser el owner del problema',
        'No esta claro que evidencia minima necesitan',
      ],
      missing_information: ['problem_owner', 'assumptions'],
    };
    const prematureDone = {
      agent_status: 'done',
      diagnosis: ['El modelo intenta cerrar desde la propuesta inicial.'],
      updated_problem_definition: {
        problem_owner: 'Personal administrativo del centro de salud',
        problem_statement: demoBrief.problem_statement,
        evidence_of_problem: demoBrief.evidence_of_problem,
        scope: demoBrief.scope,
        current_alternatives: demoBrief.current_alternatives,
        assumptions: ['El cuello de botella puede ser clasificacion, falta de datos o ausencia de flujo comun.'],
        ambiguities_remaining: [],
      },
      next_question: '',
      completion_reason: 'problem sufficiently defined',
    };

    ({ app } = await buildTestApp(
      new QueueLanguageModelClient([
        JSON.stringify(demoBrief),
        JSON.stringify(prematureDone),
      ]),
    ));

    const demoProposal = {
      project_title: 'Asistente administrativo ficticio',
      goal: 'Ordenar solicitudes administrativas antes de revision humana',
      proposal_text: [
        'Un centro de salud ficticio recibe muchas consultas administrativas por telefono y por portal digital.',
        'Algunas son simples, pero otras mencionan sintomas de forma imprecisa.',
        'La idea inicial es usar IA para ordenar estas solicitudes antes de que una persona las revise.',
        'Aun no sabemos cual es exactamente el cuello de botella principal, quien debe ser el owner del problema, que evidencia minima necesitamos ni que parte del flujo deberia cambiar.',
      ].join(' '),
    };

    const startResult = await startFlow(app, 'req-start-premature-problem', demoProposal);

    expect(startResult.statusCode).toBe(200);
    expect(startResult.body.agent_status).toBe('continue');
    expect(startResult.body.next_question).toContain('?');
    expect(startResult.body.warnings).toContain(
      'Model marked the lane as done while unresolved clarification signals remained',
    );

    const sideEffects = await app.services.database.query<{
      generated_sections_count: string;
      problem_turns_count: string;
      problem_chat_status: string;
    }>(
      [
        'SELECT',
        '  (SELECT COUNT(*)::text FROM generated_sections WHERE proposal_id = $1 AND section_kind = \'problem\') AS generated_sections_count,',
        '  (SELECT COUNT(*)::text FROM chat_turns WHERE proposal_id = $1 AND module = \'problem\') AS problem_turns_count,',
        '  (SELECT chat_status FROM module_chats WHERE proposal_id = $1 AND module = \'problem\') AS problem_chat_status',
      ].join(' '),
      [startResult.body.session_id],
    );

    expect(sideEffects.rows[0]).toEqual({
      generated_sections_count: '0',
      problem_turns_count: '1',
      problem_chat_status: 'waiting_for_user',
    });
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

  it('blocks premature initial solution completion when raw output asks for clarification', async () => {
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
    const contradictorySolutionDone = {
      agent_status: 'done',
      diagnosis: [
        'The solution summary is not clear yet.',
        'Target users need clarification.',
        'Operational steps need details.',
      ],
      updated_solution_definition: {
        solution_summary: 'A guided assistant prepares structured administrative request summaries.',
        target_user: 'Administrative intake staff',
        how_it_works: 'It reads a fictitious request, asks bounded clarification questions, and prepares a review summary.',
        workflow_change: 'Staff review the structured summary before deciding whether to resolve or escalate.',
        current_solutions: 'Current work relies on manual message reading and informal escalation.',
        value_differential: 'The assistant makes review more consistent without taking clinical decisions.',
        scope_limits: 'The first version covers fictitious adult administrative messages and excludes diagnosis.',
        assumptions: ['Staff can review every suggested classification before acting.'],
        ambiguities_remaining: [],
      },
      next_question: 'Who exactly uses the assistant and what operational step changes first?',
      completion_reason: 'The next step is to provide more details.',
    };

    ({ app } = await buildTestApp(
      new QueueLanguageModelClient([
        JSON.stringify(structuredBrief),
        JSON.stringify(startAgentTurn),
        JSON.stringify(doneProblemTurn),
        JSON.stringify(contradictorySolutionDone),
      ]),
    ));

    const strongProposal = await readFixture('start', 'strong-proposal.json');
    const strongAnswer = await readFixture('reply', 'strong-answer.json');

    const startResult = await startFlow(app, 'req-start-premature-solution', strongProposal);
    await replyFlow(app, 'req-problem-done-premature-solution', startResult.body.session_id, strongAnswer);

    const solutionStartResult = await solutionStartFlow(
      app,
      'req-solution-premature-start',
      startResult.body.session_id,
    );

    expect(solutionStartResult.statusCode).toBe(200);
    expect(solutionStartResult.body.agent_status).toBe('continue');
    expect(solutionStartResult.body.next_question).toBe(
      'Who exactly uses the assistant and what operational step changes first?',
    );
    expect(solutionStartResult.body.warnings).toContain(
      'Model marked solution lane as done while unresolved clarification signals remained',
    );

    const sideEffects = await app.services.database.query<{
      solution_sections_count: string;
      solution_turns_count: string;
      solution_chat_status: string;
    }>(
      [
        'SELECT',
        '  (SELECT COUNT(*)::text FROM generated_sections WHERE proposal_id = $1 AND section_kind = \'solution\') AS solution_sections_count,',
        '  (SELECT COUNT(*)::text FROM chat_turns WHERE proposal_id = $1 AND module = \'solution\') AS solution_turns_count,',
        '  (SELECT chat_status FROM module_chats WHERE proposal_id = $1 AND module = \'solution\') AS solution_chat_status',
      ].join(' '),
      [startResult.body.session_id],
    );

    expect(sideEffects.rows[0]).toEqual({
      solution_sections_count: '0',
      solution_turns_count: '1',
      solution_chat_status: 'waiting_for_user',
    });
  });

  it('persists each solution clarification question as an auditable gap', async () => {
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
    const clarifiedButAskingFirstQuestion = {
      agent_status: 'done',
      diagnosis: [
        'The solution summary is mostly clear but needs one operational clarification.',
      ],
      updated_solution_definition: {
        solution_summary: 'A guided assistant prepares structured administrative request summaries.',
        target_user: 'Administrative intake staff',
        how_it_works: 'It reads a fictitious request, asks bounded clarification questions, and prepares a review summary.',
        workflow_change: 'Staff review the structured summary before deciding whether to resolve or escalate.',
        current_solutions: 'Current work relies on manual message reading and informal escalation.',
        value_differential: 'The assistant makes review more consistent without taking clinical decisions.',
        scope_limits: 'The first version covers fictitious adult administrative messages and excludes diagnosis.',
        assumptions: ['Staff can review every suggested classification before acting.'],
        ambiguities_remaining: [],
      },
      next_question: 'Who exactly uses the assistant and what operational step changes first?',
      completion_reason: 'The next step is to provide more details.',
    };
    const clarifiedButAskingSecondQuestion = {
      ...clarifiedButAskingFirstQuestion,
      diagnosis: [
        'The solution still needs clarification about collected information and evaluation.',
      ],
      next_question: 'What information will the assistant collect and how will the pilot evaluate usefulness?',
    };

    ({ app } = await buildTestApp(
      new QueueLanguageModelClient([
        JSON.stringify(structuredBrief),
        JSON.stringify(startAgentTurn),
        JSON.stringify(doneProblemTurn),
        JSON.stringify(clarifiedButAskingFirstQuestion),
        JSON.stringify(clarifiedButAskingSecondQuestion),
      ]),
    ));

    const strongProposal = await readFixture('start', 'strong-proposal.json');
    const strongAnswer = await readFixture('reply', 'strong-answer.json');
    const solutionAnswer = await readFixture('reply', 'solution-workflow-change.json');

    const startResult = await startFlow(app, 'req-start-solution-question-gaps', strongProposal);
    await replyFlow(app, 'req-problem-done-solution-question-gaps', startResult.body.session_id, strongAnswer);
    await solutionStartFlow(app, 'req-solution-question-gap-start', startResult.body.session_id);
    await solutionReplyFlow(
      app,
      'req-solution-question-gap-reply',
      startResult.body.session_id,
      solutionAnswer,
    );

    const rows = await app.services.database.query<{
      id: string;
      gap_status: string;
      resolved_by_turn_id: string | null;
      question_hint: string | null;
    }>(
      [
        'SELECT id, gap_status, resolved_by_turn_id, question_hint',
        'FROM alpha_gaps',
        'WHERE proposal_id = $1',
        '  AND module = \'solution\'',
        '  AND origin = \'system_rule\'',
        '  AND gap_kind = \'ambiguous_information\'',
        'ORDER BY created_at ASC, id ASC',
      ].join(' '),
      [startResult.body.session_id],
    );
    const turns = await app.services.database.query<{
      turn_seq: number;
      question_text: string;
      turn_status: string;
      gap_refs_json: string[];
    }>(
      [
        'SELECT turn_seq, question_text, turn_status, gap_refs_json',
        'FROM chat_turns',
        'WHERE proposal_id = $1 AND module = \'solution\'',
        'ORDER BY turn_seq ASC',
      ].join(' '),
      [startResult.body.session_id],
    );

    expect(rows.rows).toHaveLength(2);
    expect(rows.rows.map((row) => row.gap_status)).toEqual(['resolved', 'in_progress']);
    expect(rows.rows[0]?.resolved_by_turn_id).toBeTruthy();
    expect(rows.rows.map((row) => row.question_hint)).toEqual([
      'Who exactly uses the assistant and what operational step changes first?',
      'What information will the assistant collect and how will the pilot evaluate usefulness?',
    ]);
    expect(turns.rows).toEqual([
      expect.objectContaining({
        turn_seq: 1,
        turn_status: 'resolved',
        gap_refs_json: expect.arrayContaining([rows.rows[0]?.id]),
      }),
      expect.objectContaining({
        turn_seq: 2,
        turn_status: 'awaiting_user',
        gap_refs_json: expect.arrayContaining([rows.rows[1]?.id]),
      }),
    ]);
  });

  it('closes solution with available information when the final allowed turn is answered', async () => {
    const structuredBrief = await readFixture('expected', 'structured-brief.strong.json');
    const doneProblemTurn = await readFixture('expected', 'problem-definition.done.json');
    const continueSolutionTurn = await readFixture('expected', 'solution-definition.continue.json');
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
    const continueAfterFinalAnswer = {
      agent_status: 'continue',
      diagnosis: [
        'The solution could ask one more detail, but the bounded interview has reached its limit.',
      ],
      updated_solution_definition: {
        solution_summary: 'A guided intake assistant prepares structured operational summaries before human review.',
        target_user: 'Admission staff',
        how_it_works: 'Staff enter synthetic intake facts and the assistant turns them into a structured summary.',
        workflow_change: 'Admission staff review a generated summary before deciding whether to resolve or escalate.',
        current_solutions: 'Current work relies on manual notes and internal calls.',
        value_differential: 'The assistant makes the summary more consistent without making clinical decisions.',
        scope_limits: 'The pilot uses only synthetic adult administrative cases and excludes diagnosis or prioritization.',
        assumptions: [
          'Admission staff can review every generated summary before acting.',
        ],
        ambiguities_remaining: [
          'One additional evaluation assumption could still be validated later.',
        ],
      },
      next_question: 'What final evaluation assumption still needs validation?',
      completion_reason: '',
    };

    ({ app } = await buildTestApp(
      new QueueLanguageModelClient([
        JSON.stringify(structuredBrief),
        JSON.stringify(startAgentTurn),
        JSON.stringify(doneProblemTurn),
        JSON.stringify(continueSolutionTurn),
        JSON.stringify(continueSolutionTurn),
        JSON.stringify(continueAfterFinalAnswer),
      ]),
      {
        config: {
          maxTurnsPerSession: 2,
        },
      },
    ));

    const strongProposal = await readFixture('start', 'strong-proposal.json');
    const strongAnswer = await readFixture('reply', 'strong-answer.json');
    const solutionAnswer = await readFixture('reply', 'solution-workflow-change.json');
    const startResult = await startFlow(app, 'req-solution-final-turn-start', strongProposal);
    const sessionId = startResult.body.session_id;
    const problemReply = await replyFlow(app, 'req-solution-final-turn-problem-reply', sessionId, strongAnswer);
    const solutionStart = await solutionStartFlow(app, 'req-solution-final-turn-open', sessionId);
    const firstSolutionReply = await solutionReplyFlow(
      app,
      'req-solution-final-turn-first-reply',
      sessionId,
      solutionAnswer,
    );

    expect(startResult.statusCode).toBe(200);
    expect(startResult.body.agent_status).toBe('continue');
    expect(problemReply.statusCode).toBe(200);
    expect(problemReply.body.agent_status).toBe('done');
    expect(solutionStart.statusCode).toBe(200);
    expect(solutionStart.body.agent_status).toBe('continue');
    expect(firstSolutionReply.statusCode).toBe(200);
    expect(firstSolutionReply.body.agent_status).toBe('continue');

    const solutionReply = await solutionReplyFlow(
      app,
      'req-solution-final-turn-reply',
      sessionId,
      solutionAnswer,
    );
    const state = await app.services.database.query<{
      chat_status: string;
      active_turn_id: string | null;
      turn_status: string;
      agent_status: string | null;
      answer_text: string | null;
      solution_sections_count: string;
      failed_runs_count: string;
      opened_turns_count: string;
    }>(
      [
        'SELECT',
        '  (SELECT chat_status FROM module_chats WHERE proposal_id = $1 AND module = \'solution\') AS chat_status,',
        '  (SELECT active_turn_id FROM module_chats WHERE proposal_id = $1 AND module = \'solution\') AS active_turn_id,',
        '  (SELECT turn_status FROM chat_turns WHERE proposal_id = $1 AND module = \'solution\' AND turn_seq = 2) AS turn_status,',
        '  (SELECT agent_status FROM chat_turns WHERE proposal_id = $1 AND module = \'solution\' AND turn_seq = 2) AS agent_status,',
        '  (SELECT answer_text FROM chat_turns WHERE proposal_id = $1 AND module = \'solution\' AND turn_seq = 2) AS answer_text,',
        '  (SELECT COUNT(*)::text FROM generated_sections WHERE proposal_id = $1 AND section_kind = \'solution\' AND section_status = \'generated\') AS solution_sections_count,',
        '  (SELECT COUNT(*)::text FROM agent_runs WHERE session_id = $1 AND request_id = \'req-solution-final-turn-reply\' AND status <> \'completed\') AS failed_runs_count,',
        '  (SELECT COUNT(*)::text FROM chat_turns WHERE proposal_id = $1 AND module = \'solution\') AS opened_turns_count',
      ].join(' '),
      [sessionId],
    );

    expect(solutionReply.statusCode).toBe(200);
    expect(solutionReply.body).toMatchObject({
      stage: 'solution_definition',
      agent_status: 'done',
      next_question: '',
    });
    expect(solutionReply.body.warnings).toContain('Maximum solution turn count reached; solution closed with available information');
    expect(state.rows[0]).toMatchObject({
      chat_status: 'completed',
      active_turn_id: null,
      turn_status: 'resolved',
      agent_status: 'done',
      answer_text: solutionAnswer.answer,
      solution_sections_count: '1',
      failed_runs_count: '0',
      opened_turns_count: '2',
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

  it('replays solution reply guardrail warnings from persisted turn state', async () => {
    const structuredBrief = await readFixture('expected', 'structured-brief.strong.json');
    const doneProblemTurn = await readFixture('expected', 'problem-definition.done.json');
    const continueSolutionTurn = await readFixture('expected', 'solution-definition.continue.json');
    const prematureDoneSolutionTurn = {
      ...continueSolutionTurn,
      agent_status: 'done',
      next_question: '',
      completion_reason: 'solution sufficiently defined',
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
      next_question: '¿Qué equipo o responsable responde hoy por este problema en urgencias?',
      completion_reason: '',
    };

    ({ app } = await buildTestApp(
      new QueueLanguageModelClient([
        JSON.stringify(structuredBrief),
        JSON.stringify(startAgentTurn),
        JSON.stringify(doneProblemTurn),
        JSON.stringify(continueSolutionTurn),
        JSON.stringify(prematureDoneSolutionTurn),
      ]),
    ));

    const strongProposal = await readFixture('start', 'strong-proposal.json');
    const strongAnswer = await readFixture('reply', 'strong-answer.json');
    const solutionAnswer = await readFixture('reply', 'solution-workflow-change.json');

    const startResult = await startFlow(app, 'req-start-solution-warning-replay', strongProposal);
    await replyFlow(app, 'req-problem-done-solution-warning-replay', startResult.body.session_id, strongAnswer);
    await solutionStartFlow(app, 'req-solution-start-warning-replay', startResult.body.session_id);

    const first = await solutionReplyFlow(
      app,
      'req-solution-warning-replay',
      startResult.body.session_id,
      solutionAnswer,
    );
    const replay = await app.inject({
      method: 'POST',
      url: '/internal/agents/solution-definition/run',
      headers: {
        'x-internal-shared-secret': 'test-secret',
        'x-request-id': 'req-solution-warning-replay',
      },
      payload: {
        request_id: 'req-solution-warning-replay',
        workflow_version: 'agent_solution_definition_v1',
        session_id: startResult.body.session_id,
        trigger: 'reply',
      },
    });

    expect(first.statusCode).toBe(200);
    expect(first.body.agent_status).toBe('continue');
    expect(first.body.warnings).toContain('Model marked solution lane as done before completion criteria were met');
    expect(replay.statusCode).toBe(200);
    expect(replay.json().agent_status).toBe('continue');
    expect(replay.json().warnings).toEqual(first.body.warnings);

    const rows = await app.services.database.query<{ solution_runs_count: string }>(
      [
        'SELECT COUNT(*)::text AS solution_runs_count',
        'FROM agent_runs',
        'WHERE session_id = $1 AND request_id = $2 AND run_purpose = \'solution_definition\'',
      ].join(' '),
      [startResult.body.session_id, 'req-solution-warning-replay'],
    );

    expect(rows.rows[0]).toEqual({
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

  it('resolves alpha reply request status to the proposal session id when proposal id differs', async () => {
    const structuredBrief = await readFixture('expected', 'structured-brief.strong.json');
    const sessionId = '11111111-1111-4111-8111-111111111111';
    const proposalId = '22222222-2222-4222-8222-222222222222';
    const chatId = '33333333-3333-4333-8333-333333333333';

    ({ app } = await buildTestApp(new QueueLanguageModelClient([])));

    await app.services.database.query(
      [
        'INSERT INTO proposal_sessions (',
        '  id, project_title, goal, normalized_text, status, current_turn_seq, state_version,',
        '  latest_structured_brief_json, latest_problem_definition_json',
        ') VALUES ($1, $2, $3, $4, $5, 1, 1, $6, $7)',
      ].join(' '),
      [
        sessionId,
        structuredBrief.project_title,
        structuredBrief.goal,
        'Texto normalizado de prueba',
        'completed',
        JSON.stringify(structuredBrief),
        JSON.stringify({
          problem_owner: 'Responsable operativo',
          problem_statement: structuredBrief.problem_statement,
          evidence_of_problem: structuredBrief.evidence_of_problem,
          scope: structuredBrief.scope,
          current_alternatives: structuredBrief.current_alternatives,
          assumptions: [],
          ambiguities_remaining: [],
        }),
      ],
    );
    await app.services.database.query(
      [
        'INSERT INTO proposals (',
        '  id, session_id, proposal_status, project_title, goal, structured_brief_json, schema_version',
        ') VALUES ($1, $2, $3, $4, $5, $6, $7)',
      ].join(' '),
      [
        proposalId,
        sessionId,
        'active',
        structuredBrief.project_title,
        structuredBrief.goal,
        JSON.stringify(structuredBrief),
        'alpha-model.v1',
      ],
    );
    await app.services.database.query(
      [
        'INSERT INTO module_chats (id, proposal_id, module, chat_status)',
        'VALUES ($1, $2, $3, $4)',
      ].join(' '),
      [chatId, proposalId, 'solution', 'completed'],
    );
    await app.services.database.query(
      [
        'INSERT INTO chat_turns (',
        '  chat_id, proposal_id, module, turn_seq, question_text, answer_text, answer_request_id, turn_status, agent_status',
        ') VALUES ($1, $2, $3, 1, $4, $5, $6, $7, $8)',
      ].join(' '),
      [
        chatId,
        proposalId,
        'solution',
        '¿Qué haría la solución?',
        'Prepararía un resumen revisable.',
        'req-alpha-distinct-reply',
        'resolved',
        'done',
      ],
    );

    const status = await app.inject({
      method: 'GET',
      url: '/api/v1/requests/req-alpha-distinct-reply',
    });

    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({
      request_id: 'req-alpha-distinct-reply',
      request_kind: 'solution_reply',
      status: 'completed',
      session_id: sessionId,
    });
    expect(status.json().session_id).not.toBe(proposalId);
  });

  it('honors payload request ids on internal start and reply routes', async () => {
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
        JSON.stringify(structuredBrief),
        JSON.stringify(startAgentTurn),
      ]),
    ));

    const strongProposal = await readFixture('start', 'strong-proposal.json');
    const strongAnswer = await readFixture('reply', 'strong-answer.json');
    const payloadStartRequest = {
      ...strongProposal,
      request_id: 'req-payload-only-start',
    };

    const firstStart = await app.inject({
      method: 'POST',
      url: '/internal/sessions/start-context',
      headers: {
        'x-internal-shared-secret': 'test-secret',
      },
      payload: {
        workflow_version: 'proposal_start_v1',
        payload: payloadStartRequest,
      },
    });
    const secondStart = await app.inject({
      method: 'POST',
      url: '/internal/sessions/start-context',
      headers: {
        'x-internal-shared-secret': 'test-secret',
      },
      payload: {
        workflow_version: 'proposal_start_v1',
        payload: payloadStartRequest,
      },
    });
    const sessionId = firstStart.json().session_id;

    await app.inject({
      method: 'POST',
      url: '/internal/agents/problem-definition/run',
      headers: {
        'x-internal-shared-secret': 'test-secret',
      },
      payload: {
        request_id: 'req-payload-only-start',
        workflow_version: 'agent_problem_definition_v1',
        session_id: sessionId,
        trigger: 'start',
      },
    });

    const firstReply = await app.inject({
      method: 'POST',
      url: '/internal/sessions/append-reply',
      headers: {
        'x-internal-shared-secret': 'test-secret',
      },
      payload: {
        workflow_version: 'proposal_reply_v1',
        payload: {
          request_id: 'req-payload-only-reply',
          session_id: sessionId,
          answer: strongAnswer.answer,
        },
      },
    });
    const secondReply = await app.inject({
      method: 'POST',
      url: '/internal/sessions/append-reply',
      headers: {
        'x-internal-shared-secret': 'test-secret',
      },
      payload: {
        workflow_version: 'proposal_reply_v1',
        payload: {
          request_id: 'req-payload-only-reply',
          session_id: sessionId,
          answer: strongAnswer.answer,
        },
      },
    });
    const sessions = await app.services.database.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM proposal_sessions WHERE start_request_id = $1',
      ['req-payload-only-start'],
    );
    const turn = await app.services.database.query<{ answer_request_id: string | null }>(
      'SELECT answer_request_id FROM conversation_turns WHERE session_id = $1 ORDER BY turn_seq DESC LIMIT 1',
      [sessionId],
    );
    const startStatus = await app.inject({
      method: 'GET',
      url: '/api/v1/requests/req-payload-only-start',
    });

    expect(firstStart.statusCode).toBe(200);
    expect(secondStart.statusCode).toBe(200);
    expect(secondStart.json().session_id).toBe(sessionId);
    expect(firstReply.statusCode).toBe(200);
    expect(secondReply.statusCode).toBe(200);
    expect(sessions.rows[0]).toEqual({ count: '1' });
    expect(turn.rows[0]).toEqual({ answer_request_id: 'req-payload-only-reply' });
    expect(startStatus.json()).toMatchObject({
      request_id: 'req-payload-only-start',
      request_kind: 'proposal_start',
      session_id: sessionId,
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

class BlockingPrefetchModel implements AiProviderPort {
  readonly providerName = 'ollama';
  readonly calls: AiGenerationParams[] = [];
  private readonly immediateResponses: string[];
  private prefetchResolve: ((content: string) => void) | null = null;
  private resolvedPrefetchContent: string | null = null;

  constructor(immediateResponses: string[]) {
    this.immediateResponses = [...immediateResponses];
  }

  async generate(params: AiGenerationParams): Promise<AiCompletionResult> {
    this.calls.push(params);

    const immediate = this.immediateResponses.shift();

    if (immediate) {
      return this.result(immediate);
    }

    const content = this.resolvedPrefetchContent ?? await new Promise<string>((resolve) => {
      this.prefetchResolve = resolve;
    });

    return this.result(content);
  }

  resolvePrefetch(content: string): void {
    if (this.prefetchResolve) {
      this.prefetchResolve(content);
      return;
    }

    this.resolvedPrefetchContent = content;
  }

  private result(content: string): AiCompletionResult {
    return {
      content,
      providerName: this.providerName,
      modelName: 'fake-model',
      modelParams: {},
      latencyMs: 1,
      metrics: {},
    };
  }
}

async function waitForModuleChatStatus(
  app: FastifyInstance,
  sessionId: string,
  module: string,
  expectedStatus: string,
): Promise<void> {
  const deadline = Date.now() + 2000;

  while (Date.now() < deadline) {
    const result = await app.services.database.query<{ chat_status: string }>(
      'SELECT chat_status FROM module_chats WHERE proposal_id = $1 AND module = $2',
      [sessionId, module],
    );

    if (result.rows[0]?.chat_status === expectedStatus) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`Timed out waiting for ${module} chat to become ${expectedStatus}`);
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
