import { useEffect, useState } from 'react';

import type { RecentSession } from '../domain/contracts';
import { StatusBadge, sessionStatusLabel, sessionTone } from './StatusBadge';

interface ContinueSessionPanelProps {
  defaultSessionId: string;
  isLoading: boolean;
  recentSessions: RecentSession[];
  onLoad: (sessionId: string) => Promise<void>;
}

export function ContinueSessionPanel({
  defaultSessionId,
  isLoading,
  recentSessions,
  onLoad,
}: ContinueSessionPanelProps) {
  const [sessionId, setSessionId] = useState(defaultSessionId);
  const [error, setError] = useState('');

  useEffect(() => {
    setSessionId(defaultSessionId);
  }, [defaultSessionId]);

  async function submitLoad(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const trimmed = sessionId.trim();

    if (!trimmed) {
      setError('Pega el enlace o código de la propuesta que quieres continuar.');
      return;
    }

    await onLoad(trimmed);
  }

  return (
    <section className="panel continue-panel">
      <div className="panel__eyebrow">Continuar</div>
      <div className="panel__heading">
        <h2>Continuar una propuesta anterior</h2>
        <p>
          Pega el enlace guardado o elige una propuesta reciente de este navegador.
        </p>
      </div>

      <form className="resume-form" onSubmit={submitLoad}>
        <label className="field">
          <span className="field__label">Enlace o código de propuesta</span>
          <input
            className="field__control"
            type="text"
            value={sessionId}
            onChange={(event) => setSessionId(event.target.value)}
            placeholder="Pega aquí el enlace de la propuesta guardada"
            disabled={isLoading}
          />
          <span className="field__hint">
            Si el enlace ya no funciona, puede que el servicio local se haya reiniciado.
          </span>
        </label>

        {error ? <div className="feedback feedback--error">{error}</div> : null}

        <button className="button button--primary" type="submit" disabled={isLoading}>
          {isLoading ? 'Recuperando propuesta...' : 'Continuar propuesta'}
        </button>
      </form>

      <div className="recent-sessions">
        <div className="recent-sessions__header">
          <h3>Propuestas recientes</h3>
          <p>Guardadas solo en este navegador para que puedas volver al punto donde lo dejaste.</p>
        </div>

        {recentSessions.length === 0 ? (
          <div className="empty-state">
            Aún no hay propuestas recientes en este navegador.
          </div>
        ) : (
          <div className="recent-sessions__list">
            {recentSessions.map((session) => (
              <button
                key={session.sessionId}
                className="recent-session"
                type="button"
                onClick={() => {
                  setSessionId(session.sessionId);
                  void onLoad(session.sessionId);
                }}
                disabled={isLoading}
              >
                <div className="recent-session__header">
                  <strong>{session.projectTitle}</strong>
                  <StatusBadge
                    label={sessionStatusLabel(session.status)}
                    tone={sessionTone(session.status)}
                  />
                </div>
                <p>{session.goal}</p>
                <div className="recent-session__meta">
                  <span>Actualizada el {new Date(session.updatedAt).toLocaleString('es-ES')}</span>
                </div>
                {session.currentQuestion ? (
                  <div className="recent-session__question">{session.currentQuestion}</div>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
