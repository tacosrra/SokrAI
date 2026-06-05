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

  it('logs circular objects without throwing while preserving safe metadata', () => {
    const errorMock = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const logger = new JsonLogger('debug');
    const circular: Record<string, unknown> = {
      request_id: 'req-circular-object',
      payload: 'secret payload',
    };
    circular.self = circular;

    expect(() =>
      logger.error('original_error', {
        error_code: 'pdf_extraction_failed',
        circular,
      }),
    ).not.toThrow();

    const payload = parseLoggedPayload(errorMock);

    expect(payload).toMatchObject({
      level: 'error',
      message: 'original_error',
      error_code: 'pdf_extraction_failed',
      circular: {
        request_id: 'req-circular-object',
        payload: '[REDACTED]',
        self: '[Circular]',
      },
    });
    expect(JSON.stringify(payload)).not.toContain('secret payload');
  });

  it('logs arrays containing themselves without recursing forever', () => {
    const logMock = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const logger = new JsonLogger('debug');
    const circularArray: unknown[] = [{ request_id: 'req-array' }];
    circularArray.push(circularArray);

    expect(() =>
      logger.info('array_cycle', {
        items: circularArray,
      }),
    ).not.toThrow();

    const payload = parseLoggedPayload(logMock);

    expect(payload).toMatchObject({
      level: 'info',
      message: 'array_cycle',
      items: [{ request_id: 'req-array' }, '[Circular]'],
    });
  });

  it('logs nested circular arrays and objects with sensitive values redacted', () => {
    const logMock = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const logger = new JsonLogger('debug');
    const nestedArray: unknown[] = [];
    const nestedObject: Record<string, unknown> = {
      answer: 'free text patient-like answer',
      nestedArray,
    };
    nestedArray.push(nestedObject);
    nestedArray.push(nestedArray);

    expect(() =>
      logger.info('nested_cycle', {
        root: {
          nestedObject,
        },
      }),
    ).not.toThrow();

    const payload = parseLoggedPayload(logMock);

    expect(payload).toMatchObject({
      level: 'info',
      message: 'nested_cycle',
      root: {
        nestedObject: {
          answer: '[REDACTED]',
          nestedArray: ['[Circular]', '[Circular]'],
        },
      },
    });
    expect(JSON.stringify(payload)).not.toContain('patient-like');
  });
});
