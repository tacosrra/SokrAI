import dotenv from 'dotenv';

dotenv.config();

export interface AppConfig {
  appEnv: string;
  appPort: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  databaseUrl: string;
  databasePoolMax: number;
  databaseStatementTimeoutMs: number;
  aiProvider: 'ollama';
  aiModel: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  ollamaTimeoutMs: number;
  ollamaKeepAlive: string;
  ollamaNumCtx: number;
  briefExtractionMaxChars: number;
  jsonRepairMaxAttempts: number;
  maxProposalChars: number;
  maxReplyChars: number;
  maxTurnsPerSession: number;
  maxDiagnosisItems: number;
  phasePrefetchEnabled: boolean;
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
  const aiProvider = getAiProvider();
  const ollamaModel = getString('OLLAMA_MODEL', 'qwen2.5:3b-instruct');

  return {
    appEnv: getString('APP_ENV', 'local'),
    appPort: getNumber('APP_PORT', 3001),
    logLevel: getString('LOG_LEVEL', 'info') as AppConfig['logLevel'],
    databaseUrl: getString('DATABASE_URL', 'postgresql://sokrai_app:localpass@localhost:5433/sokrai_app'),
    databasePoolMax: getNumber('DATABASE_POOL_MAX', 10),
    databaseStatementTimeoutMs: getNumber('DATABASE_STATEMENT_TIMEOUT_MS', 5000),
    aiProvider,
    aiModel: getString('AI_MODEL', ollamaModel),
    ollamaBaseUrl: getString('OLLAMA_BASE_URL', 'http://localhost:11434'),
    ollamaModel,
    ollamaTimeoutMs: getNumber('OLLAMA_TIMEOUT_MS', 900000),
    ollamaKeepAlive: getString('OLLAMA_KEEP_ALIVE', '30m'),
    ollamaNumCtx: getNumber('OLLAMA_NUM_CTX', 4096),
    briefExtractionMaxChars: getNumber('BRIEF_EXTRACTION_MAX_CHARS', 10000),
    jsonRepairMaxAttempts: getNumber('JSON_REPAIR_MAX_ATTEMPTS', 1),
    maxProposalChars: getNumber('MAX_PROPOSAL_CHARS', 30000),
    maxReplyChars: getNumber('MAX_REPLY_CHARS', 4000),
    maxTurnsPerSession: getNumber('MAX_TURNS_PER_SESSION', 12),
    maxDiagnosisItems: getNumber('MAX_DIAGNOSIS_ITEMS', 3),
    phasePrefetchEnabled: getBoolean('PHASE_PREFETCH_ENABLED', true),
    allowSensitiveHealthData: getBoolean('ALLOW_SENSITIVE_HEALTH_DATA', false),
    internalSharedSecret: getString('INTERNAL_SHARED_SECRET', 'local-shared-secret'),
  };
}

function getAiProvider(): AppConfig['aiProvider'] {
  const value = getString('AI_PROVIDER', 'ollama');

  if (value !== 'ollama') {
    throw new Error('Environment variable AI_PROVIDER must be "ollama"');
  }

  return value;
}
