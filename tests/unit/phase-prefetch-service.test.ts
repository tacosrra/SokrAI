import { describe, expect, it, vi } from 'vitest';

import type { AlphaModule, ChatStatus, ModuleChat } from '../../apps/api/src/contracts/types';
import { PhasePrefetchService } from '../../apps/api/src/services/phase-prefetch-service';
import type { Logger } from '../../apps/api/src/utils/logger';

function moduleChat(module: AlphaModule, chatStatus: ChatStatus): ModuleChat {
  return {
    chat_id: `chat-${module}`,
    proposal_id: 'session-1',
    module,
    chat_status: chatStatus,
    active_turn_id: undefined,
    turns: [],
    started_at: '2026-06-17T10:00:00.000Z',
    completed_at: chatStatus === 'completed' ? '2026-06-17T10:01:00.000Z' : undefined,
    warnings: [],
  };
}

function logger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe('PhasePrefetchService', () => {
  it('primes the next phase as preparing before the background model call finishes', async () => {
    const chats = new Map<AlphaModule, ModuleChat>();
    const createdChats: Array<{ module: AlphaModule; chatStatus: ChatStatus }> = [];
    let resolveSolution!: (value: { agent_status: 'continue' }) => void;
    const solutionStarted = new Promise<{ agent_status: 'continue' }>((resolve) => {
      resolveSolution = resolve;
    });
    const store = {
      getDatabase: vi.fn(() => ({ query: vi.fn() })),
      findModuleChatByProposalAndModule: vi.fn(async (_sessionId: string, module: AlphaModule) =>
        chats.get(module) ?? null,
      ),
      createModuleChat: vi.fn(async (_executor: unknown, params: {
        proposalId: string;
        module: AlphaModule;
        chatStatus: ChatStatus;
        warnings?: string[];
      }) => {
        const chat = moduleChat(params.module, params.chatStatus);
        chats.set(params.module, chat);
        createdChats.push({ module: params.module, chatStatus: params.chatStatus });
        return chat;
      }),
    };
    const solution = {
      execute: vi.fn(() => solutionStarted),
    };
    const service = new PhasePrefetchService(logger(), store, {
      solution,
      dataAiPrivacy: { execute: vi.fn() },
      medicalDeviceTriage: { execute: vi.fn() },
      resourcesPilotViability: { execute: vi.fn() },
    });

    await service.enqueueAfterCompletedModule({
      sessionId: 'session-1',
      completedModule: 'problem',
    });

    expect(createdChats).toEqual([
      { module: 'solution', chatStatus: 'preparing' },
    ]);
    expect(solution.execute).toHaveBeenCalledOnce();

    resolveSolution({ agent_status: 'continue' });
    await solutionStarted;
  });

  it('creates preparing chats and chains while prefetched phases complete without questions', async () => {
    const chats = new Map<AlphaModule, ModuleChat>();
    const createdChats: Array<{ module: AlphaModule; chatStatus: ChatStatus }> = [];
    const store = {
      getDatabase: vi.fn(() => ({ query: vi.fn() })),
      findModuleChatByProposalAndModule: vi.fn(async (_sessionId: string, module: AlphaModule) =>
        chats.get(module) ?? null,
      ),
      createModuleChat: vi.fn(async (_executor: unknown, params: {
        proposalId: string;
        module: AlphaModule;
        chatStatus: ChatStatus;
        warnings?: string[];
      }) => {
        const chat = moduleChat(params.module, params.chatStatus);
        chats.set(params.module, chat);
        createdChats.push({ module: params.module, chatStatus: params.chatStatus });
        return chat;
      }),
    };
    const solution = {
      execute: vi.fn(async () => {
        chats.set('solution', moduleChat('solution', 'completed'));
        return { agent_status: 'done' as const };
      }),
    };
    const dataAiPrivacy = {
      execute: vi.fn(async () => {
        chats.set('data_ai_privacy', moduleChat('data_ai_privacy', 'waiting_for_user'));
        return { agent_status: 'continue' as const };
      }),
    };
    const medicalDeviceTriage = { execute: vi.fn() };
    const resourcesPilotViability = { execute: vi.fn() };
    const service = new PhasePrefetchService(logger(), store, {
      solution,
      dataAiPrivacy,
      medicalDeviceTriage,
      resourcesPilotViability,
    });

    const summary = await service.runAfterCompletedModule({
      sessionId: 'session-1',
      completedModule: 'problem',
      maxSteps: 3,
    });

    expect(createdChats).toEqual([
      { module: 'solution', chatStatus: 'preparing' },
      { module: 'data_ai_privacy', chatStatus: 'preparing' },
    ]);
    expect(summary.startedModules).toEqual(['solution', 'data_ai_privacy']);
    expect(solution.execute).toHaveBeenCalledOnce();
    expect(dataAiPrivacy.execute).toHaveBeenCalledOnce();
    expect(medicalDeviceTriage.execute).not.toHaveBeenCalled();
    expect(resourcesPilotViability.execute).not.toHaveBeenCalled();
  });

  it('does not start a phase that already has a user-facing chat state', async () => {
    const store = {
      getDatabase: vi.fn(() => ({ query: vi.fn() })),
      findModuleChatByProposalAndModule: vi.fn(async () =>
        moduleChat('solution', 'waiting_for_user'),
      ),
      createModuleChat: vi.fn(),
    };
    const solution = { execute: vi.fn() };
    const service = new PhasePrefetchService(logger(), store, {
      solution,
      dataAiPrivacy: { execute: vi.fn() },
      medicalDeviceTriage: { execute: vi.fn() },
      resourcesPilotViability: { execute: vi.fn() },
    });

    const summary = await service.runAfterCompletedModule({
      sessionId: 'session-1',
      completedModule: 'problem',
      maxSteps: 3,
    });

    expect(summary.startedModules).toEqual([]);
    expect(summary.stoppedReason).toBe('existing_incomplete_chat');
    expect(store.createModuleChat).not.toHaveBeenCalled();
    expect(solution.execute).not.toHaveBeenCalled();
  });
});
