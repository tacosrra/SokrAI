import { useEffect, useState } from 'react';

import type { ProposalStartRequest, RecentSession, SessionAuditView } from './domain/contracts';
import { ApiError, fetchSessionAudit, replySession, startSession } from './lib/api';
import { readLastSessionId, readRecentSessions, persistRecentSession } from './lib/storage';
import { deriveSessionPresentation } from './lib/session-view';
import { ContinueSessionPanel } from './components/ContinueSessionPanel';
import { NewProposalPanel } from './components/NewProposalPanel';
import { RagInspectorPanel } from './components/RagInspectorPanel';
import { SessionWorkspace } from './components/SessionWorkspace';

type BannerTone = 'info' | 'success' | 'error';

interface BannerState {
  tone: BannerTone;
  text: string;
}

function mapError(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'Ha ocurrido un error inesperado en el frontend.';
  }

  if (error.errorCode === 'invalid_response_contract') {
    return 'La respuesta del backend no coincide con el contrato esperado. Revisa la versión de API, workflows o frontend.';
  }

  if (error.errorCode === 'session_not_found') {
    return 'No existe una sesión con ese `session_id`. Comprueba el valor o crea una nueva sesión.';
  }

  if (
    error.errorCode === 'ollama_request_failed' ||
    error.errorCode === 'invalid_model_json' ||
    error.errorCode === 'invalid_model_json_after_repair'
  ) {
    return 'El modelo local no pudo completar el turno. Revisa Ollama y vuelve a intentarlo.';
  }

  if (error.errorCode === 'request_timeout') {
    return 'La llamada ha superado el tiempo de espera. Revisa n8n, API y Ollama.';
  }

  if (error.errorCode === 'invalid_pdf_file' || error.errorCode === 'invalid_pdf_payload') {
    return 'El PDF no es válido para la v1. Usa un PDF con texto extraíble.';
  }

  return error.message;
}

function writeSessionToUrl(sessionId: string) {
  const url = new URL(window.location.href);
  url.searchParams.set('session', sessionId);
  window.history.replaceState({}, '', url);
}

export function App() {
  const [activeAudit, setActiveAudit] = useState<SessionAuditView | null>(null);
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const [defaultSessionId, setDefaultSessionId] = useState('');
  const [isSubmittingStart, setIsSubmittingStart] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [banner, setBanner] = useState<BannerState | null>(null);

  const [ragInspectorOpen, setRagInspectorOpen] = useState(
    () => typeof window !== 'undefined' && window.location.hash === '#rag',
  );

  function openRagInspector() {
    window.location.hash = 'rag';
  }

  function closeRagInspector() {
    setRagInspectorOpen(false);
    if (window.location.hash === '#rag') {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
  }

  useEffect(() => {
    const syncHash = (): void => {
      setRagInspectorOpen(window.location.hash === '#rag');
    };

    syncHash();
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, []);

  useEffect(() => {
    const recent = readRecentSessions();
    const fromUrl = new URL(window.location.href).searchParams.get('session') ?? '';
    const lastSessionId = fromUrl || readLastSessionId();

    setRecentSessions(recent);
    setDefaultSessionId(lastSessionId);

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
        text: mapError(error),
      });
    } finally {
      setIsLoadingSession(false);
    }
  }

  async function handleStart(payload: ProposalStartRequest) {
    setIsSubmittingStart(true);
    setBanner({
      tone: 'info',
      text: 'Creando sesión, ejecutando extracción inicial y esperando la primera pregunta del lane…',
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
        text: mapError(error),
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
      text: 'Enviando respuesta al workflow y esperando la actualización del estado…',
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
        text: mapError(error),
      });
    } finally {
      setIsReplying(false);
    }
  }

  const presentation = activeAudit ? deriveSessionPresentation(activeAudit) : null;

  return (
    <div className="app-shell">
      <div className="app-shell__ambient" />

      {ragInspectorOpen ? (
        <RagInspectorPanel onClose={closeRagInspector} />
      ) : (
        <>
      <header className="hero">
        <div className="hero__copy">
          <div className="hero__kicker">SokrAI v1</div>
          <h1>Consola de precomité para maduración de proyectos</h1>
          <p>
            Interfaz operativa para iniciar propuestas, inspeccionar el
            structured brief, responder la siguiente pregunta socrática y
            retomar sesiones persistidas sin salir del flujo real de la v1.
          </p>
          <div className="hero__tools">
            <button type="button" className="button button--ghost" onClick={openRagInspector}>
              Explorador RAG — ver texto recuperado de los documentos indexados
            </button>
            <span className="hero__tools-hint">Tab directo: añade <code>#rag</code> a la URL.</span>
          </div>
        </div>

        <div className="hero__rail">
          <div className="hero__note">
            <span>Backplane</span>
            <strong>n8n + Ollama + PostgreSQL + Fastify</strong>
          </div>
          <div className="hero__note">
            <span>Lane operativo</span>
            <strong>problem_definition_agent</strong>
          </div>
          <div className="hero__note">
            <span>Contratos</span>
            <strong>source of truth en `contracts/schemas`</strong>
          </div>
        </div>
      </header>

      {banner ? (
        <div className={`banner banner--${banner.tone}`}>{banner.text}</div>
      ) : null}

      <main className="main-grid">
        <NewProposalPanel isSubmitting={isSubmittingStart} onSubmit={handleStart} />
        <ContinueSessionPanel
          defaultSessionId={defaultSessionId}
          isLoading={isLoadingSession}
          recentSessions={recentSessions}
          onLoad={loadSession}
        />
      </main>

      {presentation && activeAudit ? (
        <SessionWorkspace
          audit={activeAudit}
          isReplying={isReplying}
          onReply={handleReply}
          presentation={presentation}
        />
      ) : (
        <section className="workspace workspace--empty">
          <div className="workspace-card">
            <div className="workspace-card__header">
              <h2>Sin sesión cargada todavía</h2>
              <p>
                Crea una propuesta nueva o recupera una sesión existente para
                inspeccionar brief, gaps, warnings y trazabilidad.
              </p>
            </div>
          </div>
        </section>
      )}

      <footer className="footer">
        <span>Demo local recomendada con `pnpm --filter @sokrai/web dev` o `docker compose up web`.</span>
        <span>Servicios esperados: `localhost:3000`, `localhost:3001`, `localhost:5678`.</span>
      </footer>
        </>
      )}
    </div>
  );
}
