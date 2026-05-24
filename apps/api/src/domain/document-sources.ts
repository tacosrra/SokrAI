import type {
  DocumentStatus,
  ProposalDocumentSourceKind,
  ProposalSourceKind,
  SourceSpan,
} from '../contracts/types';
import type { PdfExtractionResult } from '../services/pdf-extraction-service';

export const MVP_ALPHA_PRIVACY_WARNING = 'Do not submit real patient data in MVP Alpha.';

interface InputDocument {
  key: string;
  sourceKind: ProposalDocumentSourceKind;
  documentStatus: DocumentStatus;
  label: string;
  textForMerge?: string;
  fileName?: string;
  mimeType?: string;
  sha256?: string;
  pastedText?: string;
  normalizedText?: string;
  warnings: string[];
  metadata: Record<string, unknown>;
}

interface InputSource {
  key: string;
  documentKey: string;
  sourceKind: ProposalSourceKind;
  label: string;
  metadata: Record<string, unknown>;
}

export interface PreparedProposalDocument {
  key: string;
  sourceKind: ProposalDocumentSourceKind;
  documentStatus: DocumentStatus;
  fileName?: string;
  mimeType?: string;
  sha256?: string;
  pastedText?: string;
  normalizedText?: string;
  warnings: string[];
  metadata: Record<string, unknown>;
}

export interface PreparedProposalSource {
  key: string;
  documentKey: string;
  sourceKind: ProposalSourceKind;
  label: string;
  span?: SourceSpan;
  metadata: Record<string, unknown>;
}

export interface PreparedInputSources {
  documents: PreparedProposalDocument[];
  sources: PreparedProposalSource[];
  warnings: string[];
}

export interface UploadedPdfInput {
  fileName: string;
  mimeType: 'application/pdf';
  extraction: PdfExtractionResult;
}

export interface PrepareInputSourcesParams {
  proposalText?: string;
  documentText?: string;
  uploadedPdf?: UploadedPdfInput;
  allowSensitiveHealthData: boolean;
}

export interface MergedPreparedSources {
  rawText: string;
  normalizedText: string;
  warnings: string[];
  documents: PreparedProposalDocument[];
  sources: PreparedProposalSource[];
}

interface MergeSection {
  documentKey: string;
  sourceKey?: string;
  rawText: string;
  normalizedText: string;
  startChar: number;
  endChar: number;
}

