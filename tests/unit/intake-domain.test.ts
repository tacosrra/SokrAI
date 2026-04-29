import { describe, expect, it } from 'vitest';

import {
  mergeSourceText,
  prepareBriefExtractionInput,
} from '../../apps/api/src/domain/intake.ts';

describe('intake domain helpers', () => {
  it('reduces the brief extraction payload while preserving head and tail context', () => {
    const source = [
      'A'.repeat(5000),
      'B'.repeat(5000),
      'C'.repeat(5000),
    ].join('\n');

    const prepared = prepareBriefExtractionInput(source, 1000);

    expect(prepared.text.length).toBeLessThanOrEqual(1000);
    expect(prepared.text).toContain('AAAA');
    expect(prepared.text).toContain('CCCC');
    expect(prepared.text).toContain('middle section omitted');
    expect(prepared.warnings[0]).toContain('reduced to 1000 characters');
  });

  it('keeps full text when the source already fits the extraction budget', () => {
    const prepared = prepareBriefExtractionInput('texto breve', 1000);

    expect(prepared.text).toBe('texto breve');
    expect(prepared.warnings).toEqual([]);
  });

  it('still truncates the persisted normalized text to the global proposal cap', () => {
    const merged = mergeSourceText('X'.repeat(20), undefined, 10);

    expect(merged.normalizedText).toHaveLength(10);
    expect(merged.warnings[0]).toContain('truncated to 10 characters');
  });
});
