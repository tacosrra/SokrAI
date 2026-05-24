import { readFile } from 'node:fs/promises';

import { afterEach, describe, expect, it } from 'vitest';

import type { FastifyInstance } from 'fastify';

import { sha256Buffer } from '../../apps/api/src/utils/hash';
import { fromRepoRoot } from '../../apps/api/src/utils/paths';
import { QueueLanguageModelClient } from '../helpers/fake-language-model-client';
import { buildTestApp, readFixture } from '../helpers/test-environment';

describe('proposal document and source persistence', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('persists pasted proposal and supporting text as audit-visible documents and sources', async () => {
    const structuredBrief = await readFixture('expected', 'structured-brief.strong.json');

    ({ app } = await buildTestApp(
      new QueueLanguageModelClient([JSON.stringify(structuredBrief)]),
    ));

    const response = await startContext(app, 'req-docs-pasted', {
      project_title: 'Triage IA en Urgencias',
      goal: 'Definir mejor el problema',
      proposal_text: 'El triaje se retrasa en horas punta.',
      document_text: 'Registro interno: esperas de 20 a 35 minutos.',
    });

    expect(response.statusCode).toBe(200);
    const { session_id: sessionId } = response.json() as { session_id: string };
    expect(response.json().warnings).toContain('Do not submit real patient data in MVP Alpha.');

    const documents = await app.services.database.query<{
      source_kind: string;
      document_status: string;
      normalized_text: string | null;
    }>(
      [
        'SELECT source_kind, document_status, normalized_text',
        'FROM proposal_documents',
        'WHERE proposal_id = (SELECT id FROM proposals WHERE session_id = $1 LIMIT 1)',
        'ORDER BY created_at ASC',
      ].join(' '),
      [sessionId],
    );
    const sources = await app.services.database.query<{
      source_kind: string;
      label: string;
      span_json: { start_char: number; end_char: number } | null;
    }>(
      [
        'SELECT source_kind, label, span_json',
        'FROM proposal_sources',
        'WHERE proposal_id = (SELECT id FROM proposals WHERE session_id = $1 LIMIT 1)',
        'ORDER BY',
        '  CASE label',
        '    WHEN \'Proposal text\' THEN 1',
        '    WHEN \'Pasted supporting text\' THEN 2',
        '    ELSE 3',
        '  END ASC,',
        '  created_at ASC, id ASC',
      ].join(' '),
      [sessionId],
    );

    expect(documents.rows).toHaveLength(2);
    expect(documents.rows.every((document) => document.document_status === 'normalized')).toBe(true);
    expect(sources.rows.map((source) => source.label)).toEqual([
      'Proposal text',
      'Pasted supporting text',
    ]);
    expect(sources.rows.every((source) => source.span_json !== null)).toBe(true);

    const audit = await app.inject({
      method: 'GET',
      url: `/api/v1/sessions/${sessionId}`,
    });

    expect(audit.statusCode).toBe(200);
    expect(audit.json().documents).toHaveLength(2);
    expect(audit.json().sources).toHaveLength(2);
    expect(audit.json().sources[0].label).toBe('Proposal text');
  });

  it('persists a valid uploaded PDF as file and extracted-text audit sources', async () => {
    const structuredBrief = await readFixture('expected', 'structured-brief.strong.json');
    const pdfBytes = await readFile(fromRepoRoot('tests', 'fixtures', 'documents', 'text-pdf.pdf'));
    const expectedHash = sha256Buffer(pdfBytes);

    ({ app } = await buildTestApp(
      new QueueLanguageModelClient([JSON.stringify(structuredBrief)]),
    ));

    const response = await startContext(app, 'req-docs-valid-pdf', {
      project_title: 'Triage IA en Urgencias',
      goal: 'Definir mejor el problema',
      file: {
        file_name: 'intake.pdf',
        mime_type: 'application/pdf',
        content_base64: pdfBytes.toString('base64'),
      },
    });

    expect(response.statusCode).toBe(200);
    const { session_id: sessionId } = response.json() as { session_id: string };

    const audit = await app.inject({ method: 'GET', url: `/api/v1/sessions/${sessionId}` });
    const auditBody = audit.json() as {
      documents: Array<{
        source_kind: string;
        document_status: string;
        file_name?: string;
        sha256?: string;
      }>;
      sources: Array<{ label: string; source_kind: string }>;
      events: Array<{ event_type: string }>;
    };

    expect(audit.statusCode).toBe(200);
    expect(auditBody.documents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source_kind: 'uploaded_file',
          document_status: 'received',
          file_name: 'intake.pdf',
          sha256: expectedHash,
        }),
        expect.objectContaining({
          source_kind: 'extracted_text',
          document_status: 'normalized',
          file_name: 'intake.pdf',
          sha256: expectedHash,
        }),
      ]),
    );
    expect(auditBody.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Extracted PDF text: intake.pdf',
          source_kind: 'extracted_text',
        }),
      ]),
    );
    expect(auditBody.events.map((event) => event.event_type)).toContain('document_extracted');
  });

  it('does not duplicate documents or sources on idempotent start retry', async () => {
    const structuredBrief = await readFixture('expected', 'structured-brief.strong.json');

    ({ app } = await buildTestApp(
      new QueueLanguageModelClient([JSON.stringify(structuredBrief)]),
    ));

    const payload = {
      project_title: 'Triage IA en Urgencias',
      goal: 'Definir mejor el problema',
      proposal_text: 'El triaje se retrasa en horas punta.',
      document_text: 'Registro interno: esperas de 20 a 35 minutos.',
    };

    const first = await startContext(app, 'req-docs-idempotent', payload);
    const second = await startContext(app, 'req-docs-idempotent', payload);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json().session_id).toBe(first.json().session_id);

    const counts = await app.services.database.query<{
      documents: string;
      sources: string;
    }>(
      [
        'SELECT',
        '  (SELECT COUNT(*)::text FROM proposal_documents) AS documents,',
        '  (SELECT COUNT(*)::text FROM proposal_sources) AS sources',
      ].join(' '),
    );

    expect(counts.rows[0]).toEqual({ documents: '2', sources: '2' });
  });

  it('rejects unsupported uploaded file names before creating a session', async () => {
    ({ app } = await buildTestApp(new QueueLanguageModelClient([])));

    const response = await startContext(app, 'req-docs-invalid-file', {
      project_title: 'Triage IA en Urgencias',
      goal: 'Definir mejor el problema',
      file: {
        file_name: 'support.txt',
        mime_type: 'application/pdf',
        content_base64: Buffer.from('not a pdf').toString('base64'),
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error_code).toBe('invalid_pdf_file');

    const sessions = await app.services.database.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM proposal_sessions',
    );

    expect(sessions.rows[0]?.count).toBe('0');
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
