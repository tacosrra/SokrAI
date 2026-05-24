import { afterEach, describe, expect, it } from 'vitest';

import type { FastifyInstance } from 'fastify';

import type { AlphaGap, StructuredBrief } from '../../apps/api/src/contracts/types';
import { QueueLanguageModelClient } from '../helpers/fake-language-model-client';
import { buildTestApp } from '../helpers/test-environment';

const structuredBriefWithGaps: StructuredBrief = {
  project_title: 'Triage IA en Urgencias',
  goal: 'Definir mejor el problema',
  target_user: 'Equipo de admision',
  problem_owner: 'Enfermeria de admision',
  problem_statement: 'El triaje inicial se retrasa en horas punta',
  evidence_of_problem: '',
  current_alternatives: '',
  scope: 'Urgencias de adultos',
  constraints_known: [],
  assumptions: [],
  ambiguities: ['No esta claro quien valida el problem_owner operativo'],
  missing_information: ['evidence_of_problem', 'current alternatives', 'medical device classification'],
};

describe('initial Alpha gap analysis', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('persists deterministic initial gaps with origin, absence, question hints, and audit visibility', async () => {
    ({ app } = await buildTestApp(
      new QueueLanguageModelClient([JSON.stringify(structuredBriefWithGaps)]),
    ));

    const response = await startContext(app, 'req-initial-gaps', {
      project_title: 'Triage IA en Urgencias',
      goal: 'Definir mejor el problema',
      proposal_text: 'El triaje inicial se retrasa en horas punta para admision.',
      document_text: 'Registro interno: esperas de 20 a 35 minutos los lunes.',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { session_id: string; detected_gaps: string[] };
    expect(body.detected_gaps.length).toBeGreaterThan(0);

    const gaps = await app.services.alphaStore.listGaps(body.session_id);
    const evidenceGap = gaps.find((gap) => gap.field === 'evidence_of_problem');
    const sourceBackedGap = gaps.find((gap) => gap.origin === 'proposal_source');

    expect(evidenceGap).toMatchObject({
      module: 'problem',
      gap_kind: 'missing_information',
      gap_status: 'open',
      origin: 'structured_brief_field',
      absence: {
        is_absent: true,
        checked_fields: ['evidence_of_problem'],
      },
      source_refs: [],
    });
    expect(evidenceGap?.question_hint).toMatch(/\?$/);
    expect(evidenceGap?.question_hint?.match(/\?/g)).toHaveLength(1);
    expect(gaps).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ description: expect.stringMatching(/medical device/i) }),
      ]),
    );
    expect(sourceBackedGap).toMatchObject({
      module: 'solution',
      gap_kind: 'needs_user_confirmation',
      field: 'target_user',
      source_refs: [expect.objectContaining({ label: 'Proposal text' })],
      absence: {
        is_absent: false,
      },
    });

    const audit = await app.inject({ method: 'GET', url: `/api/v1/sessions/${body.session_id}` });
    const auditBody = audit.json() as {
      gaps: AlphaGap[];
      events: Array<{ event_type: string; payload_json: Record<string, unknown> }>;
    };
    const gapEvents = auditBody.events.filter((event) => event.event_type === 'gap_detected');

    expect(audit.statusCode).toBe(200);
    expect(auditBody.gaps).toEqual(expect.arrayContaining([expect.objectContaining({ gap_id: evidenceGap?.gap_id })]));
    expect(gapEvents).toHaveLength(gaps.length);
    expect(gapEvents).toEqual(
      expect.arrayContaining(
        gaps.map((gap) =>
          expect.objectContaining({
            payload_json: expect.objectContaining({
              gap_id: gap.gap_id,
              origin: gap.origin,
              field: gap.field,
              gap_kind: gap.gap_kind,
            }),
          }),
        ),
      ),
    );
  });

  it('rehydrates existing gaps on idempotent start retry without duplicating rows', async () => {
    ({ app } = await buildTestApp(
      new QueueLanguageModelClient([JSON.stringify(structuredBriefWithGaps)]),
    ));

    const payload = {
      project_title: 'Triage IA en Urgencias',
      goal: 'Definir mejor el problema',
      proposal_text: 'El triaje inicial se retrasa en horas punta para admision.',
    };

    const first = await startContext(app, 'req-initial-gaps-retry', payload);
    expect(first.statusCode).toBe(200);
    const firstBody = first.json() as { session_id: string; detected_gaps: string[] };
    const sessionId = firstBody.session_id;
    const firstGaps = await app.services.alphaStore.listGaps(sessionId);

    const second = await startContext(app, 'req-initial-gaps-retry', payload);
    expect(second.statusCode).toBe(200);
    const secondBody = second.json() as { session_id: string; detected_gaps: string[] };
    expect(secondBody.session_id).toBe(sessionId);
    const persistedGapSummaries = firstGaps.map((gap) => `${gap.field}: ${gap.description}`);
    expect(secondBody.detected_gaps).toHaveLength(persistedGapSummaries.length);
    expect(secondBody.detected_gaps).toEqual(expect.arrayContaining(persistedGapSummaries));

    const secondGaps = await app.services.alphaStore.listGaps(sessionId);
    expect(secondBody.detected_gaps).toHaveLength(firstBody.detected_gaps.length);
    expect(secondBody.detected_gaps).toEqual(expect.arrayContaining(firstBody.detected_gaps));
    expect(secondGaps.map((gap) => gap.gap_id)).toEqual(firstGaps.map((gap) => gap.gap_id));

    const count = await app.services.database.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM alpha_gaps WHERE proposal_id = $1',
      [sessionId],
    );

    expect(count.rows[0]?.count).toBe(String(firstGaps.length));
  });
});

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
