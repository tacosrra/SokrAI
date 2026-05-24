import fs from 'node:fs/promises';

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../../apps/api/src/app.ts';
import type { AppConfig } from '../../apps/api/src/config/env.ts';
import { Database } from '../../apps/api/src/repositories/database.ts';
import { JsonLogger } from '../../apps/api/src/utils/logger.ts';
import { fromRepoRoot } from '../../apps/api/src/utils/paths.ts';
import type { LanguageModelClient } from '../../apps/api/src/services/ollama-client.ts';

let migrationsApplied = false;

export function createTestConfig(): AppConfig {
  return {
    appEnv: 'test',
    appPort: 3001,
    logLevel: 'error',
    databaseUrl:
      process.env.TEST_DATABASE_URL ??
      process.env.DATABASE_URL ??
      'postgresql://sokrai_app:localpass@localhost:5433/sokrai_app',
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
      'audit_events,',
      'basic_reports,',
      'proposal_sources,',
      'alpha_gaps,',
      'generated_sections,',
      'chat_turns,',
      'module_chats,',
      'proposal_documents,',
      'proposals,',
      'session_events,',
      'session_snapshots,',
      'conversation_turns,',
      'agent_runs,',
      'proposal_sessions',
      'RESTART IDENTITY CASCADE',
    ].join(' '),
  );
}

export async function buildTestApp(languageModelClient: LanguageModelClient): Promise<{
  app: FastifyInstance;
  database: Database;
}>;
export async function buildTestApp(
  languageModelClient: LanguageModelClient,
  options?: { resetDatabase?: boolean; database?: Database; config?: Partial<AppConfig> },
): Promise<{
  app: FastifyInstance;
  database: Database;
}> {
  const config = {
    ...createTestConfig(),
    ...(options?.config ?? {}),
  };
  const database = options?.database ?? new Database(config);
  await applyMigrations(database);

  if (options?.resetDatabase !== false) {
    await truncateAll(database);
  }

  const app = await buildApp({
    config,
    database,
    languageModelClient,
    logger: new JsonLogger('error'),
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
