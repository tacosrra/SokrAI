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

  it('explains when the proxy returns HTML instead of JSON', () => {
    const error = new ApiError(
      'El proxy devolvió HTML en lugar del JSON esperado.',
      502,
      'unexpected_html_response',
      false,
    );

    expect(mapApiError(error)).toContain('recibió HTML');
  });

  it('explains when timeout recovery also expires', () => {
    const error = new ApiError(
      'The workflow did not expose a recoverable final state before the recovery window expired',
      504,
      'request_recovery_timeout',
      true,
    );

    expect(mapApiError(error)).toContain('tampoco pudo recuperar');
  });

  it('explains when active recovery still cannot find the request id', () => {
    const error = new ApiError(
      'The workflow request could not be found after active recovery',
      404,
      'request_not_found_after_recovery',
      false,
    );

    expect(mapApiError(error)).toContain('no encontró ningún rastro persistido');
  });
});

describe('getWorkflowLoadingCopy', () => {
  it('explains that the first diagnosis chains multiple backend steps', () => {
    const copy = getWorkflowLoadingCopy('start');

    expect(copy.title).toContain('primer diagnóstico');
    expect(copy.steps).toHaveLength(3);
  });
});
