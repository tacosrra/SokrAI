import { describe, expect, it } from 'vitest';

import { createAiProvider } from '../../apps/api/src/services/ai-provider-factory.ts';
import { OllamaClient } from '../../apps/api/src/services/ollama-client.ts';
import { createTestConfig } from '../helpers/test-environment.ts';

describe('createAiProvider', () => {
  it('creates the local Ollama provider for the configured MVP provider', () => {
    const provider = createAiProvider(createTestConfig());

    expect(provider).toBeInstanceOf(OllamaClient);
    expect(provider.providerName).toBe('ollama');
  });

  it('rejects unsupported providers without falling back externally', () => {
    const config = {
      ...createTestConfig(),
      aiProvider: 'remote',
    };

    expect(() => createAiProvider(config as never)).toThrowError(
      'The configured AI provider is not supported',
    );
  });
});
