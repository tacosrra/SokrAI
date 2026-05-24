import pdf from 'pdf-parse';

import { AppError } from '../utils/errors';
import { sha256Buffer } from '../utils/hash';

export interface PdfExtractionResult {
  text: string;
  sha256: string;
  metadata: Record<string, unknown>;
  warnings: string[];
}

interface PdfParseMetadata {
  numpages?: number;
  numrender?: number;
  version?: string;
}

type PdfParser = typeof pdf;

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

export function decodePdfPayload(contentBase64: string): Buffer {
  const normalized = contentBase64.trim();

  if (
    normalized.length === 0 ||
    normalized.length % 4 !== 0 ||
    !BASE64_PATTERN.test(normalized)
  ) {
    throw new AppError(400, 'invalid_pdf_payload', 'The provided PDF payload is not valid base64');
  }

  const buffer = Buffer.from(normalized, 'base64');
  const encoded = buffer.toString('base64');

  if (buffer.length === 0 || encoded !== normalized) {
    throw new AppError(400, 'invalid_pdf_payload', 'The provided PDF payload is not valid base64');
  }

  return buffer;
}

export class PdfExtractionService {
  constructor(private readonly parser: PdfParser = pdf) {}

  async extractDocument(fileName: string, contentBase64: string): Promise<PdfExtractionResult> {
    const normalizedFileName = fileName.trim();

    if (!normalizedFileName.toLowerCase().endsWith('.pdf')) {
      throw new AppError(400, 'invalid_pdf_file', 'Only PDF files are supported in v1');
    }

    const buffer = decodePdfPayload(contentBase64);

    try {
      const parsed = await this.parser(buffer);
      const metadata = parsed as PdfParseMetadata;
      const text = parsed.text.trim();

      if (!text) {
        throw new AppError(
          400,
          'empty_document',
          'The PDF did not contain extractable text. v1 supports text-based PDFs only.',
        );
      }

      return {
        text,
        sha256: sha256Buffer(buffer),
        metadata: {
          file_name: normalizedFileName,
          page_count: metadata.numpages,
          rendered_pages: metadata.numrender,
          parser_version: metadata.version,
        },
        warnings: [],
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(400, 'pdf_extraction_failed', 'The PDF could not be parsed. v1 supports text-based PDFs only.', false, undefined, {
        cause: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  async extractText(fileName: string, contentBase64: string): Promise<string> {
    const result = await this.extractDocument(fileName, contentBase64);
    return result.text;
  }
}
