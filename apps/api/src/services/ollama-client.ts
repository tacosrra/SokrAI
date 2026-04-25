import type { AppConfig } from '../config/env';
import { AppError } from '../utils/errors';

export interface ModelCompletionResult {
  content: string;
  modelName: string;
  latencyMs: number;
  metrics: Record<string, unknown>;
}

export interface ModelGenerationParams {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  responseSchema?: Record<string, unknown>;
}

export interface LanguageModelClient {
  generate(params: ModelGenerationParams): Promise<ModelCompletionResult>;
}

interface OllamaChatPayload {
  model?: string;
  message?: { content?: string };
  total_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaClient implements LanguageModelClient {
  constructor(private readonly config: AppConfig) {}

  async generate(params: ModelGenerationParams): Promise<ModelCompletionResult> {
    const start = Date.now();
    let response: Response;

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
          options: {
            temperature: 0.2,
            num_ctx: this.config.ollamaNumCtx,
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
      modelName: payload.model ?? params.model,
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
    return new AppError(504, 'ollama_timeout', 'The local model exceeded the configured timeout', true, undefined, {
      base_url: config.ollamaBaseUrl,
      timeout_ms: config.ollamaTimeoutMs,
    });
  }

  if (error instanceof TypeError) {
    return new AppError(503, 'ollama_unreachable', 'The local model could not be reached', true, undefined, {
      base_url: config.ollamaBaseUrl,
      cause: error.message,
    });
  }

  if (error instanceof Error) {
    return new AppError(502, 'ollama_request_failed', 'The local model request failed unexpectedly', true, undefined, {
      base_url: config.ollamaBaseUrl,
      cause: error.message,
    });
  }

  return new AppError(502, 'ollama_request_failed', 'The local model request failed unexpectedly', true, undefined, {
    base_url: config.ollamaBaseUrl,
  });
}
