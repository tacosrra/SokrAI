import type { RecentSession } from '../domain/contracts';
import { StatusBadge, sessionTone } from './StatusBadge';

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
            <h2>Cambiar sesión</h2>
            <p>Abre otra conversación sin perder el estado de esta pantalla.</p>
          </div>
          <button className="button button--secondary button--sm" type="button" onClick={onClose}>
            Cerrar
          </button>
        </header>

        <section className="session-menu-drawer__section">
          <h3>Buscar por Session ID</h3>
          <form className="session-menu-drawer__form" onSubmit={handleManualSubmit}>
            <label className="field">
              <span className="field__label">Session ID</span>
              <input
                className="field__control field__control--code"
                type="text"
                value={sessionLookupId}
                onChange={(e) => setSessionLookupId(e.target.value)}
                placeholder="85cf3299-4fc3-4770-9944-6049d97e7b59"
                disabled={isLoadingSession}
              />
            </label>
            <button className="button button--secondary" type="submit" disabled={isLoadingSession}>
              {isLoadingSession ? 'Consultando...' : 'Abrir sesión'}
            </button>
          </form>
        </section>

        <section className="session-menu-drawer__section">
          <h3>Sesiones recientes</h3>
          <p className="session-menu-drawer__section-desc">
            Guardadas en este navegador para volver al punto de la demo.
          </p>

          {recentSessions.length === 0 ? (
            <p className="empty-state">Aún no hay sesiones recientes guardadas en este navegador.</p>
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
                      label={session.status.replaceAll('_', ' ')}
                      tone={sessionTone(session.status)}
                    />
                    <span>{session.currentQuestion || 'Sin pregunta abierta'}</span>
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
