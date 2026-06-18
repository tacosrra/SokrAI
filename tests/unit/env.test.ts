import { afterEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../apps/api/src/config/env.ts';

const originalEnv = { ...process.env };

describe('loadConfig AI provider settings', () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('uses AI_MODEL as the orchestration model when provided', () => {
    process.env.AI_PROVIDER = 'ollama';
    process.env.OLLAMA_MODEL = 'ollama-default';
    process.env.AI_MODEL = 'api-alias';

    expect(loadConfig()).toMatchObject({
      aiProvider: 'ollama',
      ollamaModel: 'ollama-default',
      aiModel: 'api-alias',
    });
  });

  it('falls back to OLLAMA_MODEL when AI_MODEL is omitted', () => {
    process.env.AI_PROVIDER = 'ollama';
    process.env.OLLAMA_MODEL = 'ollama-default';
    delete process.env.AI_MODEL;

    expect(loadConfig()).toMatchObject({
      aiProvider: 'ollama',
      ollamaModel: 'ollama-default',
      aiModel: 'ollama-default',
    });
  });

  it('enables phase prefetch by default and allows disabling it', () => {
    delete process.env.PHASE_PREFETCH_ENABLED;
    expect(loadConfig()).toMatchObject({
      phasePrefetchEnabled: true,
    });

    process.env.PHASE_PREFETCH_ENABLED = 'false';
    expect(loadConfig()).toMatchObject({
      phasePrefetchEnabled: false,
    });
  });
});
