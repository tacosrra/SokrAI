import { afterEach, describe, expect, it, vi } from 'vitest';

import { OllamaClient } from '../../apps/api/src/services/ollama-client.ts';
import { createTestConfig } from '../helpers/test-environment.ts';

function createClient() {
  const config = {
    ...createTestConfig(),
    ollamaBaseUrl: 'http://ollama:11434',
    ollamaTimeoutMs: 1234,
  };

  return new OllamaClient(config);
}

describe('OllamaClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('maps fetch timeouts to a controlled ollama_timeout error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(Object.assign(new Error('timed out'), { name: 'TimeoutError' })),
    );

    const client = createClient();

    await expect(
      client.generate({
        model: 'fake-model',
        systemPrompt: 'system',
        userPrompt: 'user',
      }),
    ).rejects.toMatchObject({
      statusCode: 504,
      errorCode: 'ollama_timeout',
      retryable: true,
    });
  });

  it('maps network failures to a controlled ollama_unreachable error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    const client = createClient();

    await expect(
      client.generate({
        model: 'fake-model',
        systemPrompt: 'system',
        userPrompt: 'user',
      }),
    ).rejects.toMatchObject({
      statusCode: 503,
      errorCode: 'ollama_unreachable',
      retryable: true,
    });
  });

  it('maps invalid JSON payloads to a controlled ollama_invalid_response error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token <')),
      } satisfies Partial<Response>),
    );

    const client = createClient();

    await expect(
      client.generate({
        model: 'fake-model',
        systemPrompt: 'system',
        userPrompt: 'user',
      }),
    ).rejects.toMatchObject({
      statusCode: 502,
      errorCode: 'ollama_invalid_response',
      retryable: false,
    });
  });
});
