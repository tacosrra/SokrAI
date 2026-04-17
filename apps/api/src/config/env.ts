import dotenv from 'dotenv';

dotenv.config();

export interface AppConfig {
  appEnv: string;
  appPort: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  databaseUrl: string;
  databasePoolMax: number;
  databaseStatementTimeoutMs: number;
  ollamaBaseUrl: string;
  ollamaModel: string;
  ollamaTimeoutMs: number;
  ollamaNumCtx: number;
  jsonRepairMaxAttempts: number;
  maxProposalChars: number;
  maxReplyChars: number;
  maxTurnsPerSession: number;
  maxDiagnosisItems: number;
  allowSensitiveHealthData: boolean;
  internalSharedSecret: string;
}

function getString(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getNumber(name: string, fallback: number): number {
  const raw = process.env[name];

  if (raw === undefined) {
    return fallback;
  }

  const value = Number(raw);

  if (Number.isNaN(value)) {
    throw new Error(`Environment variable ${name} must be a number`);
  }

  return value;
}

function getBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name];

  if (raw === undefined) {
    return fallback;
  }

  return raw === 'true';
}

export function loadConfig(): AppConfig {
  return {
    appEnv: getString('APP_ENV', 'local'),
    appPort: getNumber('APP_PORT', 3001),
    logLevel: getString('LOG_LEVEL', 'info') as AppConfig['logLevel'],
    databaseUrl: getString('DATABASE_URL', 'postgresql://sokrai_app:localpass@localhost:5432/sokrai_app'),
    databasePoolMax: getNumber('DATABASE_POOL_MAX', 10),
    databaseStatementTimeoutMs: getNumber('DATABASE_STATEMENT_TIMEOUT_MS', 5000),
    ollamaBaseUrl: getString('OLLAMA_BASE_URL', 'http://localhost:11434'),
    ollamaModel: getString('OLLAMA_MODEL', 'qwen2.5:7b-instruct'),
    ollamaTimeoutMs: getNumber('OLLAMA_TIMEOUT_MS', 90000),
    ollamaNumCtx: getNumber('OLLAMA_NUM_CTX', 4096),
    jsonRepairMaxAttempts: getNumber('JSON_REPAIR_MAX_ATTEMPTS', 1),
    maxProposalChars: getNumber('MAX_PROPOSAL_CHARS', 30000),
    maxReplyChars: getNumber('MAX_REPLY_CHARS', 4000),
    maxTurnsPerSession: getNumber('MAX_TURNS_PER_SESSION', 12),
    maxDiagnosisItems: getNumber('MAX_DIAGNOSIS_ITEMS', 3),
    allowSensitiveHealthData: getBoolean('ALLOW_SENSITIVE_HEALTH_DATA', false),
    internalSharedSecret: getString('INTERNAL_SHARED_SECRET', 'local-shared-secret'),
  };
}
