import type {
  EmbedBatchParams,
  EmbedBatchResult,
  EmbedSingleParams,
  EmbedResult,
  EmbeddingClient,
} from '../../apps/api/src/rag/embedding-client.ts';

export interface FakeEmbeddingClientOptions {
  dimension?: number;
  modelName?: string;
}

/**
 * Embedding fake determinista: convierte el texto en un vector unitario fijado
 * por las primeras posiciones a partir de un hash simple del texto. Vale para
 * tests porque la similitud coseno es estable entre ejecuciones.
 */
export class FakeEmbeddingClient implements EmbeddingClient {
  public readonly calls: { method: 'embed' | 'embedBatch'; texts: string[] }[] = [];
  private readonly dimension: number;
  private readonly modelName: string;
  private readonly preset: Map<string, number[]> = new Map();

  constructor(options: FakeEmbeddingClientOptions = {}) {
    this.dimension = options.dimension ?? 1024;
    this.modelName = options.modelName ?? 'fake-embedder';
  }

  setVectorFor(text: string, vector: number[]): void {
    if (vector.length !== this.dimension) {
      throw new Error(`Preset vector must have length ${this.dimension}, got ${vector.length}`);
    }
    this.preset.set(text, vector);
  }

  async embed(params: EmbedSingleParams): Promise<EmbedResult> {
    this.calls.push({ method: 'embed', texts: [params.text] });
    return {
      vector: this.vectorize(params.text),
      modelName: this.modelName,
      dimension: this.dimension,
      latencyMs: 1,
    };
  }

  async embedBatch(params: EmbedBatchParams): Promise<EmbedBatchResult> {
    this.calls.push({ method: 'embedBatch', texts: [...params.texts] });

    const vectors = params.texts.map((text) => this.vectorize(text));

    return {
      vectors,
      modelName: this.modelName,
      dimension: this.dimension,
      latencyMs: 1,
    };
  }

  private vectorize(text: string): number[] {
    if (this.preset.has(text)) {
      return [...(this.preset.get(text) as number[])];
    }

    const vector = new Array<number>(this.dimension).fill(0);
    const seed = simpleHash(text);

    for (let i = 0; i < this.dimension; i += 1) {
      vector[i] = pseudoRandom(seed + i);
    }

    return normalize(vector);
  }
}

function simpleHash(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pseudoRandom(seed: number): number {
  const s = Math.sin(seed) * 10000;
  return s - Math.floor(s) - 0.5;
}

function normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((acc, value) => acc + value * value, 0));
  if (norm === 0) return vector;
  return vector.map((value) => value / norm);
}
