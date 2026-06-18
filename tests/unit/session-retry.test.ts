import { describe, expect, it } from 'vitest';

import { shouldRevertReplyFailureForUserRetry } from '../../apps/api/src/domain/session-retry';
import { AppError } from '../../apps/api/src/utils/errors';

describe('shouldRevertReplyFailureForUserRetry', () => {
  it('reopens reply failures except terminal turn limits', () => {
    expect(
      shouldRevertReplyFailureForUserRetry(
        'reply',
        new AppError(504, 'ollama_timeout', 'timeout', true),
      ),
    ).toBe(true);

    expect(
      shouldRevertReplyFailureForUserRetry(
        'reply',
        new AppError(409, 'maximum_turns_reached', 'limit', false),
      ),
    ).toBe(false);
  });

  it('does not reopen start failures', () => {
    expect(
      shouldRevertReplyFailureForUserRetry(
        'start',
        new AppError(504, 'ollama_timeout', 'timeout', true),
      ),
    ).toBe(false);
  });

  it('does not reopen non-retryable reply failures', () => {
    expect(
      shouldRevertReplyFailureForUserRetry(
        'reply',
        new AppError(502, 'model_output_invalid', 'invalid output', false),
      ),
    ).toBe(false);
  });
});
