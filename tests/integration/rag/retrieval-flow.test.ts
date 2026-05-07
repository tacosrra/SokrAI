import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildRagModule, type RagModule } from '../../../apps/api/src/rag';
import { Database } from '../../../apps/api/src/repositories/database.ts';
import { JsonLogger } from '../../../apps/api/src/utils/logger.ts';
import { FakeEmbeddingClient } from '../../helpers/fake-embedding-client.ts';
import {
  applyMigrations,
  createTestConfig,
  truncateRag,
} from '../../helpers/test-environment.ts';

describe('rag retrieval flow', () => {
  let database: Database;
  let rag: RagModule;
  let embedder: FakeEmbeddingClient;

  beforeAll(async () => {
    const config = createTestConfig();
    database = new Database(config);
    await applyMigrations(database);

    embedder = new FakeEmbeddingClient({ dimension: config.embeddingDimension });
    rag = buildRagModule({
      config,
      database,
      logger: new JsonLogger('error'),
      embeddingClient: embedder,
    });
  });

  beforeEach(async () => {
    await truncateRag(database);
    await rag.ingestion.ingestPack('sample_pack');
  });

  afterAll(async () => {
    await database.close();
  });

  it('returns top-K chunks ordered by similarity', async () => {
    const result = await rag.retrieval.retrieve({
      query: 'sesión turnos resueltos',
      packs: ['sample_pack'],
      topK: 3,
      requester: 'cli_search',
    });

    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.chunks.length).toBeLessThanOrEqual(3);

    for (let i = 1; i < result.chunks.length; i += 1) {
      expect(result.chunks[i - 1].score).toBeGreaterThanOrEqual(result.chunks[i].score);
    }
  });

  it('persists an audit row in rag_retrievals', async () => {
    const result = await rag.retrieval.retrieve({
      query: 'glosario brief',
      packs: ['sample_pack'],
      topK: 2,
      requester: 'api_search',
      requesterRef: 'integration-test',
    });

    const audit = await database.query<{
      id: string;
      requester: string;
      requester_ref: string | null;
      top_k: number;
      requested_packs: string[];
    }>('SELECT id, requester, requester_ref, top_k, requested_packs FROM rag_retrievals WHERE id = $1', [
      result.retrievalId,
    ]);

    expect(audit.rows[0]).toMatchObject({
      requester: 'api_search',
      requester_ref: 'integration-test',
      top_k: 2,
    });
    expect(Array.isArray(audit.rows[0].requested_packs)).toBe(true);
  });

  it('rejects requests with missing packs', async () => {
    await expect(
      rag.retrieval.retrieve({
        query: 'algo',
        packs: ['does_not_exist'],
        requester: 'cli_search',
      }),
    ).rejects.toMatchObject({ errorCode: 'rag_pack_not_found' });
  });

  it('rejects empty queries', async () => {
    await expect(
      rag.retrieval.retrieve({
        query: '   ',
        packs: ['sample_pack'],
        requester: 'cli_search',
      }),
    ).rejects.toMatchObject({ errorCode: 'rag_empty_query' });
  });
});
