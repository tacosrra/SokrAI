import type { AlphaModule, ChatStatus, ModuleChat } from '../contracts/types';
import type { SqlExecutor } from '../repositories/database';
import type { Logger } from '../utils/logger';
import { DATA_AI_PRIVACY_REVIEW_WARNING } from '../domain/data-ai-privacy';
import { MEDICAL_DEVICE_TRIAGE_REVIEW_WARNING } from '../domain/medical-device-triage';
import { RESOURCES_PILOT_VIABILITY_WARNING } from '../domain/resources-pilot-viability';
import type {
  RunDataAiPrivacyCommand,
  RunMedicalDeviceTriageCommand,
  RunResourcesPilotViabilityCommand,
  RunSolutionDefinitionCommand,
} from './service-types';

type PrefetchTargetModule = Exclude<AlphaModule, 'problem'>;
type AgentStatus = 'continue' | 'done' | 'blocked';
type PrefetchStopReason =
  | 'no_next_phase'
  | 'needs_user_input'
  | 'blocked'
  | 'existing_incomplete_chat'
  | 'existing_preparing_chat'
  | 'failed'
  | 'max_steps_reached';

interface PrefetchAlphaStore {
  getDatabase(): SqlExecutor;
  findModuleChatByProposalAndModule(
    proposalId: string,
    module: AlphaModule,
    executor?: SqlExecutor,
  ): Promise<ModuleChat | null>;
  createModuleChat(
    executor: SqlExecutor,
    params: {
      proposalId: string;
      module: AlphaModule;
      chatStatus: ChatStatus;
      activeTurnId?: string;
      warnings?: string[];
    },
  ): Promise<ModuleChat>;
  updateModuleChatStatus?(
    executor: SqlExecutor,
    params: { chatId: string; chatStatus: ChatStatus; activeTurnId?: string | null },
  ): Promise<ModuleChat>;
}

interface PrefetchResponse {
  agent_status: AgentStatus;
}

interface PhasePrefetchStarters {
  solution: {
    execute(command: RunSolutionDefinitionCommand): Promise<PrefetchResponse>;
  };
  dataAiPrivacy: {
    execute(command: RunDataAiPrivacyCommand): Promise<PrefetchResponse>;
  };
  medicalDeviceTriage: {
    execute(command: RunMedicalDeviceTriageCommand): Promise<PrefetchResponse>;
  };
  resourcesPilotViability: {
    execute(command: RunResourcesPilotViabilityCommand): Promise<PrefetchResponse>;
  };
}

export interface PhasePrefetchSummary {
  startedModules: PrefetchTargetModule[];
  stoppedReason: PrefetchStopReason;
}

const PHASE_ORDER: AlphaModule[] = [
  'problem',
  'solution',
  'data_ai_privacy',
  'medical_device_triage',
  'resources_pilot_viability',
];

const DEFAULT_MAX_PREFETCH_STEPS = 4;

const MODULE_WARNINGS: Partial<Record<PrefetchTargetModule, string[]>> = {
  data_ai_privacy: [DATA_AI_PRIVACY_REVIEW_WARNING],
  medical_device_triage: [MEDICAL_DEVICE_TRIAGE_REVIEW_WARNING],
  resources_pilot_viability: [RESOURCES_PILOT_VIABILITY_WARNING],
};

const WORKFLOW_VERSION_BY_MODULE: Record<PrefetchTargetModule, string> = {
  solution: 'phase_prefetch_solution_v1',
  data_ai_privacy: 'phase_prefetch_data_ai_privacy_v1',
  medical_device_triage: 'phase_prefetch_medical_device_triage_v1',
  resources_pilot_viability: 'phase_prefetch_resources_pilot_viability_v1',
};

