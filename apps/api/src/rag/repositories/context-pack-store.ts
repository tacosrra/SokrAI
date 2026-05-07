import type { PoolClient } from 'pg';

import type { Database } from '../../repositories/database';
import { RagError } from '../errors';
import type { ContextPackRecord, PackManifest, PackSummary } from '../types';

export class ContextPackStore {
  constructor(private readonly database: Database) {}

  async findByName(name: string): Promise<ContextPackRecord | null> {
    const result = await this.database.query<ContextPackRecord>(
      'SELECT * FROM context_packs WHERE name = $1 LIMIT 1',
      [name],
    );
    return result.rows[0] ?? null;
  }

  async findByNames(names: string[]): Promise<ContextPackRecord[]> {
    if (names.length === 0) return [];
    const result = await this.database.query<ContextPackRecord>(
      'SELECT * FROM context_packs WHERE name = ANY($1::text[]) ORDER BY name',
      [names],
    );
    return result.rows;
  }

  async list(): Promise<ContextPackRecord[]> {
    const result = await this.database.query<ContextPackRecord>(
      'SELECT * FROM context_packs ORDER BY name',
    );
    return result.rows;
  }

  async listSummaries(): Promise<PackSummary[]> {
    const result = await this.database.query<PackSummary & { active_documents: string; archived_documents: string; active_chunks: string }>(
      `
      SELECT
        cp.id,
        cp.name,
        cp.description,
        cp.primary_language,
        cp.embedding_provider,
        cp.embedding_model,
        cp.embedding_dimension,
        cp.updated_at,
        COALESCE(d_active.count, 0) AS active_documents,
        COALESCE(d_archived.count, 0) AS archived_documents,
        COALESCE(c_active.count, 0) AS active_chunks
      FROM context_packs cp
      LEFT JOIN (
        SELECT context_pack_id, COUNT(*) AS count
        FROM rag_documents
        WHERE status = 'active'
        GROUP BY context_pack_id
      ) d_active ON d_active.context_pack_id = cp.id
      LEFT JOIN (
        SELECT context_pack_id, COUNT(*) AS count
        FROM rag_documents
        WHERE status = 'archived'
        GROUP BY context_pack_id
      ) d_archived ON d_archived.context_pack_id = cp.id
      LEFT JOIN (
        SELECT context_pack_id, COUNT(*) AS count
        FROM rag_chunks
        WHERE status = 'active'
        GROUP BY context_pack_id
      ) c_active ON c_active.context_pack_id = cp.id
      ORDER BY cp.name
      `,
    );

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      primary_language: row.primary_language,
      embedding_provider: row.embedding_provider,
      embedding_model: row.embedding_model,
      embedding_dimension: row.embedding_dimension,
      active_documents: Number(row.active_documents ?? 0),
      archived_documents: Number(row.archived_documents ?? 0),
      active_chunks: Number(row.active_chunks ?? 0),
      updated_at: row.updated_at,
    }));
  }

  async upsertFromManifest(client: PoolClient, manifest: PackManifest): Promise<ContextPackRecord> {
    const existing = await client.query<ContextPackRecord>(
      'SELECT * FROM context_packs WHERE name = $1 LIMIT 1 FOR UPDATE',
      [manifest.name],
    );

    if (existing.rows[0]) {
      const current = existing.rows[0];

      if (
        current.embedding_provider !== manifest.embedding.provider
        || current.embedding_model !== manifest.embedding.model
        || current.embedding_dimension !== manifest.embedding.dimension
      ) {
        throw new RagError(
          409,
          'rag_pack_embedding_mismatch',
          'Pack manifest changed embedding configuration. Drop the pack before reconfiguring.',
          {
            packName: manifest.name,
            existing: {
              provider: current.embedding_provider,
              model: current.embedding_model,
              dimension: current.embedding_dimension,
            },
            requested: manifest.embedding,
          },
        );
      }

      const updated = await client.query<ContextPackRecord>(
        `
        UPDATE context_packs
        SET description = $2,
            primary_language = $3,
            chunk_strategy_json = $4::jsonb,
            metadata_json = $5::jsonb
        WHERE id = $1
        RETURNING *
        `,
        [
          current.id,
          manifest.description ?? null,
          manifest.primary_language ?? null,
          JSON.stringify(manifest.chunking),
          JSON.stringify(manifest.metadata ?? {}),
        ],
      );
      return updated.rows[0];
    }

    const inserted = await client.query<ContextPackRecord>(
      `
      INSERT INTO context_packs (
        name, description, primary_language,
        embedding_provider, embedding_model, embedding_dimension,
        chunk_strategy_json, metadata_json
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
      RETURNING *
      `,
      [
        manifest.name,
        manifest.description ?? null,
        manifest.primary_language ?? null,
        manifest.embedding.provider,
        manifest.embedding.model,
        manifest.embedding.dimension,
        JSON.stringify(manifest.chunking),
        JSON.stringify(manifest.metadata ?? {}),
      ],
    );

    return inserted.rows[0];
  }
}
