import { useEffect, useState } from 'react';

import type { ProposalStartRequest, RecentSession, SessionAuditView } from './domain/contracts';
import { fetchSessionAudit, replySession, startSession } from './lib/api';
import { mapApiError } from './lib/feedback';
import { deriveSessionPresentation } from './lib/session-view';
import { readLastSessionId, readRecentSessions, persistRecentSession } from './lib/storage';
import { ContinueSessionPanel } from './components/ContinueSessionPanel';
import { NewProposalPanel } from './components/NewProposalPanel';
import { SessionStatePanel } from './components/SessionStatePanel';
import { SessionWorkspace } from './components/SessionWorkspace';
import { WorkflowLoadingPanel } from './components/WorkflowLoadingPanel';

type BannerTone = 'info' | 'success' | 'error';
type ModeView = 'start' | 'resume';

interface BannerState {
  tone: BannerTone;
  text: string;
}

interface ModeCardProps {
  activeMode: ModeView;
  callout: string;
  cta: string;
  description: string;
  mode: ModeView;
  onSelect: (mode: ModeView) => void;
  title: string;
}

function writeSessionToUrl(sessionId: string) {
  const url = new URL(window.location.href);

  if (sessionId) {
    url.searchParams.set('session', sessionId);
  } else {
    url.searchParams.delete('session');
  }

  window.history.replaceState({}, '', url);
}

