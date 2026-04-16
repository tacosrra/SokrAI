export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

type Level = 'debug' | 'info' | 'warn' | 'error';

const levelOrder: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

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
      ...(data ?? {}),
    };

    const line = JSON.stringify(payload);

    if (level === 'error') {
      console.error(line);
      return;
    }

    console.log(line);
  }
}