export class PhasePrefetchService {
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly logger: Logger,
    private readonly alphaStore: PrefetchAlphaStore,
    private readonly starters: PhasePrefetchStarters,
  ) {}

  async enqueueAfterCompletedModule(params: {
    sessionId: string;
    completedModule: AlphaModule;
    maxSteps?: number;
  }): Promise<void> {
    const key = `${params.sessionId}:${params.completedModule}`;

    if (this.inFlight.has(key)) {
      return;
    }

    const targetModule = nextPrefetchModule(params.completedModule);

    if (!targetModule) {
      return;
    }

    let preparation:
      | { kind: 'already_completed' }
      | { kind: 'prepared'; chat: ModuleChat }
      | { kind: 'stopped'; reason: PrefetchStopReason };

    try {
      preparation = await this.prepareModule(params.sessionId, targetModule);
    } catch (error) {
      this.logger.warn('phase_prefetch_prepare_failed', {
        session_id: params.sessionId,
        completed_module: params.completedModule,
        error_message: error instanceof Error ? error.message : 'unknown',
      });
      return;
    }

    if (preparation.kind === 'stopped') {
      return;
    }

    this.inFlight.add(key);

    const task = preparation.kind === 'already_completed'
      ? this.runAfterCompletedModule({
          ...params,
          completedModule: targetModule,
          maxSteps: Math.max((params.maxSteps ?? DEFAULT_MAX_PREFETCH_STEPS) - 1, 0),
        })
      : this.runPreparedChain({
          sessionId: params.sessionId,
          targetModule,
          chat: preparation.chat,
          maxSteps: params.maxSteps ?? DEFAULT_MAX_PREFETCH_STEPS,
        });

    void task
      .catch((error) => {
        this.logger.warn('phase_prefetch_unhandled_failure', {
          session_id: params.sessionId,
          completed_module: params.completedModule,
          error_message: error instanceof Error ? error.message : 'unknown',
        });
      })
      .finally(() => {
        this.inFlight.delete(key);
      });
  }

  async runAfterCompletedModule(params: {
    sessionId: string;
    completedModule: AlphaModule;
    maxSteps?: number;
  }): Promise<PhasePrefetchSummary> {
    const startedModules: PrefetchTargetModule[] = [];
    const maxSteps = params.maxSteps ?? DEFAULT_MAX_PREFETCH_STEPS;
    let cursor: AlphaModule = params.completedModule;

    for (let step = 0; step < maxSteps; step += 1) {
      const targetModule = nextPrefetchModule(cursor);

      if (!targetModule) {
        return { startedModules, stoppedReason: 'no_next_phase' };
      }

      const result = await this.prefetchModule(params.sessionId, targetModule);

      if (result.kind === 'already_completed') {
        cursor = targetModule;
        continue;
      }

      if (result.kind !== 'started') {
        return { startedModules, stoppedReason: result.reason };
      }

      startedModules.push(targetModule);

      if (result.agentStatus === 'done') {
        cursor = targetModule;
        continue;
      }

      if (result.agentStatus === 'blocked') {
        return { startedModules, stoppedReason: 'blocked' };
      }

      return { startedModules, stoppedReason: 'needs_user_input' };
    }

    return { startedModules, stoppedReason: 'max_steps_reached' };
  }

  private async prefetchModule(
    sessionId: string,
    module: PrefetchTargetModule,
  ): Promise<
    | { kind: 'already_completed' }
    | { kind: 'started'; agentStatus: AgentStatus }
    | { kind: 'stopped'; reason: PrefetchStopReason }
  > {
    const preparation = await this.prepareModule(sessionId, module);

    if (preparation.kind === 'already_completed') {
      return { kind: 'already_completed' };
    }

    if (preparation.kind === 'stopped') {
      return preparation;
    }

    const response = await this.executePreparedModule(sessionId, module, preparation.chat);

    if (!response) {
      return { kind: 'stopped', reason: 'failed' };
    }

    return {
      kind: 'started',
      agentStatus: response.agent_status,
    };
  }

  private async prepareModule(
    sessionId: string,
    module: PrefetchTargetModule,
  ): Promise<
    | { kind: 'already_completed' }
    | { kind: 'prepared'; chat: ModuleChat }
    | { kind: 'stopped'; reason: PrefetchStopReason }
  > {
    const existing = await this.alphaStore.findModuleChatByProposalAndModule(sessionId, module);

    if (existing?.chat_status === 'completed') {
      return { kind: 'already_completed' };
    }

    if (existing?.chat_status === 'preparing') {
      return { kind: 'stopped', reason: 'existing_preparing_chat' };
    }

    if (existing) {
      return { kind: 'stopped', reason: 'existing_incomplete_chat' };
    }

    const chat = await this.alphaStore.createModuleChat(this.alphaStore.getDatabase(), {
      proposalId: sessionId,
      module,
      chatStatus: 'preparing',
      warnings: MODULE_WARNINGS[module] ?? [],
    });

    return { kind: 'prepared', chat };
  }

  private async runPreparedChain(params: {
    sessionId: string;
    targetModule: PrefetchTargetModule;
    chat: ModuleChat;
    maxSteps: number;
  }): Promise<PhasePrefetchSummary> {
    if (params.maxSteps <= 0) {
      return { startedModules: [], stoppedReason: 'max_steps_reached' };
    }

    const response = await this.executePreparedModule(params.sessionId, params.targetModule, params.chat);

    if (!response) {
      return { startedModules: [], stoppedReason: 'failed' };
    }

    if (response.agent_status === 'blocked') {
      return { startedModules: [params.targetModule], stoppedReason: 'blocked' };
    }

    if (response.agent_status === 'continue') {
      return { startedModules: [params.targetModule], stoppedReason: 'needs_user_input' };
    }

    const rest = await this.runAfterCompletedModule({
      sessionId: params.sessionId,
      completedModule: params.targetModule,
      maxSteps: params.maxSteps - 1,
    });

    return {
      startedModules: [params.targetModule, ...rest.startedModules],
      stoppedReason: rest.stoppedReason,
    };
  }

  private async executePreparedModule(
    sessionId: string,
    module: PrefetchTargetModule,
    chat: ModuleChat,
  ): Promise<PrefetchResponse | null> {
    try {
      const response = await this.executeStart(sessionId, module);

      this.logger.info('phase_prefetch_started', {
        session_id: sessionId,
        module,
        agent_status: response.agent_status,
      });

      return response;
    } catch (error) {
      await this.markChatFailed(chat);

      this.logger.warn('phase_prefetch_failed', {
        session_id: sessionId,
        module,
        error_message: error instanceof Error ? error.message : 'unknown',
      });

      return null;
    }
  }

  private executeStart(sessionId: string, module: PrefetchTargetModule): Promise<PrefetchResponse> {
    const context = {
      requestId: `phase-prefetch:${sessionId}:${module}:${Date.now()}`,
      workflowVersion: WORKFLOW_VERSION_BY_MODULE[module],
    };

    switch (module) {
      case 'solution':
        return this.starters.solution.execute({
          context,
          sessionId,
          trigger: 'start',
        });
      case 'data_ai_privacy':
        return this.starters.dataAiPrivacy.execute({
          context,
          sessionId,
          trigger: 'start',
        });
      case 'medical_device_triage':
        return this.starters.medicalDeviceTriage.execute({
          context,
          sessionId,
          trigger: 'start',
        });
      case 'resources_pilot_viability':
        return this.starters.resourcesPilotViability.execute({
          context,
          sessionId,
          trigger: 'start',
        });
    }
  }

  private async markChatFailed(chat: ModuleChat): Promise<void> {
    if (!this.alphaStore.updateModuleChatStatus) {
      return;
    }

    await this.alphaStore.updateModuleChatStatus(this.alphaStore.getDatabase(), {
      chatId: chat.chat_id,
      chatStatus: 'failed',
      activeTurnId: null,
    });
  }
}

function nextPrefetchModule(module: AlphaModule): PrefetchTargetModule | null {
  const currentIndex = PHASE_ORDER.indexOf(module);
  const nextModule = PHASE_ORDER[currentIndex + 1];

  return nextModule && nextModule !== 'problem'
    ? nextModule
    : null;
}
