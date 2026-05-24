import type { ProposalStartRequest } from '../domain/contracts';

export interface ProposalStartFormFields {
  projectTitle: string;
  goal: string;
  proposalText: string;
  documentText: string;
  userId: string;
  metadataText: string;
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
  const userId = form.userId.trim();
  const metadataText = form.metadataText.trim();

  if (!projectTitle) {
    return { ok: false, error: '`project_title` es obligatorio.' };
  }

  if (!goal) {
    return { ok: false, error: '`goal` es obligatorio.' };
  }

  if (!proposalText && !documentText && !form.file) {
    return { ok: false, error: 'Debes aportar texto de propuesta, `document_text` o un PDF.' };
  }

  let metadata: Record<string, unknown> | undefined;

  if (metadataText) {
    try {
      const parsed = JSON.parse(metadataText) as unknown;

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error();
      }

      metadata = parsed as Record<string, unknown>;
    } catch {
      return { ok: false, error: '`metadata` debe ser un objeto JSON válido.' };
    }
  }

  return {
    ok: true,
    payload: {
      project_title: projectTitle,
      goal,
      proposal_text: proposalText || undefined,
      document_text: documentText || undefined,
      file: form.file,
      user_id: userId || undefined,
      metadata,
    },
  };
}
