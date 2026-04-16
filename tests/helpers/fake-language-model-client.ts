import type {
  LanguageModelClient,
  ModelCompletionResult,
} from '../../apps/api/src/services/ollama-client.ts';

type QueueItem =
  | string
  | {
      content: string;
      modelName?: string;
      metrics?: Record<string, unknown>;
    };

export class QueueLanguageModelClient implements LanguageModelClient {
  private readonly items: QueueItem[];
  public readonly calls: Array<{ model: string; systemPrompt: string; userPrompt: string }> = [];

  constructor(items: QueueItem[]) {
    this.items = [...items];
  }

  async generate(params: {
    model: string;
    systemPrompt: string;
    userPrompt: string;
  }): Promise<ModelCompletionResult> {
    this.calls.push(params);

    const next = this.items.shift();

    if (!next) {
      throw new Error('QueueLanguageModelClient ran out of queued responses');
    }

    if (typeof next === 'string') {
      return {
        content: next,
        modelName: 'fake-model',
        latencyMs: 1,
        metrics: {},
      };
    }

    return {
      content: next.content,
      modelName: next.modelName ?? 'fake-model',
      latencyMs: 1,
      metrics: next.metrics ?? {},
    };
  }
}
