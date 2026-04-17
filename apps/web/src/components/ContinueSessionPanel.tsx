import { useEffect, useState } from 'react';

import type { RecentSession } from '../domain/contracts';
import { StatusBadge, sessionTone } from './StatusBadge';

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
      setError('Indica un `session_id` válido.');
      return;
    }

    await onLoad(trimmed);
  }

  return (
    <section className="panel continue-panel">
      <div className="panel__eyebrow">Continuar sesión</div>
      <div className="panel__heading">
        <h2>Reabrir una sesión persistida</h2>
        <p>
          Consulta el estado real en PostgreSQL y recupera los turnos, snapshots y runs auditables.
        </p>
      </div>

      <form className="resume-form" onSubmit={submitLoad}>
        <label className="field">
          <span className="field__label">Session ID</span>
          <input
            className="field__control field__control--code"
            type="text"
            value={sessionId}
            onChange={(event) => setSessionId(event.target.value)}
            placeholder="85cf3299-4fc3-4770-9944-6049d97e7b59"
            disabled={isLoading}
          />
        </label>

        {error ? <div className="feedback feedback--error">{error}</div> : null}

        <button className="button button--secondary" type="submit" disabled={isLoading}>
          {isLoading ? 'Consultando sesión…' : 'Abrir sesión'}
        </button>
      </form>

      <div className="recent-sessions">
        <div className="recent-sessions__header">
          <h3>Sesiones recientes</h3>
          <p>Persistidas en `localStorage` para retomar una demo sin volver a usar curl.</p>
        </div>

        {recentSessions.length === 0 ? (
          <div className="empty-state">
            Aún no hay sesiones recientes almacenadas en este navegador.
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
                    label={session.status.replaceAll('_', ' ')}
                    tone={sessionTone(session.status)}
                  />
                </div>
                <p>{session.goal}</p>
                <div className="recent-session__meta">
                  <span>{session.sessionId}</span>
                  <span>{new Date(session.updatedAt).toLocaleString('es-ES')}</span>
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
