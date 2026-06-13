import type { AppError } from '../utils/errors';

const TERMINAL_REPLY_FAILURE_CODES = new Set(['maximum_turns_reached']);

export function shouldRevertReplyFailureForUserRetry(
  trigger: 'start' | 'reply',
  error: AppError,
): boolean {
  return trigger === 'reply' && !TERMINAL_REPLY_FAILURE_CODES.has(error.errorCode);
}
