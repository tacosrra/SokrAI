import { describe, expect, it } from 'vitest';

import type { ProposalStartFile } from '../domain/contracts';
import { buildProposalStartPayload } from './proposal-start-payload';

const pdfFile: ProposalStartFile = {
  file_name: 'intake.pdf',
  mime_type: 'application/pdf',
  content_base64: 'JVBERi0=',
};

describe('buildProposalStartPayload', () => {
  it('includes the selected file in the submit payload', () => {
    const result = buildProposalStartPayload({
      projectTitle: ' Triage IA ',
      goal: ' Definir el problema ',
      proposalText: ' Texto base ',
      documentText: '',
      file: pdfFile,
    });

    expect(result).toEqual({
      ok: true,
      payload: {
        project_title: 'Triage IA',
        goal: 'Definir el problema',
        proposal_text: 'Texto base',
        document_text: undefined,
        file: pdfFile,
      },
    });
  });

  it('allows file-only proposal submissions', () => {
    const result = buildProposalStartPayload({
      projectTitle: 'PDF-only intake',
      goal: 'Extract proposal context',
      proposalText: '',
      documentText: '',
      file: pdfFile,
    });

    expect(result).toEqual({
      ok: true,
      payload: {
        project_title: 'PDF-only intake',
        goal: 'Extract proposal context',
        proposal_text: undefined,
        document_text: undefined,
        file: pdfFile,
      },
    });
  });
});
