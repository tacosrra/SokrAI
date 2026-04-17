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

export class OllamaClient implements LanguageModelClient {
  constructor(private readonly config: AppConfig) {}

  async generate(params: ModelGenerationParams): Promise<ModelCompletionResult> {
    const start = Date.now();
    const response = await fetch(`${this.config.ollamaBaseUrl}/api/chat`, {
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

    if (!response.ok) {
      const text = await response.text();
      throw new AppError(502, 'ollama_request_failed', 'The local model did not return a successful response', true, undefined, {
        status: response.status,
        body: text,
      });
    }

    const payload = (await response.json()) as {
      model?: string;
      message?: { content?: string };
      total_duration?: number;
      prompt_eval_count?: number;
      eval_count?: number;
    };

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