function cleanWhitespace(input: string): string {
  return input
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function optionalTrimmedText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function makeDocument(input: InputDocument): PreparedProposalDocument {
  return {
    key: input.key,
    sourceKind: input.sourceKind,
    documentStatus: input.documentStatus,
    fileName: input.fileName,
    mimeType: input.mimeType,
    sha256: input.sha256,
    pastedText: input.pastedText,
    normalizedText: input.normalizedText,
    warnings: input.warnings,
    metadata: input.metadata,
  };
}

function makeSource(input: InputSource): PreparedProposalSource {
  return {
    key: input.key,
    documentKey: input.documentKey,
    sourceKind: input.sourceKind,
    label: input.label,
    metadata: input.metadata,
  };
}

export function prepareInputSources(params: PrepareInputSourcesParams): PreparedInputSources {
  const documents: PreparedProposalDocument[] = [];
  const sources: PreparedProposalSource[] = [];
  const warnings = params.allowSensitiveHealthData ? [] : [MVP_ALPHA_PRIVACY_WARNING];
  const proposalText = optionalTrimmedText(params.proposalText);
  const documentText = optionalTrimmedText(params.documentText);

  if (proposalText) {
    const document = makeDocument({
      key: 'proposal_text',
      sourceKind: 'pasted_text',
      documentStatus: 'normalized',
      label: 'Proposal text',
      textForMerge: proposalText,
      pastedText: proposalText,
      normalizedText: cleanWhitespace(proposalText),
      warnings: [],
      metadata: { role: 'proposal_text' },
    });
    documents.push(document);
    sources.push(
      makeSource({
        key: 'proposal_text',
        documentKey: document.key,
        sourceKind: 'pasted_text',
        label: 'Proposal text',
        metadata: { role: 'proposal_text' },
      }),
    );
  }

  if (documentText) {
    const document = makeDocument({
      key: 'pasted_supporting_text',
      sourceKind: 'pasted_text',
      documentStatus: 'normalized',
      label: 'Pasted supporting text',
      textForMerge: documentText,
      pastedText: documentText,
      normalizedText: cleanWhitespace(documentText),
      warnings: [],
      metadata: { role: 'supporting_text' },
    });
    documents.push(document);
    sources.push(
      makeSource({
        key: 'pasted_supporting_text',
        documentKey: document.key,
        sourceKind: 'pasted_text',
        label: 'Pasted supporting text',
        metadata: { role: 'supporting_text' },
      }),
    );
  }

  if (params.uploadedPdf) {
    const fileDocument = makeDocument({
      key: 'uploaded_pdf',
      sourceKind: 'uploaded_file',
      documentStatus: 'received',
      label: `Uploaded PDF: ${params.uploadedPdf.fileName}`,
      fileName: params.uploadedPdf.fileName,
      mimeType: params.uploadedPdf.mimeType,
      sha256: params.uploadedPdf.extraction.sha256,
      warnings: [...params.uploadedPdf.extraction.warnings],
      metadata: {
        role: 'uploaded_file',
        extraction_status: 'completed',
        ...params.uploadedPdf.extraction.metadata,
      },
    });
    documents.push(fileDocument);
    sources.push(
      makeSource({
        key: 'uploaded_pdf',
        documentKey: fileDocument.key,
        sourceKind: 'uploaded_file',
        label: `Uploaded PDF: ${params.uploadedPdf.fileName}`,
        metadata: { role: 'uploaded_file' },
      }),
    );

    const extractedDocument = makeDocument({
      key: 'extracted_pdf_text',
      sourceKind: 'extracted_text',
      documentStatus: 'normalized',
      label: `Extracted PDF text: ${params.uploadedPdf.fileName}`,
      textForMerge: params.uploadedPdf.extraction.text,
      fileName: params.uploadedPdf.fileName,
      mimeType: params.uploadedPdf.mimeType,
      sha256: params.uploadedPdf.extraction.sha256,
      normalizedText: cleanWhitespace(params.uploadedPdf.extraction.text),
      warnings: [...params.uploadedPdf.extraction.warnings],
      metadata: {
        role: 'extracted_pdf_text',
        parent_document_key: fileDocument.key,
        ...params.uploadedPdf.extraction.metadata,
      },
    });
    documents.push(extractedDocument);
    sources.push(
      makeSource({
        key: 'extracted_pdf_text',
        documentKey: extractedDocument.key,
        sourceKind: 'extracted_text',
        label: `Extracted PDF text: ${params.uploadedPdf.fileName}`,
        metadata: {
          role: 'extracted_pdf_text',
          parent_document_key: fileDocument.key,
        },
      }),
    );
  }

  return { documents, sources, warnings };
}

export function mergePreparedSources(
  prepared: PreparedInputSources,
  maxChars: number,
): MergedPreparedSources {
  const warnings = [...prepared.warnings];
  const mergeableDocuments = prepared.documents.filter((document) => document.normalizedText?.trim());
  const sectionsWithoutOffsets = mergeableDocuments.map((document) => {
    const source = prepared.sources.find((item) => item.documentKey === document.key && item.sourceKind !== 'uploaded_file');
    const label = source?.label ?? document.metadata.label ?? document.key;
    return {
      documentKey: document.key,
      sourceKey: source?.key,
      rawText: `${label}:\n${document.normalizedText!.trim()}`,
      normalizedText: cleanWhitespace(`${label}:\n${document.normalizedText!.trim()}`),
    };
  });
  const sections: MergeSection[] = [];
  let cursor = 0;

  for (const section of sectionsWithoutOffsets) {
    const startChar = cursor;
    const endChar = startChar + section.normalizedText.length;
    sections.push({
      ...section,
      startChar,
      endChar,
    });
    cursor = endChar + 2;
  }

  const rawText = sections.map((section) => section.rawText).join('\n\n');
  const normalizedBeforeTruncation = sections.map((section) => section.normalizedText).join('\n\n');
  const normalizedText =
    normalizedBeforeTruncation.length > maxChars
      ? normalizedBeforeTruncation.slice(0, maxChars)
      : normalizedBeforeTruncation;

  if (normalizedBeforeTruncation.length > maxChars) {
    warnings.push(`Input was truncated to ${maxChars} characters`);
  }

  const retainedLength = normalizedText.length;

  const sources = prepared.sources.map((source) => {
    const section = sections.find((item) => item.sourceKey === source.key);

    if (!section) {
      return source;
    }

    // Spans are coordinates in the merged normalized session text. Sources that
    // are not represented in that text, such as uploaded-file metadata rows or
    // fully truncated sections, intentionally have no span.
    if (section.startChar >= retainedLength) {
      return source;
    }

    const end = Math.min(section.endChar, retainedLength);

    return {
      ...source,
      span: {
        start_char: section.startChar,
        end_char: end,
      },
    };
  });

  return {
    rawText,
    normalizedText,
    warnings: Array.from(new Set(warnings)),
    documents: prepared.documents,
    sources,
  };
}
