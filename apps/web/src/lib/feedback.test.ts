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

    expect(mapApiError(error)).toContain('El asistente local no ha podido completar este paso.');
  });

  it('keeps the browser timeout distinct from model timeouts', () => {
    const error = new ApiError(
      'La solicitud ha superado el tiempo de espera configurado.',
      408,
      'request_timeout',
      true,
    );

    expect(mapApiError(error)).toContain('Este paso está tardando más de lo esperado.');
  });

  it('explains when the proxy returns HTML instead of JSON', () => {
    const error = new ApiError(
      'El proxy devolvió HTML en lugar del JSON esperado.',
      502,
      'unexpected_html_response',
      false,
    );

    expect(mapApiError(error)).toContain('No se ha podido leer la respuesta del servicio local.');
  });

  it('explains when timeout recovery also expires', () => {
    const error = new ApiError(
      'The workflow did not expose a recoverable final state before the recovery window expired',
      504,
      'request_recovery_timeout',
      true,
    );

    expect(mapApiError(error)).toContain('No hemos podido confirmar el resultado final.');
  });

  it('explains when active recovery still cannot find the request id', () => {
    const error = new ApiError(
      'The workflow request could not be found after active recovery',
      404,
      'request_not_found_after_recovery',
      false,
    );

    expect(mapApiError(error)).toContain('No hemos encontrado este paso en el servicio local.');
  });

  it('explains text-only PDF extraction failures', () => {
    const error = new ApiError(
      'The PDF could not be parsed',
      400,
      'pdf_extraction_failed',
      false,
    );

    expect(mapApiError(error)).toContain('No se ha podido extraer texto del PDF.');
  });

  it('explains empty PDF extraction results', () => {
    const error = new ApiError(
      'The PDF did not contain extractable text',
      400,
      'empty_document',
      false,
    );

    expect(mapApiError(error)).toContain('El PDF no contiene texto seleccionable.');
  });
});

describe('getWorkflowLoadingCopy', () => {
  it('explains that the first question is being prepared', () => {
    const copy = getWorkflowLoadingCopy('start');

    expect(copy.title).toContain('primera pregunta');
    expect(copy.steps).toHaveLength(3);
  });
});
