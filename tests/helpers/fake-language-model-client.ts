import type {
  AiCompletionResult,
  AiGenerationParams,
  AiProviderPort,
} from '../../apps/api/src/services/ai-provider.ts';

type QueueItem =
  | string
  | Error
  | {
      content: string;
      modelName?: string;
      modelParams?: Record<string, unknown>;
      metrics?: Record<string, unknown>;
    };

export class QueueLanguageModelClient implements AiProviderPort {
  readonly providerName = 'ollama';

  private readonly items: QueueItem[];
  public readonly calls: AiGenerationParams[] = [];

  constructor(items: QueueItem[]) {
    this.items = [...items];
  }

  async generate(params: AiGenerationParams): Promise<AiCompletionResult> {
    this.calls.push(params);

    const next = this.items.shift();

    if (!next) {
      throw new Error('QueueLanguageModelClient ran out of queued responses');
    }

    if (next instanceof Error) {
      throw next;
    }

    if (typeof next === 'string') {
      return {
        content: next,
        providerName: this.providerName,
        modelName: 'fake-model',
        modelParams: {},
        latencyMs: 1,
        metrics: {},
      };
    }

    return {
      content: next.content,
      providerName: this.providerName,
      modelName: next.modelName ?? 'fake-model',
      modelParams: next.modelParams ?? {},
      latencyMs: 1,
      metrics: next.metrics ?? {},
    };
  }
}
