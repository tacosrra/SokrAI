import { afterEach, describe, expect, it, vi } from 'vitest';

import { toProposalStartFile, validatePdfFile } from './file';

const originalFileReader = globalThis.FileReader;

function stubFileReader(result: string): void {
  class MockFileReader {
    result: string | ArrayBuffer | null = null;
    onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;
    onload: ((event: ProgressEvent<FileReader>) => void) | null = null;

    readAsDataURL(): void {
      this.result = result;
      this.onload?.({} as ProgressEvent<FileReader>);
    }
  }

  Object.defineProperty(globalThis, 'FileReader', {
    value: MockFileReader,
    configurable: true,
    writable: true,
  });
}

describe('PDF file helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();

    if (originalFileReader === undefined) {
      delete (globalThis as { FileReader?: unknown }).FileReader;
    } else {
      Object.defineProperty(globalThis, 'FileReader', {
        value: originalFileReader,
        configurable: true,
        writable: true,
      });
    }
  });

  it('converts a valid PDF file to the proposal start file contract', async () => {
    stubFileReader('data:application/pdf;base64,JVBERi0=');

    const file = new File(['%PDF-'], 'intake.pdf', { type: 'application/pdf' });

    await expect(toProposalStartFile(file)).resolves.toEqual({
      file_name: 'intake.pdf',
      mime_type: 'application/pdf',
      content_base64: 'JVBERi0=',
    });
  });

  it('rejects unsupported selected files with the validation message', () => {
    const file = new File(['plain text'], 'support.txt', { type: 'text/plain' });

    expect(() => validatePdfFile(file)).toThrow('Solo se admiten PDFs en esta v1.');
  });
});
