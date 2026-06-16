import type { RecentSession } from '../domain/contracts';
import { StatusBadge, sessionStatusLabel, sessionTone } from './StatusBadge';

interface SessionMenuProps {
  isOpen: boolean;
  onClose: () => void;
  sessionLookupId: string;
  setSessionLookupId: (value: string) => void;
  recentSessions: RecentSession[];
  isLoadingSession: boolean;
  onLoadSession: (sessionId: string) => Promise<void>;
}

export function SessionMenu({
  isOpen,
  onClose,
  sessionLookupId,
  setSessionLookupId,
  recentSessions,
  isLoadingSession,
  onLoadSession,
}: SessionMenuProps) {
  if (!isOpen) return null;

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sessionLookupId.trim()) {
      void onLoadSession(sessionLookupId.trim());
      onClose();
    }
  };

  const formatSessionDate = (value: string) => {
    return new Date(value).toLocaleString('es-ES', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  };

  return (
    <div className="session-menu-overlay" onClick={onClose}>
      <dialog className="session-menu-drawer" open onClick={(e) => e.stopPropagation()}>
        <header className="session-menu-drawer__header">
          <div>
            <h2>Cambiar propuesta</h2>
            <p>Abre una propuesta anterior o vuelve al trabajo que tenías guardado.</p>
          </div>
          <button className="button button--secondary button--sm" type="button" onClick={onClose}>
            Cerrar
          </button>
        </header>

        <section className="session-menu-drawer__section">
          <h3>Buscar por enlace o código</h3>
          <form className="session-menu-drawer__form" onSubmit={handleManualSubmit}>
            <label className="field">
              <span className="field__label">Enlace o código de propuesta</span>
              <input
                className="field__control"
                type="text"
                value={sessionLookupId}
                onChange={(e) => setSessionLookupId(e.target.value)}
                placeholder="Pega aquí el enlace guardado"
                disabled={isLoadingSession}
              />
            </label>
            <button className="button button--secondary" type="submit" disabled={isLoadingSession}>
              {isLoadingSession ? 'Recuperando...' : 'Abrir propuesta'}
            </button>
          </form>
        </section>

        <section className="session-menu-drawer__section">
          <h3>Propuestas recientes</h3>
          <p className="session-menu-drawer__section-desc">
            Guardadas en este navegador para volver al punto donde lo dejaste.
          </p>

          {recentSessions.length === 0 ? (
            <p className="empty-state">Aún no hay propuestas recientes guardadas en este navegador.</p>
          ) : (
            <div className="session-menu-drawer__list">
              {recentSessions.map((session) => (
                <button
                  key={session.sessionId}
                  className="session-menu-drawer__item"
                  type="button"
                  onClick={() => {
                    void onLoadSession(session.sessionId);
                    onClose();
                  }}
                  disabled={isLoadingSession}
                >
                  <div className="session-menu-drawer__item-header">
                    <strong>{session.projectTitle}</strong>
                    <span>{formatSessionDate(session.updatedAt)}</span>
                  </div>
                  <p>{session.goal}</p>
                  <div className="session-menu-drawer__item-meta">
                    <StatusBadge
                      label={sessionStatusLabel(session.status)}
                      tone={sessionTone(session.status)}
                    />
                    <span>{session.currentQuestion || 'Sin pregunta pendiente'}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </dialog>
    </div>
  );
}
