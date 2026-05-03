import { describe, expect, it } from 'vitest';

import { approxTokenCount, chunkText } from '../../../apps/api/src/rag/chunking.ts';

describe('rag chunking', () => {
  it('returns no chunks for empty input', () => {
    const result = chunkText('   \n   ', { type: 'plain_text', target_tokens: 100, overlap_tokens: 20 });
    expect(result).toEqual([]);
  });

  it('keeps a short text as a single chunk', () => {
    const text = 'Una pregunta corta.';
    const result = chunkText(text, { type: 'plain_text', target_tokens: 100, overlap_tokens: 20 });
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe(text);
    expect(result[0].sectionPath).toBeNull();
  });

  it('preserves markdown section paths in chunks', () => {
    const markdown = [
      '# Glosario',
      '',
      '## Sesión',
      'Una sesión es una conversación con identificador único asociada a una propuesta.',
      'Conserva turnos, snapshots y ejecuciones del modelo.',
      '',
      '## Brief estructurado',
      'El brief estructurado contiene los campos clave de una propuesta.',
    ].join('\n');

    const result = chunkText(markdown, {
      type: 'markdown_first',
      target_tokens: 80,
      overlap_tokens: 10,
    });

    const sections = new Set(result.map((chunk) => chunk.sectionPath));

    expect(sections.has('Glosario > Sesión')).toBe(true);
    expect(sections.has('Glosario > Brief estructurado')).toBe(true);
  });

  it('splits long text into multiple chunks under the target size', () => {
    const paragraph = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. ';
    const text = paragraph.repeat(40);

    const result = chunkText(text, {
      type: 'plain_text',
      target_tokens: 50,
      overlap_tokens: 10,
    });

    expect(result.length).toBeGreaterThan(1);

    for (const chunk of result) {
      expect(chunk.content.length).toBeLessThanOrEqual(50 * 4 + paragraph.length);
      expect(chunk.tokenCount).toBeGreaterThan(0);
    }
  });

  it('handles multilingual content (es + ca + en) without crashing', () => {
    const mixed = [
      'En castellano: la sesión guarda los turnos resueltos.',
      'En català: la sessió desa els torns resolts.',
      'In English: the session keeps resolved turns.',
    ].join('\n\n');

    const result = chunkText(mixed, {
      type: 'plain_text',
      target_tokens: 80,
      overlap_tokens: 10,
    });

    expect(result.length).toBeGreaterThan(0);
    const fullText = result.map((chunk) => chunk.content).join(' ');
    expect(fullText).toContain('castellano');
    expect(fullText).toContain('català');
    expect(fullText).toContain('English');
  });

  it('approxTokenCount is roughly proportional to length', () => {
    expect(approxTokenCount('')).toBe(0);
    expect(approxTokenCount('hi')).toBeGreaterThan(0);
    expect(approxTokenCount('a'.repeat(400))).toBeGreaterThan(approxTokenCount('a'.repeat(40)));
  });
});
