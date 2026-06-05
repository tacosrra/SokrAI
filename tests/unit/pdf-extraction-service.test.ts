import { describe, expect, it, vi } from 'vitest';

import { PdfExtractionService, decodePdfPayload } from '../../apps/api/src/services/pdf-extraction-service.ts';
import { sha256Buffer } from '../../apps/api/src/utils/hash.ts';

describe('PdfExtractionService', () => {
  it('rejects non-PDF file names before parsing', async () => {
    const parser = vi.fn();
    const service = new PdfExtractionService(parser);

    await expect(
      service.extractDocument('support.txt', Buffer.from('hello').toString('base64')),
    ).rejects.toMatchObject({
      errorCode: 'invalid_pdf_file',
      statusCode: 400,
    });
    expect(parser).not.toHaveBeenCalled();
  });

  it('rejects malformed base64 instead of relying on permissive Buffer decoding', () => {
    expect(() => decodePdfPayload('not valid base64')).toThrow(/base64/);
    expect(() => decodePdfPayload('%%%%')).toThrow(/base64/);
  });

  it('returns extracted text, decoded-byte hash, and parser metadata', async () => {
    const bytes = Buffer.from('%PDF-1.4 text payload');
    const parser = vi.fn().mockResolvedValue({
      text: ' Extracted context ',
      numpages: 2,
      numrender: 2,
      info: {},
      metadata: null,
      version: '1.1.4',
    });

    const result = await new PdfExtractionService(parser).extractDocument(
      'intake.pdf',
      bytes.toString('base64'),
    );

    expect(result.text).toBe('Extracted context');
    expect(result.sha256).toBe(sha256Buffer(bytes));
    expect(result.metadata).toMatchObject({
      file_name: 'intake.pdf',
      page_count: 2,
      rendered_pages: 2,
      parser_version: '1.1.4',
    });
  });

  it('rejects PDFs without extractable text', async () => {
    const parser = vi.fn().mockResolvedValue({
      text: '   ',
      numpages: 1,
      numrender: 1,
      info: {},
      metadata: null,
      version: '1.1.4',
    });

    await expect(
      new PdfExtractionService(parser).extractDocument(
        'empty.pdf',
        Buffer.from('%PDF-empty').toString('base64'),
      ),
    ).rejects.toMatchObject({
      errorCode: 'empty_document',
      statusCode: 400,
    });
  });

  it('wraps parser failures as controlled extraction errors', async () => {
    const parser = vi.fn().mockRejectedValue(new Error('parser exploded'));
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    await expect(
      new PdfExtractionService(parser, logger).extractDocument(
        'broken.pdf',
        Buffer.from('%PDF-broken').toString('base64'),
      ),
    ).rejects.toMatchObject({
      errorCode: 'pdf_extraction_failed',
      statusCode: 400,
    });
    expect(logger.warn).toHaveBeenCalledWith('pdf_parser_failed', {
      pdf_sha256: sha256Buffer(Buffer.from('%PDF-broken')),
      byte_length: Buffer.from('%PDF-broken').length,
      parser_error_type: 'Error',
      parser_error_message: 'parser exploded',
    });
  });
});
