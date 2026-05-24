import { describe, expect, it } from 'vitest';

import {
  MVP_ALPHA_PRIVACY_WARNING,
  mergePreparedSources,
  prepareInputSources,
} from '../../apps/api/src/domain/document-sources.ts';
import { sha256Buffer } from '../../apps/api/src/utils/hash.ts';

describe('document source helpers', () => {
  it('creates a normalized document and pasted-text source for proposal text', () => {
    const prepared = prepareInputSources({
      proposalText: '  El triaje tarda demasiado.  ',
      allowSensitiveHealthData: true,
    });

    expect(prepared.documents).toHaveLength(1);
    expect(prepared.documents[0]).toMatchObject({
      key: 'proposal_text',
      sourceKind: 'pasted_text',
      documentStatus: 'normalized',
      normalizedText: 'El triaje tarda demasiado.',
    });
    expect(prepared.sources[0]).toMatchObject({
      key: 'proposal_text',
      sourceKind: 'pasted_text',
      label: 'Proposal text',
    });
  });

  it('creates a traceable pasted supporting text source', () => {
    const prepared = prepareInputSources({
      documentText: 'Documento interno con esperas observadas.',
      allowSensitiveHealthData: true,
    });
    const merged = mergePreparedSources(prepared, 1000);

    expect(merged.documents[0]).toMatchObject({
      key: 'pasted_supporting_text',
      sourceKind: 'pasted_text',
      documentStatus: 'normalized',
    });
    expect(merged.sources[0]).toMatchObject({
      documentKey: 'pasted_supporting_text',
      label: 'Pasted supporting text',
      span: {
        start_char: 0,
        end_char: merged.normalizedText.length,
      },
    });
  });

  it('preserves deterministic labels and bounded spans for proposal plus document text', () => {
    const prepared = prepareInputSources({
      proposalText: 'Problema principal.',
      documentText: 'Evidencia adicional.',
      allowSensitiveHealthData: true,
    });
    const merged = mergePreparedSources(prepared, 1000);

    expect(merged.normalizedText).toBe(
      'Proposal text:\nProblema principal.\n\nPasted supporting text:\nEvidencia adicional.',
    );
    expect(merged.sources.map((source) => source.label)).toEqual([
      'Proposal text',
      'Pasted supporting text',
    ]);
    expect(merged.sources.every((source) => source.span)).toBe(true);
    expect(merged.sources.every((source) => source.span!.end_char <= merged.normalizedText.length)).toBe(true);
  });

  it('adds the MVP Alpha privacy warning when sensitive data is not allowed', () => {
    const prepared = prepareInputSources({
      proposalText: 'Texto ficticio.',
      allowSensitiveHealthData: false,
    });
    const merged = mergePreparedSources(prepared, 1000);

    expect(merged.warnings).toContain(MVP_ALPHA_PRIVACY_WARNING);
  });

  it('builds uploaded PDF documents and uses a stable decoded-byte hash', () => {
    const bytes = Buffer.from('%PDF stable content');
    const sha256 = sha256Buffer(bytes);
    const prepared = prepareInputSources({
      uploadedPdf: {
        fileName: 'intake.pdf',
        mimeType: 'application/pdf',
        extraction: {
          text: 'Texto extraído del PDF.',
          sha256,
          metadata: { page_count: 1 },
          warnings: [],
        },
      },
      allowSensitiveHealthData: true,
    });
    const merged = mergePreparedSources(prepared, 1000);

    expect(merged.documents.map((document) => document.sourceKind)).toEqual([
      'uploaded_file',
      'extracted_text',
    ]);
    expect(merged.documents.every((document) => document.sha256 === sha256)).toBe(true);
    expect(merged.sources.map((source) => source.label)).toEqual([
      'Uploaded PDF: intake.pdf',
      'Extracted PDF text: intake.pdf',
    ]);
    expect(merged.sources[1]?.span).toBeDefined();
  });
});
