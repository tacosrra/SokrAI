import {
  assertDataAiPrivacyTurn,
  assertProblemDefinitionTurn,
  assertSolutionDefinitionTurn,
  assertStructuredBrief,
  schemaDocuments,
  schemaIds,
} from '../contracts/schema-registry';
import type {
  DataAiPrivacyTurn,
  GeneratedSection,
  ProblemDefinitionTurn,
  RegulatoryProfile,
  SolutionDefinitionTurn,
  StructuredBrief,
} from '../contracts/types';
import type { AppConfig } from '../config/env';
import { AppError, ModelOutputError } from '../utils/errors';
import type { AiCompletionResult, AiProviderName, AiProviderPort } from './ai-provider';
import { loadPrompt, type PromptAsset } from './prompt-service';

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

  async runSolutionDefinition(input: {
    structuredBrief: StructuredBrief;
    problemSection: Pick<GeneratedSection, 'title' | 'content_markdown' | 'source_refs'>;
    recentTurns: Array<{ question_text: string; answer_text: string | null; diagnosis: string[] }>;
    latestAnswer?: string;
  }): Promise<GenerationResult<SolutionDefinitionTurn>> {
    const prompt = await loadPrompt('solution-definition-agent');
    const userPrompt = [
      'Return a single bounded solution-definition turn.',
      '',
      `Output schema id: ${schemaIds.solutionDefinitionTurn}`,
      '',
      'Input JSON:',
      JSON.stringify(
        {
          structured_brief: input.structuredBrief,
          problem_section: {
            title: input.problemSection.title,
            content_markdown: input.problemSection.content_markdown,
            source_refs: input.problemSection.source_refs.map((source) => source.source_id),
          },
          recent_turns: input.recentTurns,
          latest_user_answer: input.latestAnswer ?? null,
        },
        null,
        2,
      ),
    ].join('\n');

    return this.generateWithRepair<SolutionDefinitionTurn>({
      prompt,
      userPrompt,
      validate: assertSolutionDefinitionTurn,
      responseSchema: schemaDocuments.solutionDefinitionTurn,
    });
  }

  async runDataAiPrivacyGap(input: {
    structuredBrief: StructuredBrief;
    problemSection: Pick<GeneratedSection, 'title' | 'content_markdown' | 'source_refs'>;
    solutionSection: Pick<GeneratedSection, 'title' | 'content_markdown' | 'source_refs'>;
    regulatoryProfile: RegulatoryProfile;
    recentTurns: Array<{ question_text: string; answer_text: string | null; diagnosis: string[] }>;
    latestAnswer?: string;
  }): Promise<GenerationResult<DataAiPrivacyTurn>> {
    const prompt = await loadPrompt('data-ai-privacy-gap-agent');
    const userPrompt = [
      'Return a single bounded data/AI/privacy gap turn.',
      '',
      `Output schema id: ${schemaIds.dataAiPrivacyTurn}`,
      '',
      'Input JSON:',
      JSON.stringify(
        {
          structured_brief: input.structuredBrief,
          problem_section: {
            title: input.problemSection.title,
            content_markdown: input.problemSection.content_markdown,
            source_refs: input.problemSection.source_refs.map((source) => source.source_id),
          },
          solution_section: {
            title: input.solutionSection.title,
            content_markdown: input.solutionSection.content_markdown,
            source_refs: input.solutionSection.source_refs.map((source) => source.source_id),
          },
          regulatory_profile: input.regulatoryProfile,
          recent_turns: input.recentTurns,
          latest_user_answer: input.latestAnswer ?? null,
        },
        null,
        2,
      ),
    ].join('\n');

    return this.generateWithRepair<DataAiPrivacyTurn>({
      prompt,
      userPrompt,
      validate: assertDataAiPrivacyTurn,
      responseSchema: schemaDocuments.dataAiPrivacyTurn,
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
      const parsed = parseModelJson(firstAttempt.content, firstAttempt.content, false);
      const output = validateModelOutput(parsed, params.validate, firstAttempt.content, false);

      return {
        output,
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
        throw error;
      }

      if (!(error instanceof ModelOutputError)) {
        throw error;
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

    const repairedJson = parseModelJson(repairedAttempt.content, firstAttempt.content, true, {
      repaired_output: repairedAttempt.content,
    });
    const output = validateModelOutput(
      repairedJson,
      params.validate,
      firstAttempt.content,
      true,
      {
        repaired_output: repairedAttempt.content,
      },
    );

    return {
      output,
      prompt: params.prompt,
      providerName: repairedAttempt.providerName,
      modelName: repairedAttempt.modelName,
      modelParams: repairedAttempt.modelParams,
      rawOutput: firstAttempt.content,
      repairAttempted: true,
      metrics: mergeMetrics(firstAttempt, repairedAttempt),
    };
  }
}

function parseModelJson(
  content: string,
  rawOutput: string,
  repairAttempted: boolean,
  details?: Record<string, unknown>,
): unknown {
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new ModelOutputError(
      repairAttempted ? 'invalid_model_json_after_repair' : 'invalid_model_json',
      repairAttempted
        ? 'The model returned invalid JSON and the repair step also failed'
        : 'The model did not return valid JSON',
      rawOutput,
      repairAttempted,
      {
        cause: error instanceof Error ? error.message : 'unknown',
        ...(details ?? {}),
      },
    );
  }
}

function validateModelOutput<T>(
  payload: unknown,
  validate: (payload: unknown) => T,
  rawOutput: string,
  repairAttempted: boolean,
  details?: Record<string, unknown>,
): T {
  try {
    return validate(payload);
  } catch (error) {
    if (error instanceof AppError) {
      throw new ModelOutputError(
        error.errorCode,
        repairAttempted
          ? 'The model returned JSON that does not match the required schema after repair'
          : 'The model returned JSON that does not match the required schema',
        rawOutput,
        repairAttempted,
        {
          cause: error.safeMessage,
          ...(error.details ?? {}),
          ...(details ?? {}),
        },
      );
    }

    throw error;
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
