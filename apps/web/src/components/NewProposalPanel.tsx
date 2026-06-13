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
        <h2>Prepara el contexto antes del primer turno</h2>
        <p>
          Resume el objetivo, el contexto y la evidencia disponible. Esta información se convertirá en un resumen estructurado y se usará para generar la primera pregunta del agente.
        </p>
      </div>

      <form className="proposal-form" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field__label">Título del proyecto</span>
          <input
            className="field__control"
            type="text"
            value={form.projectTitle}
            onChange={(event) => updateField('projectTitle', event.target.value)}
            placeholder="Ej. Triage IA en Urgencias"
            disabled={isSubmitting}
            autoFocus
          />
        </label>

        <label className="field">
          <span className="field__label">Objetivo</span>
          <textarea
            className="field__control field__control--medium"
            value={form.goal}
            onChange={(event) => updateField('goal', event.target.value)}
            placeholder="Madurar la definición del problema antes de evaluar una solución."
            disabled={isSubmitting}
          />
        </label>

        <label className="field">
          <span className="field__label">Contexto de la propuesta</span>
          <textarea
            className="field__control field__control--large"
            value={form.proposalText}
            onChange={(event) => updateField('proposalText', event.target.value)}
            placeholder="Describe el contexto, el problema actual, la evidencia y el alcance."
            disabled={isSubmitting}
          />
          <span className="field__hint">
            Ruta principal para la v1. Prioriza hechos, señales observables y quién sufre el problema.
          </span>
        </label>

        <div className="field-grid">
          <label className="field">
            <span className="field__label">Texto de apoyo</span>
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
                Se convierte a base64 en el navegador y se envía sin romper el contrato oficial.
              </span>
            </label>
          </div>
        </div>

        {error ? <div className="feedback feedback--error">{error}</div> : null}

        <div className="form-actions">
          <button className="button button--primary" type="submit" disabled={isSubmitting || fileBusy}>
            {isSubmitting ? 'Cargando primer diagnóstico…' : 'Crear sesión de maduración'}
          </button>
          <p className="form-actions__hint">
          </p>
        </div>
      </form>
    </section>
  );
}
