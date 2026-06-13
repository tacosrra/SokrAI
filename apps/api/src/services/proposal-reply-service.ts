import { assertProposalReplyRequest } from '../contracts/schema-registry';
import { AppError, ensure } from '../utils/errors';
import type { Logger } from '../utils/logger';
import type { AppConfig } from '../config/env';
import type { SessionStore } from '../repositories/session-store';
import type { ReplyContextCommand } from './service-types';

export class ProposalReplyService {
  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
    private readonly sessionStore: SessionStore,
  ) {}

  async execute(command: ReplyContextCommand): Promise<{ session_id: string }> {
    const payload = assertProposalReplyRequest(command.payload);

    ensure(
      payload.answer.trim().length <= this.config.maxReplyChars,
      new AppError(400, 'reply_too_large', 'The reply exceeds the maximum supported length', false, payload.session_id),
    );

    ensure(
      payload.answer.trim().length > 0,
      new AppError(400, 'empty_answer', 'The reply cannot be empty', false, payload.session_id),
    );

    const requestId = command.context.requestId;

    if (requestId) {
      const existingTurn = await this.sessionStore.findTurnByAnswerRequestId(requestId);

      if (existingTurn) {
        return {
          session_id: existingTurn.session_id,
        };
      }
    }

    await this.sessionStore
      .getDatabase()
      .withTransaction(async (client) => {
        const session = await this.sessionStore.getSessionForUpdate(payload.session_id, client);

        if (session.status === 'completed') {
          throw new AppError(409, 'session_completed', 'The session is already completed', false, payload.session_id);
        }

        if (session.status === 'blocked') {
          const unblocked = await this.sessionStore.tryUnblockSessionForUserRetry(client, payload.session_id);

          if (!unblocked) {
            throw new AppError(409, 'session_blocked', 'The session is blocked and requires a manual rerun', true, payload.session_id);
          }
        }

        const updatedTurn = await this.sessionStore.appendUserAnswer(client, {
          sessionId: payload.session_id,
          requestId,
          answer: payload.answer.trim(),
        });

        await this.sessionStore.insertEvent(client, {
          sessionId: payload.session_id,
          turnSeq: updatedTurn.turn_seq,
          eventType: 'answer_received',
          actorType: 'user',
          requestId,
          payloadJson: {
            turn_seq: updatedTurn.turn_seq,
          },
        });

        await this.sessionStore.updateSessionHead(client, {
          sessionId: session.id,
          status: 'active',
          currentTurnSeq: session.current_turn_seq,
          stateVersion: session.state_version,
          latestStructuredBrief: session.latest_structured_brief_json,
          latestProblemDefinition: session.latest_problem_definition_json,
          latestSnapshotId: session.latest_snapshot_id ?? undefined,
          latestSuccessfulRunId: session.latest_successful_run_id ?? undefined,
          completionReason: session.completion_reason ?? undefined,
        });
      });

    this.logger.info('proposal_reply_appended', {
      request_id: requestId,
      session_id: payload.session_id,
    });

    return {
      session_id: payload.session_id,
    };
  }
}
