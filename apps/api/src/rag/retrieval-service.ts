import type { AppConfig } from '../config/env';
import { sha256 } from '../utils/hash';
import type { Logger } from '../utils/logger';
import type { EmbeddingClient } from './embedding-client';
import { RagError } from './errors';
import type { ContextPackStore } from './repositories/context-pack-store';
import type { RagChunkStore } from './repositories/rag-chunk-store';
import type { RagRetrievalStore } from './repositories/rag-retrieval-store';
import type { RetrievalRequest, RetrievalResult } from './types';

export interface RetrievalServiceDeps {
  config: AppConfig;
  logger: Logger;
  embeddingClient: EmbeddingClient;
  contextPackStore: ContextPackStore;
  chunkStore: RagChunkStore;
  retrievalStore: RagRetrievalStore;
}

export class RetrievalService {
  constructor(private readonly deps: RetrievalServiceDeps) {}

  async retrieve(request: RetrievalRequest): Promise<RetrievalResult> {
    if (request.query.trim().length === 0) {
      throw new RagError(400, 'rag_empty_query', 'Query text must not be empty');
    }

    if (request.packs.length === 0) {
      throw new RagError(400, 'rag_no_packs_requested', 'At least one pack must be requested');
    }

    const packs = await this.deps.contextPackStore.findByNames(request.packs);
    const foundNames = new Set(packs.map((pack) => pack.name));
    const missing = request.packs.filter((name) => !foundNames.has(name));

    if (missing.length > 0) {
      throw new RagError(
        404,
        'rag_pack_not_found',
        `Pack(s) not found: ${missing.join(', ')}`,
        { missing },
      );
    }

    const dimensions = new Set(packs.map((pack) => pack.embedding_dimension));
    if (dimensions.size > 1) {
      throw new RagError(
        409,
        'rag_pack_dimension_conflict',
        'Requested packs use different embedding dimensions and cannot be queried together',
      );
    }

    const requiredDimension = packs[0].embedding_dimension;
    if (requiredDimension !== this.deps.config.embeddingDimension) {
      throw new RagError(
        409,
        'rag_pack_dimension_conflict',
        `Pack(s) use dimension ${requiredDimension} but the API embedding model produces ${this.deps.config.embeddingDimension}`,
      );
    }

    const start = Date.now();
    const embedding = await this.deps.embeddingClient.embed({ text: request.query });

    const topK = Math.max(1, request.topK ?? this.deps.config.ragDefaultTopK);
    const packIds = packs.map((pack) => pack.id);

    const chunks = await this.deps.chunkStore.searchTopK({
      queryEmbedding: embedding.vector,
      packIds,
      topK,
      language: request.filters?.language,
      effectiveAfter: request.filters?.effectiveAfter,
    });

    const latencyMs = Date.now() - start;

    const retrievalId = await this.deps.retrievalStore.persist({
      requester: request.requester,
      requesterRef: request.requesterRef ?? null,
      queryText: request.query,
      queryTextSha256: sha256(request.query),
      queryEmbedding: embedding.vector,
      embeddingProvider: this.deps.config.embeddingProvider,
      embeddingModel: embedding.modelName,
      requestedPacks: request.packs,
      topK,
      filters: serializeFilters(request),
      retrievedChunks: chunks,
      latencyMs,
    });

    return {
      retrievalId,
      chunks,
      latencyMs,
      embeddingProvider: this.deps.config.embeddingProvider,
      embeddingModel: embedding.modelName,
    };
  }
}

function serializeFilters(request: RetrievalRequest): Record<string, unknown> {
  const filters: Record<string, unknown> = {};

  if (request.filters?.language) {
    filters.language = request.filters.language;
  }

  if (request.filters?.effectiveAfter) {
    filters.effectiveAfter = request.filters.effectiveAfter.toISOString();
  }

  return filters;
}
