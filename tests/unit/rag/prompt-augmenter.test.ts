import { describe, expect, it } from 'vitest';

import { buildSourcesBlock, validateCitations } from '../../../apps/api/src/rag/prompt-augmenter.ts';
import type { RetrievedChunk } from '../../../apps/api/src/rag/types.ts';

const chunks: RetrievedChunk[] = [
  {
    chunkId: 'a',
    documentId: 'doc-1',
    documentTitle: 'Glosario',
    sectionPath: 'Glosario > Sesión',
    content: 'Una sesión es una conversación con identificador único.',
    score: 0.91,
  },
  {
    chunkId: 'b',
    documentId: 'doc-2',
    documentTitle: 'Glossari',
    sectionPath: null,
    content: 'Una sessió és una conversa amb identificador únic.',
    score: 0.83,
  },
];

describe('prompt augmenter', () => {
  it('builds a Sources block with [S1], [S2] markers and section paths', () => {
    const block = buildSourcesBlock(chunks);
    expect(block).toContain('[S1] (Glosario \u00b7 Glosario > Sesión)');
    expect(block).toContain('[S2] (Glossari)');
    expect(block).toContain('> Una sesión');
    expect(block).toContain('> Una sessió');
  });

  it('returns a placeholder block when no chunks are retrieved', () => {
    const block = buildSourcesBlock([]);
    expect(block).toContain('no relevant sources retrieved');
  });

  it('separates valid citations from invented ones', () => {
    const result = validateCitations(['S1', 'S2', 'S99', 's1 '], chunks);
    expect(result.valid).toEqual(['S1', 'S2', 'S1']);
    expect(result.invented).toEqual(['S99']);
  });

  it('treats whitespace differences as significant for invented detection but not for valid ids', () => {
    const result = validateCitations(['  S1  ', 'sX'], chunks);
    expect(result.valid).toContain('S1');
    expect(result.invented).toContain('sX');
  });
});
