import { describe, expect, it } from 'vitest';

import { ApiError } from './api';
import { getWorkflowLoadingCopy, mapApiError } from './feedback';

describe('mapApiError', () => {
  it('returns specific copy for ollama timeouts', () => {
    const error = new ApiError(
      'The local model exceeded the configured timeout',
      504,
      'ollama_timeout',
      true,
    );

    expect(mapApiError(error)).toContain('Ollama agotó el tiempo máximo');
  });

  it('keeps the browser timeout distinct from model timeouts', () => {
    const error = new ApiError(
      'La solicitud ha superado el tiempo de espera configurado.',
      408,
      'request_timeout',
      true,
    );

    expect(mapApiError(error)).toContain('navegador agotó el tiempo');
  });
});

describe('getWorkflowLoadingCopy', () => {
  it('explains that the first diagnosis chains multiple backend steps', () => {
    const copy = getWorkflowLoadingCopy('start');

    expect(copy.title).toContain('primer diagnóstico');
    expect(copy.steps).toHaveLength(3);
  });
});
