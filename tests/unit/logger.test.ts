import { afterEach, describe, expect, it, vi } from 'vitest';

import { JsonLogger } from '../../apps/api/src/utils/logger.ts';

function parseLoggedPayload(logMock: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  const line = logMock.mock.calls[0]?.[0];
  expect(typeof line).toBe('string');
  return JSON.parse(line as string) as Record<string, unknown>;
}

describe('JsonLogger redaction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('redacts raw model output, payloads, and nested answers while preserving operational metadata', () => {
    const logMock = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const logger = new JsonLogger('debug');

    logger.info('demo_event', {
      request_id: 'req-1',
      session_id: 'sess-1',
      raw_model_output: '{"private":"model text"}',
      payload: { proposal_text: 'patient-like details' },
      nested: {
        answer: 'free text answer',
      },
      prompt_sha256: 'hash-123',
      export_id: 'export-123',
      model_name: 'qwen2.5:3b-instruct',
    });

    const payload = parseLoggedPayload(logMock);

    expect(payload).toMatchObject({
      level: 'info',
      message: 'demo_event',
      request_id: 'req-1',
      session_id: 'sess-1',
      raw_model_output: '[REDACTED]',
      payload: '[REDACTED]',
      nested: { answer: '[REDACTED]' },
      prompt_sha256: 'hash-123',
      export_id: 'export-123',
      model_name: 'qwen2.5:3b-instruct',
    });
    expect(JSON.stringify(payload)).not.toContain('model text');
    expect(JSON.stringify(payload)).not.toContain('patient-like details');
    expect(JSON.stringify(payload)).not.toContain('free text answer');
  });

  it('redacts error logs recursively, including arrays and server-side secret keys', () => {
    const errorMock = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const logger = new JsonLogger('debug');

    logger.error('failed_event', {
      status_code: 500,
      error_code: 'internal_error',
      INTERNAL_SHARED_SECRET: 'secret-value',
      items: [
        {
          systemPrompt: 'system text',
          validated_output_json: { unsafe: true },
          request_id: 'nested-req',
        },
      ],
      report_payload_sha256: 'report-hash',
    });

    const payload = parseLoggedPayload(errorMock);

    expect(payload).toMatchObject({
      level: 'error',
      message: 'failed_event',
      status_code: 500,
      error_code: 'internal_error',
      INTERNAL_SHARED_SECRET: '[REDACTED]',
      items: [
        {
          systemPrompt: '[REDACTED]',
          validated_output_json: '[REDACTED]',
          request_id: 'nested-req',
        },
      ],
      report_payload_sha256: 'report-hash',
    });
    expect(JSON.stringify(payload)).not.toContain('secret-value');
    expect(JSON.stringify(payload)).not.toContain('system text');
    expect(JSON.stringify(payload)).not.toContain('unsafe');
  });
});
