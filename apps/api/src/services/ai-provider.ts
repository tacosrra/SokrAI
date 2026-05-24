import { AppError } from '../utils/errors';

export type AiProviderName = 'ollama';

export interface AiGenerationParams {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  responseSchema?: Record<string, unknown>;
}

export interface AiProviderMetadata {
  providerName: AiProviderName;
  modelName: string;
  modelParams: Record<string, unknown>;
}

export interface AiCompletionResult extends AiProviderMetadata {
  content: string;
  latencyMs: number;
  metrics: Record<string, unknown>;
}

export interface AiProviderPort {
  readonly providerName: AiProviderName;
  generate(params: AiGenerationParams): Promise<AiCompletionResult>;
}

export class AiProviderError extends AppError {
  constructor(
    public readonly providerName: AiProviderName,
    statusCode: number,
    errorCode: string,
    safeMessage: string,
    retryable = false,
    details?: Record<string, unknown>,
  ) {
    super(statusCode, errorCode, safeMessage, retryable, undefined, {
      provider_name: providerName,
      ...(details ?? {}),
    });
    this.name = 'AiProviderError';
  }
}
