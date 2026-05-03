import type { PoolClient } from 'pg';

import type { Database } from '../../repositories/database';
import { sha256 } from '../../utils/hash';
import type { Chunk } from '../chunking';
import type { RetrievedChunk } from '../types';

export interface InsertChunkBatchParams {
  documentId: string;
  contextPackId: string;
  chunks: Chunk[];
  embeddings: number[][];
}

export interface SearchTopKParams {
  queryEmbedding: number[];
  packIds: string[];
  topK: number;
  language?: string;
  effectiveAfter?: Date;
}

export interface SearchRow {
  chunk_id: string;
  document_id: string;
  document_title: string | null;
  document_source_path: string;
  section_path: string | null;
  content: string;
  similarity: number;
}

export class RagChunkStore {
  constructor(private readonly database: Database) {}

  async insertBatch(client: PoolClient, params: InsertChunkBatchParams): Promise<number> {
    if (params.chunks.length !== params.embeddings.length) {
      throw new Error('chunks and embeddings length mismatch');
    }

    if (params.chunks.length === 0) return 0;

    let inserted = 0;

    for (let index = 0; index < params.chunks.length; index += 1) {
      const chunk = params.chunks[index];
      const embedding = params.embeddings[index];

      await client.query(
        `
        INSERT INTO rag_chunks (
          document_id, context_pack_id, chunk_seq, content, content_sha256,
          section_path, char_start, char_end, token_count, embedding, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::vector, 'active')
        `,
        [
          params.documentId,
          params.contextPackId,
          index,
          chunk.content,
          sha256(chunk.content),
          chunk.sectionPath,
          chunk.charStart,
          chunk.charEnd,
          chunk.tokenCount,
          formatVectorLiteral(embedding),
        ],
      );
      inserted += 1;
    }

    return inserted;
  }

  async searchTopK(params: SearchTopKParams): Promise<RetrievedChunk[]> {
    if (params.packIds.length === 0) return [];

    const conditions: string[] = [
      'c.context_pack_id = ANY($2::uuid[])',
      "c.status = 'active'",
      "d.status = 'active'",
    ];
    const values: unknown[] = [formatVectorLiteral(params.queryEmbedding), params.packIds, params.topK];

    if (params.language) {
      conditions.push(`(d.language IS NULL OR d.language = $${values.length + 1})`);
      values.push(params.language);
    }

    if (params.effectiveAfter) {
      conditions.push(`(d.effective_date IS NULL OR d.effective_date >= $${values.length + 1})`);
      values.push(params.effectiveAfter);
    }

    const sql = `
      SELECT
        c.id            AS chunk_id,
        c.document_id   AS document_id,
        d.title         AS document_title,
        d.source_path   AS document_source_path,
        c.section_path  AS section_path,
        c.content       AS content,
        1 - (c.embedding <=> $1::vector) AS similarity
      FROM rag_chunks c
      JOIN rag_documents d ON d.id = c.document_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY c.embedding <=> $1::vector
      LIMIT $3
    `;

    const result = await this.database.query<SearchRow>(sql, values);

    return result.rows.map((row) => ({
      chunkId: row.chunk_id,
      documentId: row.document_id,
      documentTitle: row.document_title ?? row.document_source_path,
      sectionPath: row.section_path,
      content: row.content,
      score: Number(row.similarity),
    }));
  }
}

export function formatVectorLiteral(vector: number[]): string {
  return `[${vector.map((value) => Number.isFinite(value) ? value.toString() : '0').join(',')}]`;
}
