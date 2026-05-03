import type { FastifyInstance } from 'fastify';

import {
  assertRagPacksResponse,
  assertRagSearchRequest,
  assertRagSearchResponse,
} from '../contracts/schema-registry';
import type { RagModule } from '../rag';

interface SearchQuery {
  q?: string;
  pack?: string | string[];
  k?: string;
  language?: string;
}

export function registerRagInspectionRoutes(app: FastifyInstance, ragModule: RagModule): void {
  app.get('/api/v1/rag/packs', async () => {
    const summaries = await ragModule.packStore.listSummaries();

    const payload = {
      packs: summaries.map((summary) => ({
        id: summary.id,
        name: summary.name,
        description: summary.description,
        primary_language: summary.primary_language,
        embedding_provider: summary.embedding_provider,
        embedding_model: summary.embedding_model,
        embedding_dimension: summary.embedding_dimension,
        active_documents: summary.active_documents,
        archived_documents: summary.archived_documents,
        active_chunks: summary.active_chunks,
        updated_at: summary.updated_at instanceof Date
          ? summary.updated_at.toISOString()
          : new Date(summary.updated_at).toISOString(),
      })),
    };

    return assertRagPacksResponse(payload);
  });

  app.get('/api/v1/rag/search', async (request, reply) => {
    const query = request.query as SearchQuery;

    const packs = normalizePacks(query.pack);

    const requestPayload = assertRagSearchRequest({
      query: query.q ?? '',
      packs,
      top_k: query.k ? Number(query.k) : undefined,
      language: query.language,
    });

    const result = await ragModule.retrieval.retrieve({
      query: requestPayload.query,
      packs: requestPayload.packs,
      topK: requestPayload.top_k,
      filters: requestPayload.language ? { language: requestPayload.language } : undefined,
      requester: 'api_search',
    });

    const responsePayload = {
      retrieval_id: result.retrievalId,
      embedding_provider: result.embeddingProvider,
      embedding_model: result.embeddingModel,
      latency_ms: result.latencyMs,
      chunks: result.chunks.map((chunk) => ({
        chunk_id: chunk.chunkId,
        document_id: chunk.documentId,
        document_title: chunk.documentTitle,
        section_path: chunk.sectionPath,
        content: chunk.content,
        score: chunk.score,
      })),
    };

    return reply.send(assertRagSearchResponse(responsePayload));
  });
}

function normalizePacks(value: string | string[] | undefined): string[] {
  if (!value) return [];

  const raw = Array.isArray(value) ? value : [value];
  const items: string[] = [];

  for (const entry of raw) {
    for (const part of entry.split(',')) {
      const trimmed = part.trim();
      if (trimmed.length > 0) items.push(trimmed);
    }
  }

  return items;
}
