import { useState } from 'react';

import type { ProposalStartRequest } from '../domain/contracts';
import { toProposalStartFile } from '../lib/file';
import { buildProposalStartPayload } from '../lib/proposal-start-payload';

interface NewProposalPanelProps {
  isSubmitting: boolean;
  onSubmit: (payload: ProposalStartRequest) => Promise<void>;
}

interface FormState {
  projectTitle: string;
  goal: string;
  proposalText: string;
  documentText: string;
  file: ProposalStartRequest['file'];
  fileName: string;
}

const initialState: FormState = {
  projectTitle: '',
  goal: '',
  proposalText: '',
  documentText: '',
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

    const result = buildProposalStartPayload(form);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    await onSubmit(result.payload);
  }

  return (
    <section className="panel proposal-panel">
      <div className="panel__eyebrow">Nueva propuesta</div>
      <div className="panel__heading">
        <h2>Cuéntanos la idea que quieres mejorar</h2>
        <p>
          Añade solo la información necesaria para empezar. SokrAI preparará una primera pregunta
          y te guiará paso a paso.
        </p>
      </div>

      <div className="safety-note">
        No introduzcas datos reales de pacientes. SokrAI prepara material para revisión humana y
        no toma decisiones clínicas, legales ni regulatorias.
      </div>

      <form className="proposal-form" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field__label">Nombre de la propuesta</span>
          <input
            className="field__control"
            type="text"
            value={form.projectTitle}
            onChange={(event) => updateField('projectTitle', event.target.value)}
            placeholder="Ej. Apoyo a admisión en Urgencias"
            disabled={isSubmitting}
          />
        </label>

        <label className="field">
          <span className="field__label">Qué quieres aclarar</span>
          <textarea
            className="field__control field__control--medium"
            value={form.goal}
            onChange={(event) => updateField('goal', event.target.value)}
            placeholder="Quiero ordenar la idea antes de presentarla a revisión interna."
            disabled={isSubmitting}
          />
        </label>

        <label className="field">
          <span className="field__label">Describe la idea inicial</span>
          <textarea
            className="field__control field__control--large"
            value={form.proposalText}
            onChange={(event) => updateField('proposalText', event.target.value)}
            placeholder="Explica qué problema quieres resolver, quién lo vive, qué señales lo muestran y qué se está haciendo ahora."
            disabled={isSubmitting}
          />
          <span className="field__hint">
            Prioriza hechos observables. Si todavía no sabes algo, dilo claramente.
          </span>
        </label>

        <div className="field-grid">
          <label className="field">
            <span className="field__label">Texto de apoyo</span>
            <textarea
              className="field__control field__control--medium"
              value={form.documentText}
              onChange={(event) => updateField('documentText', event.target.value)}
              placeholder="Pega notas, actas o fragmentos útiles si ya los tienes preparados."
              disabled={isSubmitting}
            />
          </label>

          <div className="field field--file">
            <span className="field__label">Documento opcional</span>
            <label className="file-dropzone">
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) => void handleFileChange(event.target.files)}
                disabled={isSubmitting || fileBusy}
              />
              <span className="file-dropzone__title">
                {fileBusy ? 'Preparando el documento...' : form.fileName || 'Selecciona un PDF con texto'}
              </span>
              <span className="file-dropzone__meta">
                Usa documentos sin datos personales reales. Los PDF escaneados pueden no leerse bien.
              </span>
            </label>
          </div>
        </div>

        {error ? <div className="feedback feedback--error">{error}</div> : null}

        <div className="form-actions">
          <button className="button button--primary" type="submit" disabled={isSubmitting || fileBusy}>
            {isSubmitting ? 'Preparando la primera pregunta...' : 'Empezar nueva propuesta'}
          </button>
          <p className="form-actions__hint">
            Después de empezar, SokrAI te hará una pregunta concreta para aclarar el problema.
          </p>
        </div>
      </form>
    </section>
  );
}
