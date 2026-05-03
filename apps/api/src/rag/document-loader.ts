import fs from 'node:fs/promises';
import path from 'node:path';

import pdf from 'pdf-parse';

import { RagError } from './errors';

export interface LoadedDocument {
  rawText: string;
  mimeType: string;
  charCount: number;
}

const SUPPORTED_EXTENSIONS = new Set(['.md', '.markdown', '.txt', '.pdf']);

export class DocumentLoader {
  async load(absolutePath: string): Promise<LoadedDocument> {
    const ext = path.extname(absolutePath).toLowerCase();

    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      throw new RagError(
        400,
        'rag_unsupported_extension',
        `Unsupported file extension: ${ext}. Supported: .md, .markdown, .txt, .pdf`,
        { absolutePath },
      );
    }

    if (ext === '.pdf') {
      return this.loadPdf(absolutePath);
    }

    return this.loadText(absolutePath, ext);
  }

  private async loadText(absolutePath: string, ext: string): Promise<LoadedDocument> {
    const rawText = await fs.readFile(absolutePath, 'utf8');
    const mimeType = ext === '.txt' ? 'text/plain' : 'text/markdown';

    return {
      rawText,
      mimeType,
      charCount: rawText.length,
    };
  }

  private async loadPdf(absolutePath: string): Promise<LoadedDocument> {
    const buffer = await fs.readFile(absolutePath);

    try {
      const parsed = await pdf(buffer);
      const text = parsed.text.trim();

      if (text.length === 0) {
        throw new RagError(
          400,
          'rag_pdf_empty_text',
          'PDF was parsed but contained no extractable text. Scanned PDFs require OCR which is out of v1 scope.',
          { absolutePath },
        );
      }

      return {
        rawText: text,
        mimeType: 'application/pdf',
        charCount: text.length,
      };
    } catch (error) {
      if (error instanceof RagError) throw error;

      throw new RagError(
        400,
        'rag_pdf_extraction_failed',
        'Could not extract text from PDF. v1 supports text-based PDFs only.',
        {
          absolutePath,
          cause: error instanceof Error ? error.message : 'unknown',
        },
      );
    }
  }
}
