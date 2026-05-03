import fs from 'node:fs/promises';
import path from 'node:path';

import type { AppConfig } from '../config/env';
import type { Database } from '../repositories/database';
import { sha256 } from '../utils/hash';
import type { Logger } from '../utils/logger';
import { chunkText, type Chunk } from './chunking';
import { DocumentLoader } from './document-loader';
import type { EmbeddingClient } from './embedding-client';
import { RagError } from './errors';
import { PackManifestLoader } from './pack-manifest';
import type { ContextPackStore } from './repositories/context-pack-store';
import type { RagChunkStore } from './repositories/rag-chunk-store';
import type { RagDocumentStore } from './repositories/rag-document-store';
import type { IngestionFileReport, IngestionReport, PackManifest } from './types';

const DOCUMENT_EXTENSIONS = ['.md', '.markdown', '.txt', '.pdf'];

export interface IngestionServiceDeps {
  config: AppConfig;
  database: Database;
  logger: Logger;
  embeddingClient: EmbeddingClient;
  manifestLoader: PackManifestLoader;
  contextPackStore: ContextPackStore;
  documentStore: RagDocumentStore;
  chunkStore: RagChunkStore;
}

export class IngestionService {
  private readonly documentLoader = new DocumentLoader();

  constructor(private readonly deps: IngestionServiceDeps) {}

  async ingestPack(packName: string): Promise<IngestionReport> {
    const startedAt = new Date();
    const manifest = await this.deps.manifestLoader.loadManifest(packName);
    this.assertEmbeddingMatchesConfig(manifest);

    const sourcesDir = this.deps.manifestLoader.sourcesDirectory(packName);
    await this.assertDirectoryExists(sourcesDir, packName);

    const sourceFiles = await this.discoverSourceFiles(sourcesDir);

    const files: IngestionFileReport[] = [];
    let totalChunksInserted = 0;

    for (const relativePath of sourceFiles) {
      try {
        const result = await this.ingestSingleFile(manifest, sourcesDir, relativePath);
        files.push(result);
        totalChunksInserted += result.chunksInserted ?? 0;
      } catch (error) {
        this.deps.logger.error('rag_ingestion_file_failed', {
          pack: packName,
          source_path: relativePath,
          error: error instanceof Error ? error.message : 'unknown',
        });
        files.push({
          sourcePath: relativePath,
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'unknown',
        });
      }
    }

    const finishedAt = new Date();

    this.deps.logger.info('rag_ingestion_completed', {
      pack: packName,
      files: files.length,
      total_chunks_inserted: totalChunksInserted,
      duration_ms: finishedAt.getTime() - startedAt.getTime(),
    });

    return {
      packName,
      embeddingModel: manifest.embedding.model,
      files,
      totalChunksInserted,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
    };
  }

  private assertEmbeddingMatchesConfig(manifest: PackManifest): void {
    const { config } = this.deps;

    if (manifest.embedding.provider !== config.embeddingProvider) {
      throw new RagError(
        400,
        'rag_pack_provider_mismatch',
        `Pack uses provider "${manifest.embedding.provider}" but the API is configured with "${config.embeddingProvider}"`,
      );
    }

    if (manifest.embedding.dimension !== config.embeddingDimension) {
      throw new RagError(
        400,
        'rag_pack_dimension_mismatch',
        `Pack expects dimension ${manifest.embedding.dimension} but the API is configured for ${config.embeddingDimension}`,
      );
    }
  }

  private async assertDirectoryExists(directory: string, packName: string): Promise<void> {
    try {
      const stat = await fs.stat(directory);
      if (!stat.isDirectory()) {
        throw new Error('not a directory');
      }
    } catch (error) {
      throw new RagError(
        404,
        'rag_pack_sources_missing',
        `Pack "${packName}" does not have a sources directory at ${directory}`,
        { cause: error instanceof Error ? error.message : 'unknown' },
      );
    }
  }

  private async discoverSourceFiles(rootDir: string): Promise<string[]> {
    const collected: string[] = [];
    await this.walk(rootDir, '', collected);
    return collected.sort();
  }

