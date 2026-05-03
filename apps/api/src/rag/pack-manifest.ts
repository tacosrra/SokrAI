import fs from 'node:fs/promises';
import path from 'node:path';

import YAML from 'yaml';

import { RagError } from './errors';
import type { ChunkStrategy, PackManifest } from './types';

const VALID_CHUNK_STRATEGIES = new Set(['markdown_first', 'plain_text']);

export class PackManifestLoader {
  constructor(private readonly packsDir: string) {}

  packDirectory(packName: string): string {
    return path.join(this.packsDir, packName);
  }

  sourcesDirectory(packName: string): string {
    return path.join(this.packDirectory(packName), 'sources');
  }

  manifestPath(packName: string): string {
    return path.join(this.packDirectory(packName), 'pack.yaml');
  }

  async listPackNames(): Promise<string[]> {
    let entries: import('node:fs').Dirent[];

    try {
      entries = await fs.readdir(this.packsDir, { withFileTypes: true });
    } catch (error) {
      throw new RagError(
        500,
        'rag_packs_dir_unreadable',
        `Could not read packs directory at ${this.packsDir}`,
        { cause: error instanceof Error ? error.message : 'unknown' },
      );
    }

    const packNames: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.')) continue;

      try {
        await fs.access(path.join(this.packsDir, entry.name, 'pack.yaml'));
        packNames.push(entry.name);
      } catch {
        // Folder without manifest, ignore.
      }
    }

    return packNames.sort();
  }

  async loadManifest(packName: string): Promise<PackManifest> {
    const manifestPath = this.manifestPath(packName);
    let raw: string;

    try {
      raw = await fs.readFile(manifestPath, 'utf8');
    } catch (error) {
      throw new RagError(
        404,
        'rag_pack_manifest_missing',
        `Pack manifest not found at ${manifestPath}`,
        { packName, cause: error instanceof Error ? error.message : 'unknown' },
      );
    }

    let parsed: unknown;

    try {
      parsed = YAML.parse(raw);
    } catch (error) {
      throw new RagError(
        400,
        'rag_pack_manifest_invalid_yaml',
        `Pack manifest is not valid YAML: ${packName}`,
        { cause: error instanceof Error ? error.message : 'unknown' },
      );
    }

    return this.validate(parsed, packName);
  }

  validate(input: unknown, expectedName: string): PackManifest {
    if (!isObject(input)) {
      throw new RagError(400, 'rag_pack_manifest_invalid', 'Pack manifest must be a YAML object');
    }

    const name = input.name;

    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new RagError(400, 'rag_pack_manifest_invalid', 'Pack manifest field `name` is required');
    }

    if (name !== expectedName) {
      throw new RagError(
        400,
        'rag_pack_manifest_name_mismatch',
        `Pack manifest name (${name}) does not match folder name (${expectedName})`,
      );
    }

    const description = input.description;
    if (description !== undefined && typeof description !== 'string') {
      throw new RagError(400, 'rag_pack_manifest_invalid', 'Field `description` must be a string when present');
    }

    const primaryLanguage = input.primary_language;
    if (primaryLanguage !== undefined && typeof primaryLanguage !== 'string') {
      throw new RagError(400, 'rag_pack_manifest_invalid', 'Field `primary_language` must be a string when present');
    }

    const embedding = input.embedding;
    if (!isObject(embedding)) {
      throw new RagError(400, 'rag_pack_manifest_invalid', 'Field `embedding` must be an object');
    }

    const provider = embedding.provider;
    if (provider !== 'ollama') {
      throw new RagError(
        400,
        'rag_pack_manifest_invalid',
        'Field `embedding.provider` must be "ollama" in v1',
      );
    }

    const model = embedding.model;
    if (typeof model !== 'string' || model.trim().length === 0) {
      throw new RagError(400, 'rag_pack_manifest_invalid', 'Field `embedding.model` is required');
    }

    const dimension = embedding.dimension;
    if (typeof dimension !== 'number' || !Number.isInteger(dimension) || dimension <= 0) {
      throw new RagError(400, 'rag_pack_manifest_invalid', 'Field `embedding.dimension` must be a positive integer');
    }

    const chunking = input.chunking;
    if (!isObject(chunking)) {
      throw new RagError(400, 'rag_pack_manifest_invalid', 'Field `chunking` must be an object');
    }

    const chunkType = chunking.strategy ?? chunking.type;
    if (typeof chunkType !== 'string' || !VALID_CHUNK_STRATEGIES.has(chunkType)) {
      throw new RagError(
        400,
        'rag_pack_manifest_invalid',
        `Field \`chunking.strategy\` must be one of: ${Array.from(VALID_CHUNK_STRATEGIES).join(', ')}`,
      );
    }

    const targetTokens = chunking.target_tokens;
    if (typeof targetTokens !== 'number' || !Number.isInteger(targetTokens) || targetTokens <= 0) {
      throw new RagError(400, 'rag_pack_manifest_invalid', 'Field `chunking.target_tokens` must be a positive integer');
    }

    const overlapTokens = chunking.overlap_tokens;
    if (
      typeof overlapTokens !== 'number'
      || !Number.isInteger(overlapTokens)
      || overlapTokens < 0
      || overlapTokens >= targetTokens
    ) {
      throw new RagError(
        400,
        'rag_pack_manifest_invalid',
        'Field `chunking.overlap_tokens` must be a non-negative integer smaller than `target_tokens`',
      );
    }

    const metadata = input.metadata;
    if (metadata !== undefined && !isObject(metadata)) {
      throw new RagError(400, 'rag_pack_manifest_invalid', 'Field `metadata` must be an object when present');
    }

    const strategy: ChunkStrategy = {
      type: chunkType as ChunkStrategy['type'],
      target_tokens: targetTokens,
      overlap_tokens: overlapTokens,
    };

    return {
      name,
      description: description as string | undefined,
      primary_language: primaryLanguage as string | undefined,
      embedding: {
        provider: 'ollama',
        model,
        dimension,
      },
      chunking: strategy,
      metadata: metadata as Record<string, unknown> | undefined,
    };
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