function formatSessionDate(value: string) {
  return new Date(value).toLocaleString('es-ES', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function ModeCard({
  activeMode,
  callout,
  cta,
  description,
  mode,
  onSelect,
  title,
}: ModeCardProps) {
  const isSelected = activeMode === mode;

  return (
    <button
      className={`mode-card ${isSelected ? 'mode-card--selected' : ''}`}
      type="button"
      onClick={() => onSelect(mode)}
      aria-pressed={isSelected}
    >
      <div className="mode-card__check" aria-hidden="true">
        <span />
      </div>

      <div className="mode-card__icon" aria-hidden="true">
        {mode === 'start' ? (
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M4 6.75A2.75 2.75 0 0 1 6.75 4h6.5A2.75 2.75 0 0 1 16 6.75v2.5A2.75 2.75 0 0 1 13.25 12h-3.7l-3.07 2.6a.75.75 0 0 1-1.23-.57V12.6A2.74 2.74 0 0 1 4 10.25v-3.5Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M10 16.75h3.45l3.08 2.59a.75.75 0 0 0 1.22-.57V16.6A2.74 2.74 0 0 0 20 14.25v-3.5A2.75 2.75 0 0 0 17.25 8H17"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M12 5.25a6.75 6.75 0 1 0 6.08 9.67"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <path
              d="M12 8.5V12l2.5 1.75"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M15.5 5.5H19v3.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M19 5.5 15.5 9"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        )}
      </div>

      <div className="mode-card__body">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>

      <div className="mode-card__footer">
        <span className="mode-card__chip">{callout}</span>
        <span className="mode-card__cta">{cta}</span>
      </div>
    </button>
  );
}

export function App() {
  const [activeAudit, setActiveAudit] = useState<SessionAuditView | null>(null);
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const [defaultSessionId, setDefaultSessionId] = useState('');
  const [sessionLookupId, setSessionLookupId] = useState('');
  const [selectedMode, setSelectedMode] = useState<ModeView>('start');
  const [isSubmittingStart, setIsSubmittingStart] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [banner, setBanner] = useState<BannerState | null>(null);

  useEffect(() => {
    const recent = readRecentSessions();
    const fromUrl = new URL(window.location.href).searchParams.get('session') ?? '';
    const lastSessionId = fromUrl || readLastSessionId();

    setRecentSessions(recent);
    setDefaultSessionId(lastSessionId);
    setSessionLookupId(lastSessionId);
    setSelectedMode(lastSessionId ? 'resume' : 'start');

    if (fromUrl) {
      void loadSession(fromUrl, {
        successMessage: 'Sesión cargada desde la URL.',
        skipBannerOnStart: true,
      });
    }
  }, []);

  async function loadSession(
    sessionId: string,
    options?: { successMessage?: string; skipBannerOnStart?: boolean },
  ) {
    if (!options?.skipBannerOnStart) {
      setBanner({
        tone: 'info',
        text: `Recuperando la sesión ${sessionId} desde la API de inspección…`,
      });
    }

    setIsLoadingSession(true);

    try {
      const audit = await fetchSessionAudit(sessionId);
      setActiveAudit(audit);
      setRecentSessions(persistRecentSession(audit));
      setDefaultSessionId(audit.session.id);
      setSessionLookupId(audit.session.id);
      writeSessionToUrl(audit.session.id);
      setBanner({
        tone: 'success',
        text:
          options?.successMessage ??
          `Sesión ${audit.session.id} cargada con ${audit.turns.length} turnos persistidos.`,
      });
    } catch (error) {
      setBanner({
        tone: 'error',
        text: mapApiError(error),
      });
    } finally {
      setIsLoadingSession(false);
    }
  }

  async function handleStart(payload: ProposalStartRequest) {
    setIsSubmittingStart(true);
    setBanner({
      tone: 'info',
      text: 'Propuesta enviada. Preparando structured brief y primer diagnóstico del lane…',
    });

    try {
      const result = await startSession(payload);
      await loadSession(result.session_id, {
        successMessage: `Sesión ${result.session_id} creada. Structured brief y siguiente pregunta listos.`,
        skipBannerOnStart: true,
      });
    } catch (error) {
      setBanner({
        tone: 'error',
        text: mapApiError(error),
      });
    } finally {
      setIsSubmittingStart(false);
    }
  }

  async function handleReply(answer: string) {
    if (!activeAudit) {
      return;
    }

    setIsReplying(true);
    setBanner({
      tone: 'info',
      text: 'Respuesta enviada. Generando el siguiente diagnóstico y actualizando el estado de la sesión…',
    });

    try {
      const result = await replySession({
        session_id: activeAudit.session.id,
        answer,
      });

      await loadSession(result.session_id, {
        successMessage: `Turno procesado. Agent status: ${result.agent_status}.`,
        skipBannerOnStart: true,
      });
    } catch (error) {
      setBanner({
        tone: 'error',
        text: mapApiError(error),
      });
    } finally {
      setIsReplying(false);
    }
  }

  function handleStartFreshSession() {
    setActiveAudit(null);
    setBanner(null);
    setDefaultSessionId('');
    setSessionLookupId('');
    setSelectedMode('start');
    writeSessionToUrl('');
  }

  async function handleLoadFromSidebar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedSessionId = sessionLookupId.trim();

    if (!trimmedSessionId) {
      setBanner({
        tone: 'error',
        text: 'Indica un `session_id` válido para reabrir una sesión.',
      });
      return;
    }

    await loadSession(trimmedSessionId);
  }

  const presentation = activeAudit ? deriveSessionPresentation(activeAudit) : null;

  if (presentation && activeAudit) {
    return (
      <div className="app-shell app-shell--workspace">
        <div className="app-shell__ambient" />

        {banner ? <div className={`flash-banner flash-banner--${banner.tone}`}>{banner.text}</div> : null}

        <main className="workspace-shell">
          <aside className="workspace-rail">
            <div className="workspace-rail__brand">
              <div className="brand-mark">S</div>
              <div className="brand-copy">
                <span className="brand-copy__eyebrow">SokrAI v1</span>
                <strong>Problem Definition Console</strong>
                <span className="brand-copy__meta">Inspirado en el shell conversacional de Stitch.</span>
              </div>
            </div>

            <section className="workspace-rail__section workspace-rail__section--hero">
              <span className="panel__eyebrow">Sesión activa</span>
              <h2>{presentation.projectTitle}</h2>
              <p>{presentation.progress.description}</p>

              <div className="rail-kpis">
                <article>
                  <strong>{presentation.progress.percent}%</strong>
                  <span>madurez</span>
                </article>
                <article>
                  <strong>{activeAudit.turns.length}</strong>
                  <span>turnos</span>
                </article>
              </div>

              <button className="button button--primary" type="button" onClick={handleStartFreshSession}>
                Nueva propuesta
              </button>
            </section>

            <section className="workspace-rail__section">
              <div className="workspace-rail__heading">
                <span className="panel__eyebrow">Acceso rápido</span>
                <h3>Abrir otra sesión</h3>
              </div>

              <form className="workspace-rail__form" onSubmit={handleLoadFromSidebar}>
                <label className="field">
                  <span className="field__label">Session ID</span>
                  <input
                    className="field__control field__control--code"
                    type="text"
                    value={sessionLookupId}
                    onChange={(event) => setSessionLookupId(event.target.value)}
                    placeholder="85cf3299-4fc3-4770-9944-6049d97e7b59"
                    disabled={isLoadingSession}
                  />
                </label>

                <button className="button button--secondary" type="submit" disabled={isLoadingSession}>
                  {isLoadingSession ? 'Consultando…' : 'Abrir sesión'}
                </button>
              </form>
            </section>

            <section className="workspace-rail__section workspace-rail__section--list">
              <div className="workspace-rail__heading">
                <span className="panel__eyebrow">Recientes</span>
                <h3>{recentSessions.length} conversaciones</h3>
              </div>

              {recentSessions.length === 0 ? (
                <div className="empty-state">
                  Aún no hay sesiones recientes guardadas en este navegador.
                </div>
              ) : (
                <div className="session-rail-list">
                  {recentSessions.map((session) => (
                    <button
                      key={session.sessionId}
                      className={`session-rail-item ${
                        presentation.sessionId === session.sessionId ? 'session-rail-item--active' : ''
                      }`}
                      type="button"
                      onClick={() => void loadSession(session.sessionId)}
                      disabled={isLoadingSession}
                    >
                      <div className="session-rail-item__header">
                        <strong>{session.projectTitle}</strong>
                        <span>{formatSessionDate(session.updatedAt)}</span>
                      </div>
                      <p>{session.goal}</p>
                      <div className="session-rail-item__meta">
                        <span>{session.status.replaceAll('_', ' ')}</span>
                        <span>{session.currentQuestion || 'Sin pregunta abierta'}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </aside>

          <section className="workspace-main">
            <SessionWorkspace
              audit={activeAudit}
              isReplying={isReplying}
              onReply={handleReply}
              presentation={presentation}
            />
          </section>

          <aside className="workspace-insights">
            <SessionStatePanel audit={activeAudit} presentation={presentation} />
          </aside>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="app-shell__ambient" />

      <header className="app-topbar">
        <div className="app-topbar__brand">
          <div className="brand-mark">S</div>
          <div className="brand-copy">
            <span className="brand-copy__eyebrow">SokrAI v1</span>
            <strong>Problem Definition Console</strong>
            <span className="brand-copy__meta">Intake, structured brief y entrevista resumible.</span>
          </div>
        </div>

        <div className="topbar-chip">UI alineada con "Interview Mode Selection"</div>
      </header>

      {banner ? <div className={`flash-banner flash-banner--${banner.tone}`}>{banner.text}</div> : null}

      <main className="mode-page">
        <nav className="mode-breadcrumbs" aria-label="breadcrumbs">
          <span>SokrAI</span>
          <span>/</span>
          <span>Problem Definition</span>
          <span>/</span>
          <span>Interview mode</span>
        </nav>

        <section className="mode-hero">
          <div className="mode-hero__visual" aria-hidden="true">
            <div className="mode-hero__pulse" />
            <div className="mode-hero__orb">AI</div>
            <div className="mode-hero__presence">
              <span />
            </div>
          </div>

          <span className="panel__eyebrow">AI evaluator ready</span>
          <h1>Selecciona cómo abrir la entrevista de maduración</h1>
          <p>
            La propuesta nueva crea la sesión y deja la primera pregunta lista. Si ya tienes
            un `session_id`, puedes reabrir el chat, los snapshots y el estado persistido sin perder el contexto.
          </p>
        </section>

        <section className="mode-grid" aria-label="modes">
          <ModeCard
            activeMode={selectedMode}
            callout="Recomendado para contexto nuevo y PDFs"
            cta="Crear sesión"
            description="Empieza con una propuesta estructurada y deja que la v1 construya el brief inicial antes del primer turno socrático."
            mode="start"
            onSelect={setSelectedMode}
            title="Nueva propuesta"
          />

          <ModeCard
            activeMode={selectedMode}
            callout={defaultSessionId ? 'Última sesión detectada automáticamente' : 'Ideal para demos y reanudación'}
            cta="Abrir sesión"
            description="Retoma una conversación existente con su historial real de turnos, snapshots, runs y checklist del problema."
            mode="resume"
            onSelect={setSelectedMode}
            title="Continuar sesión"
          />
        </section>

        <section className="detail-shell">
          {isSubmittingStart ? (
            <WorkflowLoadingPanel kind="start" />
          ) : selectedMode === 'start' ? (
            <NewProposalPanel isSubmitting={isSubmittingStart} onSubmit={handleStart} />
          ) : (
            <ContinueSessionPanel
              defaultSessionId={defaultSessionId}
              isLoading={isLoadingSession}
              recentSessions={recentSessions}
              onLoad={loadSession}
            />
          )}
        </section>

        <div className="trust-note">
          Todas las sesiones quedan auditadas por `session_id` y el flujo está pensado para trabajo operable:
          estado claro, foco visible y reanudación rápida.
        </div>
      </main>
    </div>
  );
}
