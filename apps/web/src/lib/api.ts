import type {
  ErrorResponse,
  ProposalReplyRequest,
  ProposalReplyResponse,
  ProposalStartRequest,
  ProposalStartResponse,
  SessionAuditView,
} from '../domain/contracts';
import {
  parseErrorResponse,
  parseProposalReplyResponse,
  parseProposalStartResponse,
  parseSessionAuditView,
} from './validation';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
const WEBHOOK_BASE_URL = (import.meta.env.VITE_WEBHOOK_BASE_URL ?? '').replace(/\/$/, '');

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl}${path}`;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly errorCode: string,
    public readonly retryable: boolean,
    public readonly requestId?: string,
    public readonly sessionId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function requestJson<T>(params: {
  url: string;
  method?: 'GET' | 'POST';
  payload?: unknown;
  timeoutMs: number;
  parse: (value: unknown) => T;
}): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), params.timeoutMs);

  try {
    const response = await fetch(params.url, {
      method: params.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      body: params.payload ? JSON.stringify(params.payload) : undefined,
      signal: controller.signal,
    });

    const contentType = response.headers.get('content-type') ?? '';
    const body = contentType.includes('application/json')
      ? ((await response.json()) as unknown)
      : ((await response.text()) as unknown);

    if (!response.ok) {
      throw toApiError(response.status, body);
    }

    return params.parse(body);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(
        'La solicitud ha superado el tiempo de espera configurado.',
        408,
        'request_timeout',
        true,
      );
    }

    if (error instanceof Error) {
      throw new ApiError(
        'Los servicios locales respondieron con un payload que no cumple el contrato esperado.',
        502,
        'invalid_response_contract',
        false,
      );
    }

    throw new ApiError(
      'No se pudo contactar con los servicios locales. Revisa API, n8n y el proxy del frontend.',
      503,
      'network_error',
      true,
    );
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function toApiError(statusCode: number, payload: unknown): ApiError {
  const parsed = safeParseErrorResponse(payload);

  if (parsed) {
    return new ApiError(
      parsed.safe_message,
      statusCode,
      parsed.error_code,
      parsed.retryable,
      parsed.request_id,
      parsed.session_id,
    );
  }

  return new ApiError(
    `La solicitud devolvió un estado HTTP ${statusCode}.`,
    statusCode,
    'http_error',
    statusCode >= 500,
  );
}

function safeParseErrorResponse(payload: unknown): ErrorResponse | null {
  try {
    return parseErrorResponse(payload);
  } catch {
    return null;
  }
}

export async function startSession(
  payload: ProposalStartRequest,
): Promise<ProposalStartResponse> {
  return requestJson({
    url: joinUrl(WEBHOOK_BASE_URL, '/webhook/proposal-start-v1'),
    method: 'POST',
    payload,
    timeoutMs: 120000,
    parse: parseProposalStartResponse,
  });
}

export async function replySession(
  payload: ProposalReplyRequest,
): Promise<ProposalReplyResponse> {
  return requestJson({
    url: joinUrl(WEBHOOK_BASE_URL, '/webhook/proposal-reply-v1'),
    method: 'POST',
    payload,
    timeoutMs: 120000,
    parse: parseProposalReplyResponse,
  });
}

export async function fetchSessionAudit(sessionId: string): Promise<SessionAuditView> {
  return requestJson({
    url: joinUrl(API_BASE_URL, `/api/v1/sessions/${encodeURIComponent(sessionId)}`),
    timeoutMs: 10000,
    parse: parseSessionAuditView,
  });
}
