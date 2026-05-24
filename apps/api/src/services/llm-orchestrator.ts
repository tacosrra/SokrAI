import {
  assertProblemDefinitionTurn,
  assertStructuredBrief,
  schemaDocuments,
  schemaIds,
} from '../contracts/schema-registry';
import type { ProblemDefinitionTurn, StructuredBrief } from '../contracts/types';
import type { AppConfig } from '../config/env';
import { ModelOutputError } from '../utils/errors';
import type { AiCompletionResult, AiProviderName, AiProviderPort } from './ai-provider';
import { loadPrompt, type PromptAsset } from './prompt-service';

function safeJsonParse(input: string): unknown {
  return JSON.parse(input);
}

interface GenerationResult<T> {
  output: T;
  prompt: PromptAsset;
  providerName: AiProviderName;
  modelName: string;
  modelParams: Record<string, unknown>;
  rawOutput: string;
  repairAttempted: boolean;
  metrics: Record<string, unknown>;
}

export class LlmOrchestrator {
  constructor(
    private readonly config: AppConfig,
    private readonly aiProvider: AiProviderPort,
  ) {}

  async extractStructuredBrief(input: {
    projectTitle: string;
    goal: string;
    normalizedText: string;
  }): Promise<GenerationResult<StructuredBrief>> {
    const prompt = await loadPrompt('extract-initial-brief');
    const userPrompt = [
      'Return a structured brief for the following proposal material.',
      '',
      `Output schema id: ${schemaIds.structuredBrief}`,
      '',
      'Input JSON:',
      JSON.stringify(
        {
          project_title: input.projectTitle,
          goal: input.goal,
          normalized_text: input.normalizedText,
        },
        null,
        2,
      ),
    ].join('\n');

    return this.generateWithRepair<StructuredBrief>({
      prompt,
      userPrompt,
      validate: assertStructuredBrief,
      responseSchema: schemaDocuments.structuredBrief,
    });
  }

  async runProblemDefinition(input: {
    structuredBrief: StructuredBrief;
    recentTurns: Array<{ question_text: string; answer_text: string | null; diagnosis: string[] }>;
    latestAnswer?: string;
  }): Promise<GenerationResult<ProblemDefinitionTurn>> {
    const prompt = await loadPrompt('problem-definition-agent');
    const userPrompt = [
      'Return a single bounded problem-definition turn.',
      '',
      `Output schema id: ${schemaIds.problemDefinitionTurn}`,
      '',
      'Input JSON:',
      JSON.stringify(
        {
          structured_brief: input.structuredBrief,
          recent_turns: input.recentTurns,
          latest_user_answer: input.latestAnswer ?? null,
        },
        null,
        2,
      ),
    ].join('\n');

    return this.generateWithRepair<ProblemDefinitionTurn>({
      prompt,
      userPrompt,
      validate: assertProblemDefinitionTurn,
      responseSchema: schemaDocuments.problemDefinitionTurn,
    });
  }

  private async generateWithRepair<T>(params: {
    prompt: PromptAsset;
    userPrompt: string;
    validate: (payload: unknown) => T;
    responseSchema: Record<string, unknown>;
  }): Promise<GenerationResult<T>> {
    const firstAttempt = await this.aiProvider.generate({
      model: this.config.aiModel,
      systemPrompt: params.prompt.content,
      userPrompt: params.userPrompt,
      responseSchema: params.responseSchema,
    });

    try {
      const parsed = safeJsonParse(firstAttempt.content);

      return {
        output: params.validate(parsed),
        prompt: params.prompt,
        providerName: firstAttempt.providerName,
        modelName: firstAttempt.modelName,
        modelParams: firstAttempt.modelParams,
        rawOutput: firstAttempt.content,
        repairAttempted: false,
        metrics: firstAttempt.metrics,
      };
    } catch (error) {
      if (this.config.jsonRepairMaxAttempts < 1) {
        throw new ModelOutputError(
          'invalid_model_json',
          'The model did not return valid JSON',
          firstAttempt.content,
          false,
          {
            cause: error instanceof Error ? error.message : 'unknown',
          },
        );
      }
    }

    const repairPrompt = await loadPrompt('json-repair');
    const repairedAttempt = await this.aiProvider.generate({
      model: this.config.aiModel,
      systemPrompt: repairPrompt.content,
      userPrompt: [
        'Repair the following text into valid JSON that follows the required schema.',
        '',
        params.userPrompt,
        '',
        'Invalid JSON text:',
        firstAttempt.content,
      ].join('\n'),
      responseSchema: params.responseSchema,
    });

    try {
      const repairedJson = safeJsonParse(repairedAttempt.content);

      return {
        output: params.validate(repairedJson),
        prompt: params.prompt,
        providerName: repairedAttempt.providerName,
        modelName: repairedAttempt.modelName,
        modelParams: repairedAttempt.modelParams,
        rawOutput: firstAttempt.content,
        repairAttempted: true,
        metrics: mergeMetrics(firstAttempt, repairedAttempt),
      };
    } catch (error) {
      throw new ModelOutputError(
        'invalid_model_json_after_repair',
        'The model returned invalid JSON and the repair step also failed',
        firstAttempt.content,
        true,
        {
          cause: error instanceof Error ? error.message : 'unknown',
          repaired_output: repairedAttempt.content,
        },
      );
    }
  }
}

function mergeMetrics(
  firstAttempt: AiCompletionResult,
  repairedAttempt: AiCompletionResult,
): Record<string, unknown> {
  return {
    initial: {
      provider_name: firstAttempt.providerName,
      model_name: firstAttempt.modelName,
      latency_ms: firstAttempt.latencyMs,
      ...firstAttempt.metrics,
    },
    repair: {
      provider_name: repairedAttempt.providerName,
      model_name: repairedAttempt.modelName,
      latency_ms: repairedAttempt.latencyMs,
      ...repairedAttempt.metrics,
    },
  };
}
