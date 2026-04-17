import { useState } from 'react';

import type { ProposalStartRequest } from '../domain/contracts';
import { toProposalStartFile } from '../lib/file';

interface NewProposalPanelProps {
  isSubmitting: boolean;
  onSubmit: (payload: ProposalStartRequest) => Promise<void>;
}

interface FormState {
  projectTitle: string;
  goal: string;
  proposalText: string;
  documentText: string;
  userId: string;
  metadataText: string;
  file: ProposalStartRequest['file'];
  fileName: string;
}

const initialState: FormState = {
  projectTitle: '',
  goal: '',
  proposalText: '',
  documentText: '',
  userId: '',
  metadataText: '',
  file: undefined,
  fileName: '',
};

export function NewProposalPanel({
  isSubmitting,
  onSubmit,
}: NewProposalPanelProps) {
  const [form, setForm] = useState<FormState>(initialState);
  const [error, setError] = useState('');
  const [fileBusy, setFileBusy] = useState(false);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function handleFileChange(fileList: FileList | null) {
    if (!fileList?.[0]) {
      updateField('file', undefined);
      updateField('fileName', '');
      return;
    }

    setError('');
    setFileBusy(true);

    try {
      const parsedFile = await toProposalStartFile(fileList[0]);
      updateField('file', parsedFile);
      updateField('fileName', parsedFile.file_name);
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : 'No se pudo procesar el PDF.');
      updateField('file', undefined);
      updateField('fileName', '');
    } finally {
      setFileBusy(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const projectTitle = form.projectTitle.trim();
    const goal = form.goal.trim();
    const proposalText = form.proposalText.trim();
    const documentText = form.documentText.trim();
    const userId = form.userId.trim();
    const metadataText = form.metadataText.trim();

    if (!projectTitle) {
      setError('`project_title` es obligatorio.');
      return;
    }

    if (!goal) {
      setError('`goal` es obligatorio.');
      return;
    }

    if (!proposalText && !documentText && !form.file) {
      setError('Debes aportar texto de propuesta, `document_text` o un PDF.');
      return;
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
        setError('`metadata` debe ser un objeto JSON válido.');
        return;
      }
    }

    await onSubmit({
      project_title: projectTitle,
      goal,
      proposal_text: proposalText || undefined,
      document_text: documentText || undefined,
      file: form.file,
      user_id: userId || undefined,
      metadata,
    });
  }

  return (
    <section className="panel proposal-panel">
      <div className="panel__eyebrow">Nueva propuesta</div>
      <div className="panel__heading">
        <h2>Arranque operativo del carril de maduración</h2>
        <p>
          Envía la propuesta inicial y deja que la v1 construya el
          <span> structured brief</span> y abra el siguiente turno socrático.
        </p>
      </div>

      <form className="proposal-form" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field__label">Project title</span>
          <input
            className="field__control"
            type="text"
            value={form.projectTitle}
            onChange={(event) => updateField('projectTitle', event.target.value)}
            placeholder="Ej. Triage IA en Urgencias"
            disabled={isSubmitting}
          />
        </label>

        <label className="field">
          <span className="field__label">Goal</span>
          <textarea
            className="field__control field__control--medium"
            value={form.goal}
            onChange={(event) => updateField('goal', event.target.value)}
            placeholder="Madurar la definición del problema antes de evaluar una solución."
            disabled={isSubmitting}
          />
        </label>

        <label className="field">
          <span className="field__label">Proposal text</span>
          <textarea
            className="field__control field__control--large"
            value={form.proposalText}
            onChange={(event) => updateField('proposalText', event.target.value)}
            placeholder="Describe el contexto, el problema actual, la evidencia y el alcance."
            disabled={isSubmitting}
          />
          <span className="field__hint">
            Ruta principal para la v1. El backend truncará por contrato si supera el máximo permitido.
          </span>
        </label>

        <div className="field-grid">
          <label className="field">
            <span className="field__label">Document text</span>
            <textarea
              className="field__control field__control--medium"
              value={form.documentText}
              onChange={(event) => updateField('documentText', event.target.value)}
              placeholder="Pega texto adicional si ya extraíste un documento fuera de la app."
              disabled={isSubmitting}
            />
          </label>

          <div className="field field--file">
            <span className="field__label">PDF opcional</span>
            <label className="file-dropzone">
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) => void handleFileChange(event.target.files)}
                disabled={isSubmitting || fileBusy}
              />
              <span className="file-dropzone__title">
                {fileBusy ? 'Convirtiendo PDF…' : form.fileName || 'Selecciona un PDF con texto extraíble'}
              </span>
              <span className="file-dropzone__meta">
                Se convierte a base64 en el navegador y se envía con el contrato oficial.
              </span>
            </label>
          </div>
        </div>

        <div className="field-grid">
          <label className="field">
            <span className="field__label">User ID opcional</span>
            <input
              className="field__control"
              type="text"
              value={form.userId}
              onChange={(event) => updateField('userId', event.target.value)}
              placeholder="eq-urgencias"
              disabled={isSubmitting}
            />
          </label>

          <label className="field">
            <span className="field__label">Metadata JSON opcional</span>
            <textarea
              className="field__control field__control--medium field__control--code"
              value={form.metadataText}
              onChange={(event) => updateField('metadataText', event.target.value)}
              placeholder='{"service":"urgencias","site":"hospital-norte"}'
              disabled={isSubmitting}
            />
          </label>
        </div>

        {error ? <div className="feedback feedback--error">{error}</div> : null}

        <div className="form-actions">
          <button className="button button--primary" type="submit" disabled={isSubmitting || fileBusy}>
            {isSubmitting ? 'Lanzando sesión…' : 'Crear sesión de maduración'}
          </button>
          <p className="form-actions__hint">
            El siguiente paso real ocurre en los workflows existentes de `n8n`, no en el navegador.
          </p>
        </div>
      </form>
    </section>
  );
}
