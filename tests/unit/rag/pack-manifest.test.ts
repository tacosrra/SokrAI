import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { PackManifestLoader } from '../../../apps/api/src/rag/pack-manifest.ts';
import { fromRepoRoot } from '../../../apps/api/src/utils/paths.ts';

describe('rag pack manifest', () => {
  const loader = new PackManifestLoader(fromRepoRoot('tests', 'fixtures', 'rag'));

  it('loads and validates the sample_pack manifest', async () => {
    const manifest = await loader.loadManifest('sample_pack');
    expect(manifest.name).toBe('sample_pack');
    expect(manifest.embedding.provider).toBe('ollama');
    expect(manifest.embedding.dimension).toBe(1024);
    expect(manifest.chunking.type).toBe('markdown_first');
    expect(manifest.chunking.target_tokens).toBeGreaterThan(0);
  });

  it('lists pack names from the fixtures directory', async () => {
    const names = await loader.listPackNames();
    expect(names).toContain('sample_pack');
  });

  it('rejects manifests with mismatched name', () => {
    expect(() =>
      loader.validate(
        {
          name: 'something_else',
          embedding: { provider: 'ollama', model: 'fake', dimension: 1024 },
          chunking: { strategy: 'plain_text', target_tokens: 200, overlap_tokens: 20 },
        },
        'expected_name',
      ),
    ).toThrowError(/name/);
  });

  it('rejects manifests with invalid embedding dimension', () => {
    expect(() =>
      loader.validate(
        {
          name: 'pack',
          embedding: { provider: 'ollama', model: 'fake', dimension: 0 },
          chunking: { strategy: 'plain_text', target_tokens: 200, overlap_tokens: 20 },
        },
        'pack',
      ),
    ).toThrowError(/dimension/);
  });

  it('rejects manifests where overlap is greater than or equal to target_tokens', () => {
    expect(() =>
      loader.validate(
        {
          name: 'pack',
          embedding: { provider: 'ollama', model: 'fake', dimension: 1024 },
          chunking: { strategy: 'plain_text', target_tokens: 100, overlap_tokens: 100 },
        },
        'pack',
      ),
    ).toThrowError(/overlap/);
  });

  it('rejects an unsupported chunk strategy', () => {
    expect(() =>
      loader.validate(
        {
          name: 'pack',
          embedding: { provider: 'ollama', model: 'fake', dimension: 1024 },
          chunking: { strategy: 'fancy_strategy', target_tokens: 200, overlap_tokens: 20 },
        },
        'pack',
      ),
    ).toThrowError(/strategy/);
  });

  it('exposes path helpers anchored to packs dir', () => {
    expect(loader.packDirectory('sample_pack')).toContain('sample_pack');
    expect(loader.sourcesDirectory('sample_pack').endsWith(path.join('sample_pack', 'sources'))).toBe(true);
    expect(loader.manifestPath('sample_pack').endsWith('pack.yaml')).toBe(true);
  });
});
