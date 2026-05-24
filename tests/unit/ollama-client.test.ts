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

const originalFetch = globalThis.fetch;

function stubFetch(fetchMock: typeof fetch): void {
  Object.defineProperty(globalThis, 'fetch', {
    value: fetchMock,
    configurable: true,
    writable: true,
  });
}

describe('OllamaClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, 'fetch', {
      value: originalFetch,
      configurable: true,
      writable: true,
    });
  });

  it('maps fetch timeouts to a controlled ollama_timeout error', async () => {
    stubFetch(
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
    stubFetch(vi.fn().mockRejectedValue(new TypeError('fetch failed')));

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
    stubFetch(
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
      name: 'AiProviderError',
      statusCode: 502,
      errorCode: 'ollama_invalid_response',
      retryable: false,
    });
  });

  it('maps non-2xx responses to a controlled provider error', async () => {
    stubFetch(
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('server error'),
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
      name: 'AiProviderError',
      providerName: 'ollama',
      statusCode: 502,
      errorCode: 'ollama_request_failed',
      retryable: true,
    });
  });

  it.each([
    ['missing message', {}],
    ['missing message.content', { message: {} }],
    ['non-string message.content', { message: { content: 42 } }],
    ['blank message.content', { message: { content: '   ' } }],
  ])('rejects %s as an invalid provider response', async (_caseName, payload) => {
    stubFetch(
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(payload),
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
      name: 'AiProviderError',
      providerName: 'ollama',
      statusCode: 502,
      errorCode: 'ollama_invalid_response',
      retryable: false,
    });
  });

  it('sends keep_alive to reduce cold starts and returns provider metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        model: 'fake-model',
        message: {
          content: '{"ok":true}',
        },
      }),
    } satisfies Partial<Response>);
    stubFetch(fetchMock);

    const client = createClient();

    const result = await client.generate({
      model: 'fake-model',
      systemPrompt: 'system',
      userPrompt: 'user',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(init.body));

    expect(payload.keep_alive).toBe('30m');
    expect(result).toMatchObject({
      providerName: 'ollama',
      modelName: 'fake-model',
      modelParams: {
        temperature: 0.2,
        num_ctx: 4096,
        keep_alive: '30m',
      },
    });
  });
});
