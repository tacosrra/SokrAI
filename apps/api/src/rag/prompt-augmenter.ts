import type { RetrievedChunk } from './types';

export interface CitationValidationResult {
  valid: string[];
  invented: string[];
}

export function buildSourcesBlock(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return 'Sources: (no relevant sources retrieved)';
  }

  const blocks = chunks.map((chunk, index) => {
    const id = `S${index + 1}`;
    const titleParts: string[] = [];

    if (chunk.documentTitle) {
      titleParts.push(chunk.documentTitle);
    }

    if (chunk.sectionPath) {
      titleParts.push(chunk.sectionPath);
    }

    const header = titleParts.length > 0
      ? `[${id}] (${titleParts.join(' \u00b7 ')})`
      : `[${id}]`;

    const indented = chunk.content
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');

    return `${header}\n${indented}`;
  });

  return `Sources:\n${blocks.join('\n\n')}`;
}

export function validateCitations(
  citations: string[],
  chunks: RetrievedChunk[],
): CitationValidationResult {
  const canonicalById = new Map<string, string>();
  for (let i = 0; i < chunks.length; i += 1) {
    const canonical = `S${i + 1}`;
    canonicalById.set(canonical.toUpperCase(), canonical);
  }

  const valid: string[] = [];
  const invented: string[] = [];

  for (const citation of citations) {
    const trimmed = citation.trim();
    const key = trimmed.toUpperCase();
    const canonical = canonicalById.get(key);

    if (canonical) {
      valid.push(canonical);
    } else {
      invented.push(trimmed);
    }
  }

  return { valid, invented };
}
