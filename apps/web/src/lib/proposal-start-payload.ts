import type { ProposalStartRequest } from '../domain/contracts';

export interface ProposalStartFormFields {
  projectTitle: string;
  goal: string;
  proposalText: string;
  documentText: string;
  file: ProposalStartRequest['file'];
}

export type ProposalStartPayloadResult =
  | { ok: true; payload: ProposalStartRequest }
  | { ok: false; error: string };

export function buildProposalStartPayload(
  form: ProposalStartFormFields,
): ProposalStartPayloadResult {
  const projectTitle = form.projectTitle.trim();
  const goal = form.goal.trim();
  const proposalText = form.proposalText.trim();
  const documentText = form.documentText.trim();

  if (!projectTitle) {
    return { ok: false, error: '`project_title` es obligatorio.' };
  }

  if (!goal) {
    return { ok: false, error: '`goal` es obligatorio.' };
  }

  if (!proposalText && !documentText && !form.file) {
    return { ok: false, error: 'Debes aportar texto de propuesta, `document_text` o un PDF.' };
  }

  return {
    ok: true,
    payload: {
      project_title: projectTitle,
      goal,
      proposal_text: proposalText || undefined,
      document_text: documentText || undefined,
      file: form.file,
    },
  };
}
