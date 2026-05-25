import { assertSolutionReplyRequest } from '../contracts/schema-registry';
import { AppError, ensure } from '../utils/errors';
import type { Logger } from '../utils/logger';
import type { AppConfig } from '../config/env';
import type { AlphaStore } from '../repositories/alpha-store';
import type { SessionStore } from '../repositories/session-store';
import type { SolutionReplyContextCommand } from './service-types';

export class SolutionReplyService {
  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
    private readonly sessionStore: SessionStore,
    private readonly alphaStore: AlphaStore,
  ) {}

  async execute(command: SolutionReplyContextCommand): Promise<{ session_id: string }> {
    const payload = assertSolutionReplyRequest(command.payload);

    ensure(
      payload.answer.trim().length <= this.config.maxReplyChars,
      new AppError(400, 'solution_reply_too_large', 'The solution reply exceeds the maximum supported length', false, payload.session_id),
    );

    ensure(
      payload.answer.trim().length > 0,
      new AppError(400, 'empty_solution_answer', 'The solution reply cannot be empty', false, payload.session_id),
    );

    const requestId = command.context.requestId;

    if (requestId) {
      const existingTurn = await this.alphaStore.findChatTurnByAnswerRequestId(requestId);

      if (existingTurn) {
        return {
          session_id: existingTurn.proposal_id,
        };
      }
    }

    await this.sessionStore
      .getDatabase()
      .withTransaction(async (client) => {
        const session = await this.sessionStore.getSessionForUpdate(payload.session_id, client);

        if (session.status === 'blocked' || session.status === 'failed') {
          throw new AppError(409, 'session_blocked', 'The session is blocked and requires a manual rerun', true, payload.session_id);
        }

        const chat = await this.alphaStore.findModuleChatByProposalAndModule(session.id, 'solution', client);

        if (!chat || !chat.active_turn_id) {
          throw new AppError(
            409,
            'no_open_solution_turn',
            'The solution chat is not waiting for a user answer',
            false,
            payload.session_id,
          );
        }

        const activeTurn = chat.turns.find((turn) => turn.turn_id === chat.active_turn_id);

        if (!activeTurn || activeTurn.turn_status !== 'awaiting_user') {
          throw new AppError(
            409,
            'solution_turn_not_waiting',
            'The active solution turn is not waiting for a user answer',
            false,
            payload.session_id,
          );
        }

        const updatedTurn = await this.alphaStore.updateChatTurnAnswer(client, {
          turnId: activeTurn.turn_id,
          answerText: payload.answer.trim(),
          answerRequestId: requestId,
        });

        await this.alphaStore.appendAuditEvent(client, {
          proposalId: session.id,
          sessionId: session.id,
          turnId: updatedTurn.turn_id,
          eventType: 'solution_answer_received',
          actorType: 'user',
          requestId,
          payloadJson: {
            turn_seq: updatedTurn.turn_seq,
          },
        });
      });

    this.logger.info('solution_reply_appended', {
      request_id: requestId,
      session_id: payload.session_id,
    });

    return {
      session_id: payload.session_id,
    };
  }
}
