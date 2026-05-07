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

describe('rag ingestion flow', () => {
  let database: Database;
  let rag: RagModule;

  beforeAll(async () => {
    const config = createTestConfig();
    database = new Database(config);
    await applyMigrations(database);

    rag = buildRagModule({
      config,
      database,
      logger: new JsonLogger('error'),
      embeddingClient: new FakeEmbeddingClient({ dimension: config.embeddingDimension }),
    });
  });

  beforeEach(async () => {
    await truncateRag(database);
  });

  afterAll(async () => {
    await database.close();
  });

  it('ingests a pack: creates pack, documents and chunks', async () => {
    const report = await rag.ingestion.ingestPack('sample_pack');

    expect(report.packName).toBe('sample_pack');
    expect(report.files.length).toBeGreaterThan(0);
    expect(report.totalChunksInserted).toBeGreaterThan(0);

    const summaries = await rag.packStore.listSummaries();
    const summary = summaries.find((entry) => entry.name === 'sample_pack');

    expect(summary).toBeDefined();
    expect(summary?.active_documents).toBeGreaterThan(0);
    expect(summary?.active_chunks).toBeGreaterThan(0);
    expect(summary?.archived_documents).toBe(0);
  });

  it('skips unchanged sources on re-ingestion', async () => {
    await rag.ingestion.ingestPack('sample_pack');
    const second = await rag.ingestion.ingestPack('sample_pack');

    expect(second.totalChunksInserted).toBe(0);
    for (const file of second.files) {
      expect(file.status).toBe('skipped');
    }
  });

  it('archives previous documents when sha changes', async () => {
    const initial = await rag.ingestion.ingestPack('sample_pack');
    expect(initial.totalChunksInserted).toBeGreaterThan(0);

    await database.query(
      `UPDATE rag_documents SET source_sha256 = source_sha256 || '-stale'`,
    );

    const second = await rag.ingestion.ingestPack('sample_pack');
    const updated = second.files.filter((file) => file.status === 'updated');
    expect(updated.length).toBeGreaterThan(0);

    const summaries = await rag.packStore.listSummaries();
    const summary = summaries.find((entry) => entry.name === 'sample_pack');
    expect(summary?.archived_documents).toBeGreaterThan(0);
  });
});
