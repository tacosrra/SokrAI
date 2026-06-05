export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

type Level = 'debug' | 'info' | 'warn' | 'error';

const REDACTED_VALUE = '[REDACTED]';

const sensitiveKeys = new Set([
  'answer',
  'body',
  'contentbase64',
  'databaseurl',
  'documenttext',
  'inputpayloadjson',
  'internalsharedsecret',
  'n8nbasicauthpassword',
  'n8nencryptionkey',
  'normalizedtext',
  'pastedtext',
  'payload',
  'prompt',
  'proposaltext',
  'rawmodeloutput',
  'systemprompt',
  'userprompt',
  'validatedoutputjson',
]);

const levelOrder: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function normalizeKey(key: string): string {
  return key.replace(/[_-]/g, '').toLowerCase();
}

function redactLogValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactLogValue(item, seen));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  seen.add(value);

  const redacted = Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
      key,
      sensitiveKeys.has(normalizeKey(key)) ? REDACTED_VALUE : redactLogValue(nestedValue, seen),
    ]),
  );

  seen.delete(value);
  return redacted;
}

export class JsonLogger implements Logger {
  constructor(private readonly minimumLevel: Level = 'info') {}

  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.log('error', message, data);
  }

  private log(level: Level, message: string, data?: Record<string, unknown>): void {
    if (levelOrder[level] < levelOrder[this.minimumLevel]) {
      return;
    }

    const payload = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...((data ? redactLogValue(data) : {}) as Record<string, unknown>),
    };

    const line = JSON.stringify(payload);

    if (level === 'error') {
      console.error(line);
      return;
    }

    console.log(line);
  }
}
