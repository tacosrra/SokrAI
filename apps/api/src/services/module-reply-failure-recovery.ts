import type { PoolClient } from 'pg';

import type { AlphaModule, ChatTurn } from '../contracts/types';
import { shouldRevertReplyFailureForUserRetry } from '../domain/session-retry';
import type { AlphaStore } from '../repositories/alpha-store';
import type { AppError } from '../utils/errors';

export async function revertModuleReplyFailureForUserRetry(
  client: PoolClient,
  alphaStore: AlphaStore,
  params: {
    proposalId: string;
    module: AlphaModule;
    activeTurn: ChatTurn | null;
    trigger: 'start' | 'reply';
    error: AppError;
    runId: string;
    requestId: string;
    retryAuditEventType: string;
    failureAuditEventType: string;
  },
): Promise<boolean> {
  if (!params.activeTurn || !shouldRevertReplyFailureForUserRetry(params.trigger, params.error)) {
    return false;
  }

  const revertedTurn = await alphaStore.revertChatTurnForUserRetry(client, {
    turnId: params.activeTurn.turn_id,
  });

  if (!revertedTurn) {
    return false;
  }

  const chat = await alphaStore.findModuleChatByProposalAndModule(
    params.proposalId,
    params.module,
    client,
  );

  if (!chat) {
    return false;
  }

  await alphaStore.updateModuleChatStatus(client, {
    chatId: chat.chat_id,
    chatStatus: 'waiting_for_user',
    activeTurnId: revertedTurn.turn_id,
  });

  await alphaStore.appendAuditEvent(client, {
    proposalId: params.proposalId,
    sessionId: params.proposalId,
    runId: params.runId,
    turnId: revertedTurn.turn_id,
    eventType: params.retryAuditEventType,
    actorType: 'system',
    requestId: params.requestId,
    payloadJson: {
      error_code: params.error.errorCode,
      reason: params.error.safeMessage,
      turn_seq: revertedTurn.turn_seq,
      replaced_failure_event: params.failureAuditEventType,
    },
  });

  return true;
}
