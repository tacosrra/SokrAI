import fs from 'node:fs/promises';

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../../apps/api/src/app.ts';
import type { AppConfig } from '../../apps/api/src/config/env.ts';
import type { EmbeddingClient } from '../../apps/api/src/rag/embedding-client.ts';
import { Database } from '../../apps/api/src/repositories/database.ts';
import { JsonLogger } from '../../apps/api/src/utils/logger.ts';
import { fromRepoRoot } from '../../apps/api/src/utils/paths.ts';
import type { LanguageModelClient } from '../../apps/api/src/services/ollama-client.ts';

let migrationsApplied = false;

export function createTestConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    appEnv: 'test',
    appPort: 3001,
    logLevel: 'error',
    databaseUrl:
      process.env.TEST_DATABASE_URL ??
      process.env.DATABASE_URL ??
      'postgresql://sokrai_app:localpass@localhost:5432/sokrai_app',
    databasePoolMax: 5,
    databaseStatementTimeoutMs: 5000,
    ollamaBaseUrl: 'http://localhost:11434',
    ollamaModel: 'fake-model',
    ollamaTimeoutMs: 1000,
    ollamaKeepAlive: '30m',
    ollamaNumCtx: 4096,
    briefExtractionMaxChars: 10000,
    jsonRepairMaxAttempts: 1,
    maxProposalChars: 30000,
    maxReplyChars: 4000,
    maxTurnsPerSession: 12,
    maxDiagnosisItems: 3,
    allowSensitiveHealthData: false,
    internalSharedSecret: 'test-secret',
    embeddingProvider: 'ollama',
    embeddingModel: 'fake-embedder',
    embeddingDimension: 1024,
    embeddingTimeoutMs: 1000,
    embeddingBatchSize: 16,
    ragDefaultTopK: 8,
    ragPacksDir: './tests/fixtures/rag',
    ...overrides,
  };
}

export async function applyMigrations(database: Database): Promise<void> {
  if (migrationsApplied) {
    return;
  }

  const migrationsDir = fromRepoRoot('db', 'migrations');
  const files = (await fs.readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();

  for (const file of files) {
    const sql = await fs.readFile(`${migrationsDir}/${file}`, 'utf8');
    await database.query(sql);
  }

  migrationsApplied = true;
}

export async function truncateAll(database: Database): Promise<void> {
  await database.query(
    [
      'TRUNCATE TABLE',
      'session_events,',
      'session_snapshots,',
      'conversation_turns,',
      'agent_runs,',
      'proposal_sessions',
      'RESTART IDENTITY CASCADE',
    ].join(' '),
  );
}

export async function truncateRag(database: Database): Promise<void> {
  await database.query(
    [
      'TRUNCATE TABLE',
      'rag_retrievals,',
      'rag_chunks,',
      'rag_documents,',
      'context_packs',
      'RESTART IDENTITY CASCADE',
    ].join(' '),
  );
}

export interface BuildTestAppOptions {
  resetDatabase?: boolean;
  resetRag?: boolean;
  database?: Database;
  embeddingClient?: EmbeddingClient;
  configOverrides?: Partial<AppConfig>;
}

export async function buildTestApp(languageModelClient: LanguageModelClient): Promise<{
  app: FastifyInstance;
  database: Database;
}>;
export async function buildTestApp(
  languageModelClient: LanguageModelClient,
  options?: BuildTestAppOptions,
): Promise<{
  app: FastifyInstance;
  database: Database;
}> {
  const config = createTestConfig(options?.configOverrides);
  const database = options?.database ?? new Database(config);
  await applyMigrations(database);

  if (options?.resetDatabase !== false) {
    await truncateAll(database);
  }

  if (options?.resetRag) {
    await truncateRag(database);
  }

  const app = await buildApp({
    config,
    database,
    languageModelClient,
    logger: new JsonLogger('error'),
    embeddingClient: options?.embeddingClient,
  });

  return {
    app,
    database,
  };
}

export async function readFixture<T = unknown>(...segments: string[]): Promise<T> {
  const fullPath = fromRepoRoot('tests', 'fixtures', ...segments);
  const text = await fs.readFile(fullPath, 'utf8');
  return JSON.parse(text) as T;
}

export async function readTextFixture(...segments: string[]): Promise<string> {
  const fullPath = fromRepoRoot('tests', 'fixtures', ...segments);
  return fs.readFile(fullPath, 'utf8');
}
