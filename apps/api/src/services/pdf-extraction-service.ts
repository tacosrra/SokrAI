import pdf from 'pdf-parse';

import { AppError } from '../utils/errors';

export class PdfExtractionService {
  async extractText(fileName: string, contentBase64: string): Promise<string> {
    if (!fileName.toLowerCase().endsWith('.pdf')) {
      throw new AppError(400, 'invalid_pdf_file', 'Only PDF files are supported in v1');
    }

    let buffer: Buffer;

    try {
      buffer = Buffer.from(contentBase64, 'base64');
    } catch {
      throw new AppError(400, 'invalid_pdf_payload', 'The provided PDF payload is not valid base64');
    }

    try {
      const parsed = await pdf(buffer);
      return parsed.text.trim();
    } catch (error) {
      throw new AppError(400, 'pdf_extraction_failed', 'The PDF could not be parsed. v1 supports text-based PDFs only.', false, undefined, {
        cause: error instanceof Error ? error.message : 'unknown',
      });
    }
  }
}
