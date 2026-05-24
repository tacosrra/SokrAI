import { afterEach, describe, expect, it } from 'vitest';

import type { FastifyInstance } from 'fastify';

import type { StructuredBrief } from '../../apps/api/src/contracts/types';
import { AlphaStore } from '../../apps/api/src/repositories/alpha-store';
import type { Database } from '../../apps/api/src/repositories/database';
import type { SessionStore } from '../../apps/api/src/repositories/session-store';
import { QueueLanguageModelClient } from '../helpers/fake-language-model-client';
import { buildTestApp, readFixture } from '../helpers/test-environment';

describe('alpha persistence integration', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('applies the Alpha migration tables', async () => {
    ({ app } = await buildTestApp(new QueueLanguageModelClient([])));

    const result = await app.services.database.query<{ table_name: string }>(
      [
        'SELECT table_name',
        'FROM information_schema.tables',
        'WHERE table_schema = \'public\'',
        '  AND table_name = ANY($1)',
        'ORDER BY table_name ASC',
      ].join(' '),
      [
        [
          'alpha_gaps',
          'audit_events',
          'basic_reports',
          'chat_turns',
          'generated_sections',
          'module_chats',
          'proposal_documents',
          'proposal_sources',
          'proposals',
        ],
      ],
    );

    expect(result.rows.map((row) => row.table_name)).toEqual([
      'alpha_gaps',
      'audit_events',
      'basic_reports',
      'chat_turns',
      'generated_sections',
      'module_chats',
      'proposal_documents',
      'proposal_sources',
      'proposals',
    ]);
  });

  it('creates, updates, reads, and assembles the Alpha aggregate', async () => {
    ({ app } = await buildTestApp(new QueueLanguageModelClient([])));
    const structuredBrief = await readFixture<StructuredBrief>('expected', 'structured-brief.strong.json');
    const session = await createLegacySession(app.services.database, app.services.sessionStore, structuredBrief);
    const store = app.services.alphaStore;

    await store.createProposal(app.services.database, {
      proposalId: session.id,
      sessionId: session.id,
      userId: 'operator-1',
      proposalStatus: 'active',
      projectTitle: structuredBrief.project_title,
      goal: structuredBrief.goal,
      structuredBrief,
      schemaVersion: 'alpha-model.v1',
      metadata: {
        test_case: 'aggregate',
      },
    });

    const document = await store.createDocument(app.services.database, {
      proposalId: session.id,
      sourceKind: 'pasted_text',
      documentStatus: 'normalized',
      pastedText: 'Initial text',
      normalizedText: 'Initial text',
    });
    const source = await store.createSource(app.services.database, {
      proposalId: session.id,
      sourceKind: 'pasted_text',
      label: 'Initial proposal text',
      documentId: document.document_id,
      span: {
        start_char: 0,
        end_char: 12,
      },
    });
    const gap = await store.createGap(app.services.database, {
      proposalId: session.id,
      module: 'problem',
      gapKind: 'missing_information',
      gapStatus: 'open',
      origin: 'structured_brief_field',
      field: 'evidence_of_problem',
      description: 'Evidence needs a measurable baseline.',
      absence: {
        is_absent: true,
        checked_fields: ['evidence_of_problem'],
        reason: 'Required information was not found in the available structured brief.',
      },
      sourceRefs: [source],
    });
    const chat = await store.createModuleChat(app.services.database, {
      proposalId: session.id,
      module: 'problem',
      chatStatus: 'waiting_for_user',
    });
    const turn = await store.createChatTurn(app.services.database, {
      chatId: chat.chat_id,
      proposalId: session.id,
      module: 'problem',
      turnSeq: 1,
      questionText: 'What evidence shows this problem is frequent?',
      turnStatus: 'awaiting_user',
      gapRefs: [gap.gap_id],
    });

    await expect(
      store.createChatTurn(app.services.database, {
        chatId: chat.chat_id,
        proposalId: session.id,
        module: 'problem',
        turnSeq: 2,
        questionText: 'A second open question should fail.',
        turnStatus: 'awaiting_user',
      }),
    ).rejects.toMatchObject({
      errorCode: 'alpha_open_turn_conflict',
      statusCode: 409,
    });

    await store.updateModuleChatStatus(app.services.database, {
      chatId: chat.chat_id,
      chatStatus: 'waiting_for_user',
      activeTurnId: turn.turn_id,
    });
    const statusOnlyChat = await store.updateModuleChatStatus(app.services.database, {
      chatId: chat.chat_id,
      chatStatus: 'active',
    });
    expect(statusOnlyChat.active_turn_id).toBe(turn.turn_id);
    const clearedChat = await store.updateModuleChatStatus(app.services.database, {
      chatId: chat.chat_id,
      chatStatus: 'waiting_for_user',
      activeTurnId: null,
    });
    expect(clearedChat.active_turn_id).toBeUndefined();
    await store.updateChatTurnAnswer(app.services.database, {
      turnId: turn.turn_id,
      answerText: 'Three service leads reported the delay last month.',
    });
    const resolvedTurn = await store.resolveChatTurn(app.services.database, {
      turnId: turn.turn_id,
      agentStatus: 'continue',
      diagnosis: ['Evidence now has a concrete source.'],
      sourceRefs: [source],
      gapRefs: [gap.gap_id],
    });
    await expect(
      store.createChatTurn(app.services.database, {
        chatId: chat.chat_id,
        proposalId: session.id,
        module: 'problem',
        turnSeq: 1,
        questionText: 'A duplicate turn sequence should fail.',
        turnStatus: 'resolved',
      }),
    ).rejects.toMatchObject({
      errorCode: 'alpha_turn_sequence_conflict',
      statusCode: 409,
    });
    const resolvedGap = await store.updateGapStatus(app.services.database, {
      gapId: gap.gap_id,
      gapStatus: 'resolved',
      resolvedByTurnId: resolvedTurn.turn_id,
    });
    const oldProblemSection = await store.createGeneratedSection(app.services.database, {
      proposalId: session.id,
      sectionKind: 'problem',
      sectionStatus: 'generated',
      title: 'Problem definition',
      contentMarkdown: 'Old problem definition.',
      sourceRefs: [source],
      gapRefs: [gap.gap_id],
    });
    await store.supersedeGeneratedSection(app.services.database, {
      sectionId: oldProblemSection.section_id,
    });
    const problemSection = await store.createGeneratedSection(app.services.database, {
      proposalId: session.id,
      sectionKind: 'problem',
      sectionStatus: 'accepted',
      title: 'Problem definition',
      contentMarkdown: 'Clinical intake review is delayed by fragmented submissions.',
      sourceRefs: [source],
      gapRefs: [gap.gap_id],
      supersedesSectionId: oldProblemSection.section_id,
    });
    const solutionSection = await store.createGeneratedSection(app.services.database, {
      proposalId: session.id,
      sectionKind: 'solution',
      sectionStatus: 'generated',
      title: 'Solution definition',
      contentMarkdown: 'A local assistant normalizes proposal text and guides clarification.',
      sourceRefs: [source],
    });
    const auditEvent = await store.appendAuditEvent(app.services.database, {
      proposalId: session.id,
      sessionId: session.id,
      turnId: resolvedTurn.turn_id,
      eventType: 'gap_resolved',
      actorType: 'system',
      payloadJson: {
        gap_id: resolvedGap.gap_id,
      },
    });
    const report = await store.createBasicReport(app.services.database, {
      proposalId: session.id,
      reportStatus: 'ready',
      schemaVersion: 'alpha-model.v1',
      structuredBrief,
      currentGaps: [resolvedGap],
      problemSectionId: problemSection.section_id,
      solutionSectionId: solutionSection.section_id,
      internalSources: [source],
      auditRefs: [{ kind: 'audit_event', id: auditEvent.id }],
    });
    const aggregate = await store.getAlphaProposalAggregate(session.id);

    expect(await store.findProposalBySessionId(session.id)).toMatchObject({
      proposal_id: session.id,
      proposal_status: 'active',
    });
    expect(await store.getDocument(document.document_id)).toMatchObject({
      document_id: document.document_id,
      source_kind: 'pasted_text',
    });
    expect(await store.getBasicReport(session.id)).toEqual(report);
    expect(aggregate).toMatchObject({
      proposal_id: session.id,
      documents: [{ document_id: document.document_id }],
      sources: [{ source_id: source.source_id }],
      gaps: [{ gap_id: gap.gap_id, gap_status: 'resolved' }],
      module_chats: [{ chat_id: chat.chat_id, turns: [{ turn_id: turn.turn_id, turn_status: 'resolved' }] }],
      generated_sections: expect.arrayContaining([
        expect.objectContaining({ section_id: oldProblemSection.section_id, section_status: 'superseded' }),
        expect.objectContaining({ section_id: problemSection.section_id, section_status: 'accepted' }),
      ]),
      audit_refs: [{ kind: 'audit_event', id: auditEvent.id }],
    });
  });

  it('enforces append-only audit events and core enum constraints', async () => {
    ({ app } = await buildTestApp(new QueueLanguageModelClient([])));
    const structuredBrief = await readFixture<StructuredBrief>('expected', 'structured-brief.strong.json');
    const session = await createLegacySession(app.services.database, app.services.sessionStore, structuredBrief);
    const store = new AlphaStore(app.services.database);

    await store.createProposal(app.services.database, {
      proposalId: session.id,
      sessionId: session.id,
      proposalStatus: 'active',
      projectTitle: structuredBrief.project_title,
      goal: structuredBrief.goal,
      structuredBrief,
      schemaVersion: 'alpha-model.v1',
    });
    const event = await store.appendAuditEvent(app.services.database, {
      proposalId: session.id,
      sessionId: session.id,
      eventType: 'proposal_created',
      actorType: 'workflow',
    });

    await expect(app.services.database.query('UPDATE audit_events SET event_type = $2 WHERE id = $1', [event.id, 'changed']))
      .rejects.toThrow();
    await expect(app.services.database.query('DELETE FROM audit_events WHERE id = $1', [event.id])).rejects.toThrow();
    await expect(
      app.services.database.query(
        'INSERT INTO proposals (id, proposal_status, project_title, goal, structured_brief_json, schema_version) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)',
        ['reviewing', 'Invalid status', 'Goal', JSON.stringify(structuredBrief), 'alpha-model.v1'],
      ),
    ).rejects.toThrow();
    await expect(
      app.services.database.query('INSERT INTO module_chats (proposal_id, module, chat_status) VALUES ($1, $2, $3)', [
        session.id,
        'regulatory',
        'active',
      ]),
    ).rejects.toThrow();
    await expect(
      app.services.database.query(
        'INSERT INTO proposal_documents (proposal_id, source_kind, document_status) VALUES ($1, $2, $3)',
        [session.id, 'generated_section', 'normalized'],
      ),
    ).rejects.toThrow();
    await expect(
      app.services.database.query(
        [
          'INSERT INTO alpha_gaps',
          '(proposal_id, module, gap_kind, gap_status, origin, field, description, absence_json)',
          'VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        ].join(' '),
        [
          session.id,
          'problem',
          'missing_information',
          'open',
          'clinic_module',
          'evidence_of_problem',
          'Invalid origin should fail.',
          JSON.stringify({ is_absent: true, checked_fields: ['evidence_of_problem'], reason: 'Missing.' }),
        ],
      ),
    ).rejects.toThrow();
    await expect(
      app.services.database.query(
        [
          'INSERT INTO alpha_gaps',
          '(proposal_id, module, gap_kind, gap_status, origin, field, description, absence_json)',
          'VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        ].join(' '),
        [
          session.id,
          'problem',
          'missing_information',
          'open',
          'structured_brief_field',
          'evidence_of_problem',
          'Missing information must carry absence evidence.',
          JSON.stringify({ is_absent: false, checked_fields: [], reason: '' }),
        ],
      ),
    ).rejects.toThrow();
  });

  it('rejects Alpha child references that cross proposal boundaries', async () => {
    ({ app } = await buildTestApp(new QueueLanguageModelClient([])));
    const structuredBrief = await readFixture<StructuredBrief>('expected', 'structured-brief.strong.json');
    const firstSession = await createLegacySession(app.services.database, app.services.sessionStore, structuredBrief);
    const secondSession = await createLegacySession(app.services.database, app.services.sessionStore, structuredBrief);
    const store = app.services.alphaStore;

    await Promise.all([
      store.createProposal(app.services.database, {
        proposalId: firstSession.id,
        sessionId: firstSession.id,
        proposalStatus: 'active',
        projectTitle: structuredBrief.project_title,
        goal: structuredBrief.goal,
        structuredBrief,
        schemaVersion: 'alpha-model.v1',
      }),
      store.createProposal(app.services.database, {
        proposalId: secondSession.id,
        sessionId: secondSession.id,
        proposalStatus: 'active',
        projectTitle: structuredBrief.project_title,
        goal: structuredBrief.goal,
        structuredBrief,
        schemaVersion: 'alpha-model.v1',
      }),
    ]);
    const document = await store.createDocument(app.services.database, {
      proposalId: firstSession.id,
      sourceKind: 'pasted_text',
      documentStatus: 'normalized',
      pastedText: 'Initial text',
      normalizedText: 'Initial text',
    });
    const chat = await store.createModuleChat(app.services.database, {
      proposalId: firstSession.id,
      module: 'problem',
      chatStatus: 'active',
    });
    const secondChat = await store.createModuleChat(app.services.database, {
      proposalId: secondSession.id,
      module: 'problem',
      chatStatus: 'active',
    });

    await expect(
      app.services.database.query(
        [
          'INSERT INTO chat_turns (chat_id, proposal_id, module, turn_seq, question_text, turn_status)',
          'VALUES ($1, $2, $3, $4, $5, $6)',
        ].join(' '),
        [chat.chat_id, secondSession.id, 'problem', 1, 'This turn belongs to the wrong proposal.', 'awaiting_user'],
      ),
    ).rejects.toThrow();

    const turn = await store.createChatTurn(app.services.database, {
      chatId: chat.chat_id,
      proposalId: firstSession.id,
      module: 'problem',
      turnSeq: 1,
      questionText: 'What evidence shows this problem is frequent?',
      turnStatus: 'awaiting_user',
    });

    await expect(
      app.services.database.query('UPDATE module_chats SET active_turn_id = $2 WHERE id = $1', [
        secondChat.chat_id,
        turn.turn_id,
      ]),
    ).rejects.toThrow();

    const section = await store.createGeneratedSection(app.services.database, {
      proposalId: firstSession.id,
      sectionKind: 'problem',
      sectionStatus: 'generated',
      title: 'Problem definition',
      contentMarkdown: 'Problem text.',
    });

    for (const [columnName, value] of [
      ['document_id', document.document_id],
      ['turn_id', turn.turn_id],
      ['section_id', section.section_id],
    ] as const) {
      const sourceKindByColumn = {
        document_id: 'pasted_text',
        turn_id: 'user_answer',
        section_id: 'generated_section',
      } as const;

      await expect(
        app.services.database.query(
          [
            `INSERT INTO proposal_sources (proposal_id, source_kind, label, ${columnName})`,
            'VALUES ($1, $2, $3, $4)',
          ].join(' '),
          [secondSession.id, sourceKindByColumn[columnName], 'Cross-proposal source', value],
        ),
      ).rejects.toThrow();
    }
  });

  it('rejects proposal source rows whose kind does not match the reference column', async () => {
    ({ app } = await buildTestApp(new QueueLanguageModelClient([])));
    const structuredBrief = await readFixture<StructuredBrief>('expected', 'structured-brief.strong.json');
    const session = await createLegacySession(app.services.database, app.services.sessionStore, structuredBrief);
    const store = app.services.alphaStore;

    await store.createProposal(app.services.database, {
      proposalId: session.id,
      sessionId: session.id,
      proposalStatus: 'active',
      projectTitle: structuredBrief.project_title,
      goal: structuredBrief.goal,
      structuredBrief,
      schemaVersion: 'alpha-model.v1',
    });
    const document = await store.createDocument(app.services.database, {
      proposalId: session.id,
      sourceKind: 'pasted_text',
      documentStatus: 'normalized',
      pastedText: 'Initial text',
      normalizedText: 'Initial text',
    });
    const chat = await store.createModuleChat(app.services.database, {
      proposalId: session.id,
      module: 'problem',
      chatStatus: 'active',
    });
    const turn = await store.createChatTurn(app.services.database, {
      chatId: chat.chat_id,
      proposalId: session.id,
      module: 'problem',
      turnSeq: 1,
      questionText: 'What evidence shows this problem is frequent?',
      turnStatus: 'awaiting_user',
    });
    const section = await store.createGeneratedSection(app.services.database, {
      proposalId: session.id,
      sectionKind: 'problem',
      sectionStatus: 'generated',
      title: 'Problem definition',
      contentMarkdown: 'Problem text.',
    });

    await expect(
      app.services.database.query(
        'INSERT INTO proposal_sources (proposal_id, source_kind, label, section_id) VALUES ($1, $2, $3, $4)',
        [session.id, 'pasted_text', 'Wrong source relation', section.section_id],
      ),
    ).rejects.toThrow();
    await expect(
      app.services.database.query(
        'INSERT INTO proposal_sources (proposal_id, source_kind, label, document_id) VALUES ($1, $2, $3, $4)',
        [session.id, 'user_answer', 'Wrong source relation', document.document_id],
      ),
    ).rejects.toThrow();
    await expect(
      app.services.database.query(
        'INSERT INTO proposal_sources (proposal_id, source_kind, label, turn_id) VALUES ($1, $2, $3, $4)',
        [session.id, 'generated_section', 'Wrong source relation', turn.turn_id],
      ),
    ).rejects.toThrow();
  });

  it('assigns unique sequential audit event numbers for concurrent appends', async () => {
    ({ app } = await buildTestApp(new QueueLanguageModelClient([])));
    const structuredBrief = await readFixture<StructuredBrief>('expected', 'structured-brief.strong.json');
    const session = await createLegacySession(app.services.database, app.services.sessionStore, structuredBrief);
    const store = app.services.alphaStore;

    await store.createProposal(app.services.database, {
      proposalId: session.id,
      sessionId: session.id,
      proposalStatus: 'active',
      projectTitle: structuredBrief.project_title,
      goal: structuredBrief.goal,
      structuredBrief,
      schemaVersion: 'alpha-model.v1',
    });

    await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        store.appendAuditEvent(app.services.database, {
          proposalId: session.id,
          sessionId: session.id,
          eventType: `concurrent_${index}`,
          actorType: 'system',
        }),
      ),
    );

    const events = await store.listAuditEvents(session.id);
    expect(events.map((event) => event.event_seq)).toEqual([1, 2, 3, 4, 5]);
  });

  it('creates initial Alpha rows during the existing start transaction', async () => {
    const structuredBrief = await readFixture<StructuredBrief>('expected', 'structured-brief.strong.json');

    ({ app } = await buildTestApp(new QueueLanguageModelClient([JSON.stringify(structuredBrief)])));

    const proposal = await readFixture('start', 'strong-proposal.json');
    const response = await app.inject({
      method: 'POST',
      url: '/internal/sessions/start-context',
      headers: {
        'x-internal-shared-secret': 'test-secret',
        'x-request-id': 'req-alpha-start',
      },
      payload: {
        request_id: 'req-alpha-start',
        workflow_version: 'proposal_start_v1',
        payload: proposal,
      },
    });
    const body = response.json() as { session_id: string };

    expect(response.statusCode).toBe(200);

    const [proposals, documents, sources, chats, events] = await Promise.all([
      app.services.database.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM proposals WHERE id = $1', [
        body.session_id,
      ]),
      app.services.database.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM proposal_documents WHERE proposal_id = $1',
        [body.session_id],
      ),
      app.services.database.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM proposal_sources WHERE proposal_id = $1',
        [body.session_id],
      ),
      app.services.database.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM module_chats WHERE proposal_id = $1 AND module = \'problem\'',
        [body.session_id],
      ),
      app.services.database.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM audit_events WHERE proposal_id = $1 AND event_type = \'proposal_created\'',
        [body.session_id],
      ),
    ]);

    expect(proposals.rows[0]?.count).toBe('1');
    expect(Number(documents.rows[0]?.count)).toBeGreaterThanOrEqual(1);
    expect(Number(sources.rows[0]?.count)).toBeGreaterThanOrEqual(1);
    expect(chats.rows[0]?.count).toBe('1');
    expect(events.rows[0]?.count).toBe('1');
  });

  it('returns the same session without duplicating Alpha rows for an idempotent start retry', async () => {
    const structuredBrief = await readFixture<StructuredBrief>('expected', 'structured-brief.strong.json');

    ({ app } = await buildTestApp(new QueueLanguageModelClient([JSON.stringify(structuredBrief)])));

    const proposal = await readFixture('start', 'strong-proposal.json');
    const payload = {
      request_id: 'req-alpha-start-retry',
      workflow_version: 'proposal_start_v1',
      payload: proposal,
    };

    const firstResponse = await app.inject({
      method: 'POST',
      url: '/internal/sessions/start-context',
      headers: {
        'x-internal-shared-secret': 'test-secret',
        'x-request-id': 'req-alpha-start-retry',
      },
      payload,
    });
    const secondResponse = await app.inject({
      method: 'POST',
      url: '/internal/sessions/start-context',
      headers: {
        'x-internal-shared-secret': 'test-secret',
        'x-request-id': 'req-alpha-start-retry',
      },
      payload,
    });

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(200);

    const firstBody = firstResponse.json() as { session_id: string };
    const secondBody = secondResponse.json() as { session_id: string };
    expect(secondBody.session_id).toBe(firstBody.session_id);

    const [proposals, chats, events] = await Promise.all([
      app.services.database.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM proposals WHERE id = $1', [
        firstBody.session_id,
      ]),
      app.services.database.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM module_chats WHERE proposal_id = $1 AND module = \'problem\'',
        [firstBody.session_id],
      ),
      app.services.database.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM audit_events WHERE proposal_id = $1 AND event_type = \'proposal_created\'',
        [firstBody.session_id],
      ),
    ]);

    expect(proposals.rows[0]?.count).toBe('1');
    expect(chats.rows[0]?.count).toBe('1');
    expect(events.rows[0]?.count).toBe('1');
  });

  it('rolls back the legacy start session when initial Alpha persistence fails', async () => {
    const structuredBrief = await readFixture<StructuredBrief>('expected', 'structured-brief.strong.json');
    ({ app } = await buildTestApp(new QueueLanguageModelClient([JSON.stringify(structuredBrief)])));

    await installFailingProposalTrigger(app.services.database);

    try {
      const proposal = await readFixture('start', 'strong-proposal.json');
      const response = await app.inject({
        method: 'POST',
        url: '/internal/sessions/start-context',
        headers: {
          'x-internal-shared-secret': 'test-secret',
          'x-request-id': 'req-alpha-start-rollback',
        },
        payload: {
          request_id: 'req-alpha-start-rollback',
          workflow_version: 'proposal_start_v1',
          payload: proposal,
        },
      });

      expect(response.statusCode).toBe(500);

      const [sessions, proposals, events] = await Promise.all([
        app.services.database.query<{ count: string }>(
          'SELECT COUNT(*)::text AS count FROM proposal_sessions WHERE start_request_id = $1',
          ['req-alpha-start-rollback'],
        ),
        app.services.database.query<{ count: string }>(
          'SELECT COUNT(*)::text AS count FROM proposals WHERE session_id IN (SELECT id FROM proposal_sessions WHERE start_request_id = $1)',
          ['req-alpha-start-rollback'],
        ),
        app.services.database.query<{ count: string }>(
          'SELECT COUNT(*)::text AS count FROM session_events WHERE request_id = $1',
          ['req-alpha-start-rollback'],
        ),
      ]);

      expect(sessions.rows[0]?.count).toBe('0');
      expect(proposals.rows[0]?.count).toBe('0');
      expect(events.rows[0]?.count).toBe('0');
    } finally {
      await removeFailingProposalTrigger(app.services.database);
    }
  });

  it('persists extracted document text as Alpha document and source metadata', async () => {
    const structuredBrief = await readFixture<StructuredBrief>('expected', 'structured-brief.strong.json');
    ({ app } = await buildTestApp(new QueueLanguageModelClient([JSON.stringify(structuredBrief)])));

    const response = await app.inject({
      method: 'POST',
      url: '/internal/sessions/start-context',
      headers: {
        'x-internal-shared-secret': 'test-secret',
        'x-request-id': 'req-alpha-document-text',
      },
      payload: {
        request_id: 'req-alpha-document-text',
        workflow_version: 'proposal_start_v1',
        payload: {
          project_title: 'Document-only intake',
          goal: 'Verify extracted text persistence',
          document_text: 'Text extracted from the proposal document.',
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const { session_id: sessionId } = response.json() as { session_id: string };

    const documents = await app.services.database.query<{
      source_kind: string;
      normalized_text: string;
      pasted_text: string | null;
    }>('SELECT source_kind, normalized_text, pasted_text FROM proposal_documents WHERE proposal_id = $1', [sessionId]);
    const sources = await app.services.database.query<{
      source_kind: string;
      label: string;
      span_json: { start_char: number; end_char: number };
    }>(
      [
        'SELECT source_kind, label, span_json',
        'FROM proposal_sources',
        'WHERE proposal_id = $1',
        'ORDER BY created_at ASC, id ASC',
      ].join(' '),
      [sessionId],
    );

    expect(documents.rows).toEqual([
      {
        source_kind: 'pasted_text',
        normalized_text: 'Text extracted from the proposal document.',
        pasted_text: 'Text extracted from the proposal document.',
      },
    ]);
    expect(sources.rows[0]).toMatchObject({
      source_kind: 'pasted_text',
      label: 'Pasted supporting text',
      span_json: {
        start_char: 0,
        end_char: 'Pasted supporting text:\nText extracted from the proposal document.'.length,
      },
    });
  });
});

async function createLegacySession(database: Database, sessionStore: SessionStore, structuredBrief: StructuredBrief) {
  return database.withTransaction((client) =>
    sessionStore.createSession(client, {
      startRequestId: `req-alpha-${crypto.randomUUID()}`,
      userId: 'operator-1',
      projectTitle: structuredBrief.project_title,
      goal: structuredBrief.goal,
      rawInputText: 'Initial proposal text',
      normalizedText: 'Initial proposal text',
      metadata: {},
      structuredBrief,
      initialProblemDefinition: {},
    }),
  );
}

async function installFailingProposalTrigger(database: Database): Promise<void> {
  await removeFailingProposalTrigger(database);
  await database.query(
    [
      'CREATE OR REPLACE FUNCTION test_raise_alpha_proposal_insert_failure()',
      'RETURNS trigger AS $$',
      'BEGIN',
      '  RAISE EXCEPTION \'forced Alpha proposal failure\'',
      '    USING ERRCODE = \'23514\', CONSTRAINT = \'test_alpha_proposal_insert_failure\';',
      'END;',
      '$$ LANGUAGE plpgsql',
    ].join('\n'),
  );
  await database.query(
    [
      'CREATE TRIGGER test_raise_alpha_proposal_insert_failure',
      'BEFORE INSERT ON proposals',
      'FOR EACH ROW',
      'EXECUTE FUNCTION test_raise_alpha_proposal_insert_failure()',
    ].join('\n'),
  );
}

async function removeFailingProposalTrigger(database: Database): Promise<void> {
  await database.query('DROP TRIGGER IF EXISTS test_raise_alpha_proposal_insert_failure ON proposals');
  await database.query('DROP FUNCTION IF EXISTS test_raise_alpha_proposal_insert_failure()');
}