  private async walk(rootDir: string, relativeDir: string, collected: string[]): Promise<void> {
    const absolute = path.join(rootDir, relativeDir);
    const entries = await fs.readdir(absolute, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;

      const nextRelative = relativeDir ? path.join(relativeDir, entry.name) : entry.name;

      if (entry.isDirectory()) {
        await this.walk(rootDir, nextRelative, collected);
        continue;
      }

      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name).toLowerCase();
      if (DOCUMENT_EXTENSIONS.includes(ext)) {
        collected.push(nextRelative.replace(/\\/g, '/'));
      }
    }
  }

  private async ingestSingleFile(
    manifest: PackManifest,
    sourcesDir: string,
    relativePath: string,
  ): Promise<IngestionFileReport> {
    const absolutePath = path.join(sourcesDir, relativePath);
    const fileBuffer = await fs.readFile(absolutePath);
    const sourceSha = sha256(fileBuffer.toString('base64'));

    const pack = await this.deps.contextPackStore.findByName(manifest.name);

    if (pack) {
      const existing = await this.deps.documentStore.findExisting(pack.id, relativePath, sourceSha);
      if (existing && existing.status === 'active') {
        return { sourcePath: relativePath, status: 'skipped', documentId: existing.id };
      }
    }

    const loaded = await this.documentLoader.load(absolutePath);
    const chunks = chunkText(loaded.rawText, manifest.chunking);

    if (chunks.length === 0) {
      return {
        sourcePath: relativePath,
        status: 'failed',
        errorMessage: 'document produced zero chunks after splitting',
      };
    }

    const embeddings = await this.embedAllChunks(manifest, chunks);

    return this.deps.database.withTransaction(async (client) => {
      const upsertedPack = await this.deps.contextPackStore.upsertFromManifest(client, manifest);
      const isUpdate = pack
        ? Boolean(await this.deps.documentStore.findActiveByPackAndPath(upsertedPack.id, relativePath))
        : false;

      if (isUpdate) {
        await this.deps.documentStore.archiveByPackAndPath(client, upsertedPack.id, relativePath);
      }

      const document = await this.deps.documentStore.insert(client, {
        contextPackId: upsertedPack.id,
        sourcePath: relativePath,
        sourceSha256: sourceSha,
        title: deriveTitle(relativePath, loaded.rawText),
        mimeType: loaded.mimeType,
        language: manifest.primary_language ?? null,
        effectiveDate: null,
        metadata: { ...(manifest.metadata ?? {}) },
        rawText: loaded.rawText,
        rawTextSha256: sha256(loaded.rawText),
        charCount: loaded.charCount,
      });

      const inserted = await this.deps.chunkStore.insertBatch(client, {
        documentId: document.id,
        contextPackId: upsertedPack.id,
        chunks,
        embeddings,
      });

      return {
        sourcePath: relativePath,
        status: isUpdate ? 'updated' : 'added',
        documentId: document.id,
        chunksInserted: inserted,
        charCount: loaded.charCount,
      };
    });
  }

  private async embedAllChunks(manifest: PackManifest, chunks: Chunk[]): Promise<number[][]> {
    const batchSize = Math.max(1, this.deps.config.embeddingBatchSize);
    const vectors: number[][] = [];

    for (let i = 0; i < chunks.length; i += batchSize) {
      const slice = chunks.slice(i, i + batchSize);
      const result = await this.deps.embeddingClient.embedBatch({
        texts: slice.map((chunk) => chunk.content),
        model: manifest.embedding.model,
      });

      if (result.dimension !== manifest.embedding.dimension) {
        throw new RagError(
          500,
          'rag_embedding_dimension_mismatch',
          `Embedding model returned dimension ${result.dimension} but pack expects ${manifest.embedding.dimension}`,
        );
      }

      vectors.push(...result.vectors);
    }

    return vectors;
  }
}

function deriveTitle(relativePath: string, rawText: string): string {
  const headingMatch = rawText.match(/^#\s+(.+?)\s*$/m);
  if (headingMatch) return headingMatch[1].trim();

  const fileName = path.basename(relativePath, path.extname(relativePath));
  return fileName.replace(/[-_]+/g, ' ').trim();
}
