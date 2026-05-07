import type { Database } from '../../repositories/database';
import type { RetrievedChunk } from '../types';
import { formatVectorLiteral } from './rag-chunk-store';

export interface PersistRetrievalParams {
  requester: string;
  requesterRef: string | null;
  queryText: string;
  queryTextSha256: string;
  queryEmbedding: number[];
  embeddingProvider: string;
  embeddingModel: string;
  requestedPacks: string[];
  topK: number;
  filters: Record<string, unknown>;
  retrievedChunks: RetrievedChunk[];
  latencyMs: number;
}

export class RagRetrievalStore {
  constructor(private readonly database: Database) {}

  async persist(params: PersistRetrievalParams): Promise<string> {
    const result = await this.database.query<{ id: string }>(
      `
      INSERT INTO rag_retrievals (
        requester, requester_ref, query_text, query_text_sha256, query_embedding,
        embedding_provider, embedding_model, requested_packs,
        top_k, filters_json, retrieved_chunks_json, latency_ms
      ) VALUES (
        $1, $2, $3, $4, $5::vector,
        $6, $7, $8::jsonb,
        $9, $10::jsonb, $11::jsonb, $12
      )
      RETURNING id
      `,
      [
        params.requester,
        params.requesterRef,
        params.queryText,
        params.queryTextSha256,
        formatVectorLiteral(params.queryEmbedding),
        params.embeddingProvider,
        params.embeddingModel,
        JSON.stringify(params.requestedPacks),
        params.topK,
        JSON.stringify(params.filters),
        JSON.stringify(params.retrievedChunks),
        params.latencyMs,
      ],
    );

    return result.rows[0].id;
  }
}
