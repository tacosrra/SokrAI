import path from 'node:path';

import type { AppConfig } from '../config/env';
import type { Database } from '../repositories/database';
import { fromRepoRoot } from '../utils/paths';
import type { Logger } from '../utils/logger';
import { OllamaEmbeddingClient, type EmbeddingClient } from './embedding-client';
import { IngestionService } from './ingestion-service';
import { PackManifestLoader } from './pack-manifest';
import { buildSourcesBlock, validateCitations } from './prompt-augmenter';
import { ContextPackStore } from './repositories/context-pack-store';
import { RagChunkStore } from './repositories/rag-chunk-store';
import { RagDocumentStore } from './repositories/rag-document-store';
import { RagRetrievalStore } from './repositories/rag-retrieval-store';
import { RetrievalService } from './retrieval-service';
import type { PackSummary, RetrievalRequest, RetrievalResult } from './types';

export interface RagModule {
  retrieval: RetrievalService;
  ingestion: IngestionService;
  packStore: ContextPackStore;
  manifestLoader: PackManifestLoader;
  embeddingClient: EmbeddingClient;
  buildSourcesBlock: typeof buildSourcesBlock;
  validateCitations: typeof validateCitations;
}

export interface BuildRagModuleDeps {
  config: AppConfig;
  database: Database;
  logger: Logger;
  embeddingClient?: EmbeddingClient;
}

export function buildRagModule(deps: BuildRagModuleDeps): RagModule {
  const embeddingClient = deps.embeddingClient ?? new OllamaEmbeddingClient(deps.config);
  const manifestLoader = new PackManifestLoader(resolvePacksDir(deps.config));
  const contextPackStore = new ContextPackStore(deps.database);
  const documentStore = new RagDocumentStore(deps.database);
  const chunkStore = new RagChunkStore(deps.database);
  const retrievalStore = new RagRetrievalStore(deps.database);

  const ingestion = new IngestionService({
    config: deps.config,
    database: deps.database,
    logger: deps.logger,
    embeddingClient,
    manifestLoader,
    contextPackStore,
    documentStore,
    chunkStore,
  });

  const retrieval = new RetrievalService({
    config: deps.config,
    logger: deps.logger,
    embeddingClient,
    contextPackStore,
    chunkStore,
    retrievalStore,
  });

  return {
    retrieval,
    ingestion,
    packStore: contextPackStore,
    manifestLoader,
    embeddingClient,
    buildSourcesBlock,
    validateCitations,
  };
}

function resolvePacksDir(config: AppConfig): string {
  const dir = config.ragPacksDir;
  if (path.isAbsolute(dir)) {
    return dir;
  }
  const segments = dir.split(/[\\/]+/).filter((segment) => segment && segment !== '.');
  return fromRepoRoot(...segments);
}

export type { EmbeddingClient } from './embedding-client';
export type {
  ContextPackRecord,
  PackManifest,
  PackSummary,
  RetrievalFilters,
  RetrievalRequest,
  RetrievalResult,
  RetrievedChunk,
  IngestionFileReport,
  IngestionReport,
} from './types';
export { RagError } from './errors';
export { buildSourcesBlock, validateCitations } from './prompt-augmenter';

export type AnyRetrievalRequest = RetrievalRequest;
export type AnyRetrievalResult = RetrievalResult;
export type AnyPackSummary = PackSummary;

