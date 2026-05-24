import type { AppConfig } from '../config/env';
import { AppError } from '../utils/errors';
import {
  AiProviderError,
  type AiCompletionResult,
  type AiGenerationParams,
  type AiProviderPort,
} from './ai-provider';

interface OllamaChatPayload {
  model?: string;
  message?: { content?: string };
  total_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaClient implements AiProviderPort {
  readonly providerName = 'ollama';

  constructor(private readonly config: AppConfig) {}

  async generate(params: AiGenerationParams): Promise<AiCompletionResult> {
    const start = Date.now();
    let response: Response;
    const modelParams = {
      temperature: 0.2,
      num_ctx: this.config.ollamaNumCtx,
      keep_alive: this.config.ollamaKeepAlive,
    };

    try {
      response = await fetch(`${this.config.ollamaBaseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: params.model,
          stream: false,
          format: params.responseSchema,
          keep_alive: modelParams.keep_alive,
          options: {
            temperature: modelParams.temperature,
            num_ctx: modelParams.num_ctx,
          },
          messages: [
            {
              role: 'system',
              content: params.systemPrompt,
            },
            {
              role: 'user',
              content: params.userPrompt,
            },
          ],
        }),
        signal: AbortSignal.timeout(this.config.ollamaTimeoutMs),
      });
    } catch (error) {
      throw toOllamaAppError(error, this.config);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new AppError(502, 'ollama_request_failed', 'The local model did not return a successful response', true, undefined, {
        status: response.status,
        body: text,
      });
    }

    let payload: OllamaChatPayload;

    try {
      payload = (await response.json()) as OllamaChatPayload;
    } catch (error) {
      throw new AppError(
        502,
        'ollama_invalid_response',
        'The local model returned an invalid JSON payload',
        false,
        undefined,
        {
          cause: error instanceof Error ? error.message : 'unknown',
        },
      );
    }

    return {
      content: payload.message?.content ?? '',
      providerName: this.providerName,
      modelName: payload.model ?? params.model,
      modelParams,
      latencyMs: Date.now() - start,
      metrics: {
        total_duration: payload.total_duration,
        prompt_eval_count: payload.prompt_eval_count,
        eval_count: payload.eval_count,
      },
    };
  }
}

function toOllamaAppError(error: unknown, config: AppConfig): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
    return new AiProviderError('ollama', 504, 'ollama_timeout', 'The local model exceeded the configured timeout', true, {
      base_url: config.ollamaBaseUrl,
      timeout_ms: config.ollamaTimeoutMs,
    });
  }

  if (error instanceof TypeError) {
    return new AiProviderError('ollama', 503, 'ollama_unreachable', 'The local model could not be reached', true, {
      base_url: config.ollamaBaseUrl,
      cause: error.message,
    });
  }

  if (error instanceof Error) {
    return new AiProviderError('ollama', 502, 'ollama_request_failed', 'The local model request failed unexpectedly', true, {
      base_url: config.ollamaBaseUrl,
      cause: error.message,
    });
  }

  return new AiProviderError('ollama', 502, 'ollama_request_failed', 'The local model request failed unexpectedly', true, {
    base_url: config.ollamaBaseUrl,
  });
}
