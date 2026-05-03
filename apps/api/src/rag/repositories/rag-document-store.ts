import type { PoolClient } from 'pg';

import type { Database } from '../../repositories/database';
import type { RagDocumentRecord } from '../types';

export interface InsertDocumentParams {
  contextPackId: string;
  sourcePath: string;
  sourceSha256: string;
  title: string | null;
  mimeType: string;
  language: string | null;
  effectiveDate: Date | null;
  metadata: Record<string, unknown>;
  rawText: string;
  rawTextSha256: string;
  charCount: number;
}

export class RagDocumentStore {
  constructor(private readonly database: Database) {}

  async findActiveByPackAndPath(
    contextPackId: string,
    sourcePath: string,
  ): Promise<RagDocumentRecord | null> {
    const result = await this.database.query<RagDocumentRecord>(
      `
      SELECT * FROM rag_documents
      WHERE context_pack_id = $1
        AND source_path = $2
        AND status = 'active'
      ORDER BY ingested_at DESC
      LIMIT 1
      `,
      [contextPackId, sourcePath],
    );
    return result.rows[0] ?? null;
  }

  async findExisting(
    contextPackId: string,
    sourcePath: string,
    sourceSha256: string,
  ): Promise<RagDocumentRecord | null> {
    const result = await this.database.query<RagDocumentRecord>(
      `
      SELECT * FROM rag_documents
      WHERE context_pack_id = $1
        AND source_path = $2
        AND source_sha256 = $3
      LIMIT 1
      `,
      [contextPackId, sourcePath, sourceSha256],
    );
    return result.rows[0] ?? null;
  }

  async archiveByPackAndPath(
    client: PoolClient,
    contextPackId: string,
    sourcePath: string,
  ): Promise<void> {
    await client.query(
      `
      UPDATE rag_documents
      SET status = 'archived', archived_at = NOW()
      WHERE context_pack_id = $1
        AND source_path = $2
        AND status = 'active'
      `,
      [contextPackId, sourcePath],
    );

    await client.query(
      `
      UPDATE rag_chunks
      SET status = 'archived'
      WHERE context_pack_id = $1
        AND document_id IN (
          SELECT id FROM rag_documents
          WHERE context_pack_id = $1 AND source_path = $2 AND status = 'archived'
        )
        AND status = 'active'
      `,
      [contextPackId, sourcePath],
    );
  }

  async insert(client: PoolClient, params: InsertDocumentParams): Promise<RagDocumentRecord> {
    const result = await client.query<RagDocumentRecord>(
      `
      INSERT INTO rag_documents (
        context_pack_id, source_path, source_sha256, title, mime_type, language,
        effective_date, metadata_json, raw_text, raw_text_sha256, char_count, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, 'active')
      RETURNING *
      `,
      [
        params.contextPackId,
        params.sourcePath,
        params.sourceSha256,
        params.title,
        params.mimeType,
        params.language,
        params.effectiveDate,
        JSON.stringify(params.metadata),
        params.rawText,
        params.rawTextSha256,
        params.charCount,
      ],
    );

    return result.rows[0];
  }
}
