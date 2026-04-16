export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly errorCode: string,
    public readonly safeMessage: string,
    public readonly retryable = false,
    public readonly sessionId?: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(safeMessage);
    this.name = 'AppError';
  }
}

export class ModelOutputError extends AppError {
  constructor(
    errorCode: string,
    safeMessage: string,
    public readonly rawOutput: string,
    public readonly repairAttempted: boolean,
    details?: Record<string, unknown>,
  ) {
    super(502, errorCode, safeMessage, false, undefined, details);
    this.name = 'ModelOutputError';
  }
}

export function ensure(condition: unknown, error: AppError): asserts condition {
  if (!condition) {
    throw error;
  }
}
