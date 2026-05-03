import { AppError } from '../utils/errors';

export class RagError extends AppError {
  constructor(
    statusCode: number,
    errorCode: string,
    safeMessage: string,
    details?: Record<string, unknown>,
  ) {
    super(statusCode, errorCode, safeMessage, false, undefined, details);
    this.name = 'RagError';
  }
}
