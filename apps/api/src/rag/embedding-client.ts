import type { AppConfig } from '../config/env';
import { RagError } from './errors';

export interface EmbedSingleParams {
  text: string;
  model?: string;
}

export interface EmbedBatchParams {
  texts: string[];
  model?: string;
}

export interface EmbedResult {
  vector: number[];
  modelName: string;
  dimension: number;
  latencyMs: number;
}

export interface EmbedBatchResult {
  vectors: number[][];
  modelName: string;
  dimension: number;
  latencyMs: number;
}

export interface EmbeddingClient {
  embed(params: EmbedSingleParams): Promise<EmbedResult>;
  embedBatch(params: EmbedBatchParams): Promise<EmbedBatchResult>;
}

export class OllamaEmbeddingClient implements EmbeddingClient {
  constructor(private readonly config: AppConfig) {}

  async embed(params: EmbedSingleParams): Promise<EmbedResult> {
    const batch = await this.embedBatch({
      texts: [params.text],
      model: params.model,
    });

    return {
      vector: batch.vectors[0],
      modelName: batch.modelName,
      dimension: batch.dimension,
      latencyMs: batch.latencyMs,
    };
  }

  async embedBatch(params: EmbedBatchParams): Promise<EmbedBatchResult> {
    if (params.texts.length === 0) {
      throw new RagError(400, 'embed_empty_batch', 'Cannot embed an empty batch of texts');
    }

    const model = params.model ?? this.config.embeddingModel;
    const start = Date.now();

    let response: Response;

    try {
      response = await fetch(`${this.config.ollamaBaseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          input: params.texts,
        }),
        signal: AbortSignal.timeout(this.config.embeddingTimeoutMs),
      });
    } catch (error) {
      throw new RagError(
        502,
        'embedding_request_failed',
        'The embedding request to Ollama failed',
        {
          cause: error instanceof Error ? error.message : 'unknown',
          model,
        },
      );
    }

    if (!response.ok) {
      const body = await response.text();
      throw new RagError(
        502,
        'embedding_request_failed',
        'The embedding service returned a non-success response',
        {
          status: response.status,
          body,
          model,
        },
      );
    }

    const payload = (await response.json()) as {
      embeddings?: number[][];
      model?: string;
    };

    if (!Array.isArray(payload.embeddings) || payload.embeddings.length !== params.texts.length) {
      throw new RagError(
        502,
        'embedding_response_invalid',
        'The embedding service returned an unexpected payload shape',
        {
          expected: params.texts.length,
          received: Array.isArray(payload.embeddings) ? payload.embeddings.length : 0,
          model,
        },
      );
    }

    const dimension = payload.embeddings[0].length;

    if (dimension !== this.config.embeddingDimension) {
      throw new RagError(
        500,
        'embedding_dimension_mismatch',
        'The embedding dimension returned by the model does not match the configured dimension',
        {
          configured: this.config.embeddingDimension,
          received: dimension,
          model,
        },
      );
    }

    return {
      vectors: payload.embeddings,
      modelName: payload.model ?? model,
      dimension,
      latencyMs: Date.now() - start,
    };
  }
}
