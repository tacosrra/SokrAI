import type { AppConfig } from '../config/env';
import { AppError } from '../utils/errors';
import type { AiProviderName, AiProviderPort } from './ai-provider';
import { OllamaClient } from './ollama-client';

export function createAiProvider(config: AppConfig): AiProviderPort {
  const providerName = getConfiguredProvider(config);

  if (providerName === 'ollama') {
    return new OllamaClient(config);
  }

  throw new AppError(500, 'ai_provider_not_supported', 'The configured AI provider is not supported', false, undefined, {
    provider_name: providerName,
  });
}

function getConfiguredProvider(config: AppConfig): AiProviderName {
  return ('aiProvider' in config ? config.aiProvider : 'ollama') as AiProviderName;
}
