import { useEffect, useState } from 'react';

import type { BasicAlphaReport, ProposalStartRequest, RecentSession, SessionAuditView } from './domain/contracts';
import {
  ApiError,
  fetchBasicAlphaReport,
  fetchRequestExecution,
  recoverRequestExecution,
  fetchSessionAudit,
  replyDataAiPrivacy,
  replyMedicalDeviceTriage,
  replySolution,
  replySession,
  startDataAiPrivacy,
  startMedicalDeviceTriage,
  startSolution,
  startSession,
} from './lib/api';
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

const START_SESSION_TIMEOUT_MS = readTimeout('VITE_START_SESSION_TIMEOUT_MS', 960000);
const REPLY_SESSION_TIMEOUT_MS = readTimeout('VITE_REPLY_SESSION_TIMEOUT_MS', 540000);
const REQUEST_RECOVERY_TIMEOUT_MS = readTimeout(
  'VITE_REQUEST_RECOVERY_TIMEOUT_MS',
  Math.max(START_SESSION_TIMEOUT_MS, REPLY_SESSION_TIMEOUT_MS, 960000),
);
const REQUEST_RECOVERY_POLL_INTERVAL_MS = 4000;
const ACTIVE_RECOVERY_AFTER_MS = readTimeout('VITE_ACTIVE_RECOVERY_AFTER_MS', 60000);
const MAX_CONSECUTIVE_RECOVERY_TRANSPORT_ERRORS = 5;

type RecoverableRequestKind =
  | 'proposal_start'
  | 'proposal_reply'
  | 'solution_start'
  | 'solution_reply'
  | 'data_ai_privacy_start'
  | 'data_ai_privacy_reply'
  | 'medical_device_triage_start'
  | 'medical_device_triage_reply';

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

function createClientRequestId(
  prefix:
    | 'start'
    | 'reply'
    | 'solution-start'
    | 'solution-reply'
    | 'data-ai-privacy-start'
    | 'data-ai-privacy-reply'
    | 'medical-device-triage-start'
    | 'medical-device-triage-reply',
): string {
  return `web-${prefix}-${crypto.randomUUID()}`;
}

function isRecoverableWorkflowDeliveryError(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    (
      error.errorCode === 'request_timeout' ||
      error.errorCode === 'invalid_response_contract' ||
      error.errorCode === 'unexpected_html_response'
    )
  );
}

function toApiErrorFromRecoveredRequest(status: {
  request_id: string;
  error_code?: string;
  safe_message?: string;
  retryable?: boolean;
  session_id?: string;
}): ApiError {
  return new ApiError(
    status.safe_message ?? 'The workflow failed before returning a final response',
    status.retryable ? 503 : 502,
    status.error_code ?? 'request_failed',
    status.retryable ?? false,
    status.request_id,
    status.session_id,
  );
}

function hasCompletedMedicalDeviceTriageRequest(audit: SessionAuditView, requestId: string): boolean {
  return audit.runs.some((run) =>
    run.request_id === requestId &&
    run.run_purpose === 'medical_device_triage' &&
    run.status === 'completed',
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function readTimeout(name: string, fallback: number): number {
  const raw = (import.meta.env as Record<string, string | undefined>)[name];

  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function formatSessionDate(value: string) {
  return new Date(value).toLocaleString('es-ES', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function hasDataAiPrivacyRecoveryArtifacts(audit: SessionAuditView): boolean {
  const presentation = deriveSessionPresentation(audit);

  return Boolean(
    presentation.dataAiPrivacyModuleChat ||
      presentation.currentDataAiPrivacyQuestion ||
      presentation.latestDataAiPrivacySection,
  );
}

function hasMedicalDeviceTriageRecoveryArtifacts(audit: SessionAuditView): boolean {
  const presentation = deriveSessionPresentation(audit);

  return Boolean(
    presentation.medicalDeviceTriageModuleChat ||
      presentation.currentMedicalDeviceTriageQuestion ||
      presentation.latestMedicalDeviceTriageSection,
  );
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
  const [activeReport, setActiveReport] = useState<BasicAlphaReport | null>(null);
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
    options?: { successMessage?: string; skipBannerOnStart?: boolean; suppressSuccessBanner?: boolean },
  ): Promise<SessionAuditView | null> {
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

      try {
        setActiveReport(await loadReportIfAvailable(audit.session.id));
      } catch {
        setActiveReport(null);
      }

      if (!options?.suppressSuccessBanner) {
        setBanner({
          tone: 'success',
          text:
            options?.successMessage ??
            `Sesión ${audit.session.id} cargada con ${audit.turns.length} turnos persistidos.`,
        });
      }

      return audit;
    } catch (error) {
      setActiveReport(null);
      setBanner({
        tone: 'error',
        text: mapApiError(error),
      });

      return null;
    } finally {
      setIsLoadingSession(false);
    }
  }

  async function loadReportIfAvailable(sessionId: string): Promise<BasicAlphaReport | null> {
    try {
      return await fetchBasicAlphaReport(sessionId);
    } catch (error) {
      if (error instanceof ApiError && error.errorCode === 'report_not_found') {
        return null;
      }

      throw error;
    }
  }

  async function recoverTimedOutRequest(
    requestId: string,
    requestKind: RecoverableRequestKind,
  ): Promise<string> {
    const deadline = Date.now() + REQUEST_RECOVERY_TIMEOUT_MS;
    const activeRecoveryAfter = Date.now() + ACTIVE_RECOVERY_AFTER_MS;
    let consecutiveTransportErrors = 0;
    let activeRecoveryTriggered = false;

    while (Date.now() < deadline) {
      try {
        const status = await fetchRequestExecution(requestId);
        consecutiveTransportErrors = 0;

        if (status.request_kind !== requestKind && status.request_kind !== 'unknown') {
          throw new ApiError(
            'The recovered workflow state does not match the expected request kind',
            502,
            'invalid_request_recovery',
            false,
            requestId,
            status.session_id,
          );
        }

        if (status.status === 'completed' && status.session_id) {
          return status.session_id;
        }

        if (status.status === 'failed') {
          throw toApiErrorFromRecoveredRequest(status);
        }

        if (
          !activeRecoveryTriggered &&
          Date.now() >= activeRecoveryAfter &&
          (status.status === 'pending' || status.status === 'not_found')
        ) {
          activeRecoveryTriggered = true;

          const recoveredStatus = await recoverRequestExecution(requestId);

          if (
            recoveredStatus.request_kind !== requestKind &&
            recoveredStatus.request_kind !== 'unknown'
          ) {
            throw new ApiError(
              'The active recovery response does not match the expected request kind',
              502,
              'invalid_request_recovery',
              false,
              requestId,
              recoveredStatus.session_id,
            );
          }

          if (recoveredStatus.status === 'completed' && recoveredStatus.session_id) {
            return recoveredStatus.session_id;
          }

          if (recoveredStatus.status === 'failed') {
            throw toApiErrorFromRecoveredRequest(recoveredStatus);
          }

          if (recoveredStatus.status === 'not_found') {
            throw new ApiError(
              'The workflow request could not be found after active recovery',
              404,
              'request_not_found_after_recovery',
              false,
              requestId,
            );
          }
        }
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.errorCode !== 'network_error' &&
          error.errorCode !== 'request_timeout' &&
          error.errorCode !== 'invalid_response_contract' &&
          error.errorCode !== 'unexpected_html_response' &&
          error.errorCode !== 'http_error'
        ) {
          throw error;
        }

        consecutiveTransportErrors += 1;

        if (consecutiveTransportErrors >= MAX_CONSECUTIVE_RECOVERY_TRANSPORT_ERRORS) {
          throw error;
        }
      }

      await wait(REQUEST_RECOVERY_POLL_INTERVAL_MS);
    }

    throw new ApiError(
      'The workflow did not expose a recoverable final state before the recovery window expired',
      504,
      'request_recovery_timeout',
      true,
      requestId,
    );
  }

  async function handleStart(payload: ProposalStartRequest) {
    const requestId = createClientRequestId('start');
    setIsSubmittingStart(true);
    setBanner({
      tone: 'info',
      text: 'Propuesta enviada. Preparando structured brief y primer diagnóstico del lane…',
    });

    try {
      const result = await startSession({
        ...payload,
        request_id: requestId,
      });
      await loadSession(result.session_id, {
        successMessage: `Sesión ${result.session_id} creada. Structured brief y siguiente pregunta listos.`,
        skipBannerOnStart: true,
      });
    } catch (error) {
      if (isRecoverableWorkflowDeliveryError(error)) {
        setBanner({
          tone: 'info',
          text:
            error.errorCode === 'request_timeout'
              ? `La llamada inicial venció en el navegador. Recuperando el resultado del workflow para request_id ${requestId}…`
              : `La respuesta inicial llegó con un formato inesperado. Intentando recuperar la sesión real con request_id ${requestId}…`,
        });

        try {
          const sessionId = await recoverTimedOutRequest(requestId, 'proposal_start');
          await loadSession(sessionId, {
            successMessage: `Sesión ${sessionId} recuperada tras completar el workflow fuera del tiempo de espera inicial.`,
            skipBannerOnStart: true,
          });
          return;
        } catch (recoveryError) {
          setBanner({
            tone: 'error',
            text: mapApiError(recoveryError),
          });
          return;
        }
      }

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

    const requestId = createClientRequestId('reply');
    setIsReplying(true);
    setBanner({
      tone: 'info',
      text: 'Respuesta enviada. Generando el siguiente diagnóstico y actualizando el estado de la sesión…',
    });

    try {
      const result = await replySession({
        request_id: requestId,
        session_id: activeAudit.session.id,
        answer,
      });

      await loadSession(result.session_id, {
        successMessage: `Turno procesado. Agent status: ${result.agent_status}.`,
        skipBannerOnStart: true,
      });
    } catch (error) {
      if (isRecoverableWorkflowDeliveryError(error)) {
        setBanner({
          tone: 'info',
          text:
            error.errorCode === 'request_timeout'
              ? `La llamada del turno venció en el navegador. Recuperando el resultado del workflow para request_id ${requestId}…`
              : `La respuesta del turno llegó con un formato inesperado. Intentando recuperar el estado real con request_id ${requestId}…`,
        });

        try {
          const sessionId = await recoverTimedOutRequest(requestId, 'proposal_reply');
          await loadSession(sessionId, {
            successMessage: 'Turno recuperado tras completar el workflow fuera del tiempo de espera inicial.',
            skipBannerOnStart: true,
          });
          return;
        } catch (recoveryError) {
          try {
            await loadSession(activeAudit.session.id, {
              successMessage: 'Se recuperó el estado de la sesión directamente desde la API tras expirar la llamada del navegador.',
              skipBannerOnStart: true,
            });
            return;
          } catch {
            // Preserve the original recovery error when the direct session refresh also fails.
          }

          setBanner({
            tone: 'error',
            text: mapApiError(recoveryError),
          });
          return;
        }
      }

      setBanner({
        tone: 'error',
        text: mapApiError(error),
      });
    } finally {
      setIsReplying(false);
    }
  }

  async function handleStartSolution() {
    if (!activeAudit) {
      return;
    }

    const requestId = createClientRequestId('solution-start');
    setIsReplying(true);
    setBanner({
      tone: 'info',
      text: 'Iniciando el carril de solución y generando la primera pregunta…',
    });

    try {
      const result = await startSolution({
        request_id: requestId,
        session_id: activeAudit.session.id,
      });

      await loadSession(result.session_id, {
        successMessage: `Carril de solución iniciado. Agent status: ${result.agent_status}.`,
        skipBannerOnStart: true,
      });
    } catch (error) {
      if (isRecoverableWorkflowDeliveryError(error)) {
        setBanner({
          tone: 'info',
          text:
            error.errorCode === 'request_timeout'
              ? `La llamada para iniciar solución venció en el navegador. Recuperando el resultado del workflow para request_id ${requestId}…`
              : `La respuesta de inicio de solución llegó con un formato inesperado. Intentando recuperar el estado real con request_id ${requestId}…`,
        });

        try {
          const sessionId = await recoverTimedOutRequest(requestId, 'solution_start');
          await loadSession(sessionId, {
            successMessage: 'Carril de solución recuperado tras completar el workflow fuera del tiempo de espera inicial.',
            skipBannerOnStart: true,
          });
          return;
        } catch (recoveryError) {
          try {
            await loadSession(activeAudit.session.id, {
              successMessage: 'Se recuperó el estado de la sesión directamente desde la API tras expirar el inicio de solución.',
              skipBannerOnStart: true,
            });
            return;
          } catch {
            // Preserve the original recovery error when the direct session refresh also fails.
          }

          setBanner({
            tone: 'error',
            text: mapApiError(recoveryError),
          });
          return;
        }
      }

      setBanner({
        tone: 'error',
        text: mapApiError(error),
      });
    } finally {
      setIsReplying(false);
    }
  }

  async function handleSolutionReply(answer: string) {
    if (!activeAudit) {
      return;
    }

    const requestId = createClientRequestId('solution-reply');
    setIsReplying(true);
    setBanner({
      tone: 'info',
      text: 'Respuesta de solución enviada. Actualizando el carril y sus fuentes internas…',
    });

    try {
      const result = await replySolution({
        request_id: requestId,
        session_id: activeAudit.session.id,
        answer,
      });

      await loadSession(result.session_id, {
        successMessage: `Turno de solución procesado. Agent status: ${result.agent_status}.`,
        skipBannerOnStart: true,
      });
    } catch (error) {
      if (isRecoverableWorkflowDeliveryError(error)) {
        setBanner({
          tone: 'info',
          text:
            error.errorCode === 'request_timeout'
              ? `La llamada del turno de solución venció en el navegador. Recuperando el resultado del workflow para request_id ${requestId}…`
              : `La respuesta del turno de solución llegó con un formato inesperado. Intentando recuperar el estado real con request_id ${requestId}…`,
        });

        try {
          const sessionId = await recoverTimedOutRequest(requestId, 'solution_reply');
          await loadSession(sessionId, {
            successMessage: 'Turno de solución recuperado tras completar el workflow fuera del tiempo de espera inicial.',
            skipBannerOnStart: true,
          });
          return;
        } catch (recoveryError) {
          try {
            await loadSession(activeAudit.session.id, {
              successMessage: 'Se recuperó el estado de la sesión directamente desde la API tras expirar el turno de solución.',
              skipBannerOnStart: true,
            });
            return;
          } catch {
            // Preserve the original recovery error when the direct session refresh also fails.
          }

          setBanner({
            tone: 'error',
            text: mapApiError(recoveryError),
          });
          return;
        }
      }

      setBanner({
        tone: 'error',
        text: mapApiError(error),
      });
    } finally {
      setIsReplying(false);
    }
  }

  async function handleStartDataAiPrivacy() {
    if (!activeAudit) {
      return;
    }

    const requestId = createClientRequestId('data-ai-privacy-start');
    setIsReplying(true);
    setBanner({
      tone: 'info',
      text: 'Iniciando el modulo de datos/IA/privacidad y generando la primera pregunta…',
    });

    try {
      const result = await startDataAiPrivacy({
        request_id: requestId,
        session_id: activeAudit.session.id,
        profile_id: 'hospital_clinic_v1',
      });

      await loadSession(result.session_id, {
        successMessage: `Modulo datos/IA/privacidad iniciado. Agent status: ${result.agent_status}.`,
        skipBannerOnStart: true,
      });
    } catch (error) {
      if (isRecoverableWorkflowDeliveryError(error)) {
        setBanner({
          tone: 'info',
          text:
            error.errorCode === 'request_timeout'
              ? `La llamada para iniciar datos/IA/privacidad vencio en el navegador. Recuperando el resultado del workflow para request_id ${requestId}…`
              : `La respuesta de inicio de datos/IA/privacidad llego con un formato inesperado. Intentando recuperar el estado real con request_id ${requestId}…`,
        });

        try {
          const sessionId = await recoverTimedOutRequest(requestId, 'data_ai_privacy_start');
          await loadSession(sessionId, {
            successMessage: 'Modulo datos/IA/privacidad recuperado tras completar el workflow fuera del tiempo de espera inicial.',
            skipBannerOnStart: true,
          });
          return;
        } catch (recoveryError) {
          try {
            const recoveredAudit = await loadSession(activeAudit.session.id, {
              skipBannerOnStart: true,
              suppressSuccessBanner: true,
            });

            if (recoveredAudit && hasDataAiPrivacyRecoveryArtifacts(recoveredAudit)) {
              setBanner({
                tone: 'success',
                text: 'Se recupero el estado de datos/IA/privacidad directamente desde la API tras expirar el inicio.',
              });
              return;
            }
          } catch {
            // Preserve the original recovery error when the direct session refresh also fails.
          }

          setBanner({
            tone: 'error',
            text: mapApiError(recoveryError),
          });
          return;
        }
      }

      setBanner({
        tone: 'error',
        text: mapApiError(error),
      });
    } finally {
      setIsReplying(false);
    }
  }

  async function handleDataAiPrivacyReply(answer: string) {
    if (!activeAudit) {
      return;
    }

    const requestId = createClientRequestId('data-ai-privacy-reply');
    setIsReplying(true);
    setBanner({
      tone: 'info',
      text: 'Respuesta de datos/IA/privacidad enviada. Actualizando gaps, incertidumbre y revision humana…',
    });

    try {
      const result = await replyDataAiPrivacy({
        request_id: requestId,
        session_id: activeAudit.session.id,
        answer,
      });

      await loadSession(result.session_id, {
        successMessage: `Turno datos/IA/privacidad procesado. Agent status: ${result.agent_status}.`,
        skipBannerOnStart: true,
      });
    } catch (error) {
      if (isRecoverableWorkflowDeliveryError(error)) {
        setBanner({
          tone: 'info',
          text:
            error.errorCode === 'request_timeout'
              ? `La llamada del turno datos/IA/privacidad vencio en el navegador. Recuperando el resultado del workflow para request_id ${requestId}…`
              : `La respuesta del turno datos/IA/privacidad llego con un formato inesperado. Intentando recuperar el estado real con request_id ${requestId}…`,
        });

        try {
          const sessionId = await recoverTimedOutRequest(requestId, 'data_ai_privacy_reply');
          await loadSession(sessionId, {
            successMessage: 'Turno datos/IA/privacidad recuperado tras completar el workflow fuera del tiempo de espera inicial.',
            skipBannerOnStart: true,
          });
          return;
        } catch (recoveryError) {
          try {
            await loadSession(activeAudit.session.id, {
              successMessage: 'Se recupero el estado de la sesion directamente desde la API tras expirar el turno datos/IA/privacidad.',
              skipBannerOnStart: true,
            });
            return;
          } catch {
            // Preserve the original recovery error when the direct session refresh also fails.
          }

          setBanner({
            tone: 'error',
            text: mapApiError(recoveryError),
          });
          return;
        }
      }

      setBanner({
        tone: 'error',
        text: mapApiError(error),
      });
    } finally {
      setIsReplying(false);
    }
  }

  async function handleStartMedicalDeviceTriage() {
    if (!activeAudit) {
      return;
    }

    const requestId = createClientRequestId('medical-device-triage-start');
    setIsReplying(true);
    setBanner({
      tone: 'info',
      text: 'Iniciando medical-device triage para registrar gaps/questions/uncertainty…',
    });

    try {
      const result = await startMedicalDeviceTriage({
        request_id: requestId,
        session_id: activeAudit.session.id,
        profile_id: 'hospital_clinic_v1',
      });

      await loadSession(result.session_id, {
        successMessage: `Medical-device triage procesado. Agent status: ${result.agent_status}.`,
        skipBannerOnStart: true,
      });
    } catch (error) {
      if (isRecoverableWorkflowDeliveryError(error)) {
        setBanner({
          tone: 'info',
          text:
            error.errorCode === 'request_timeout'
              ? `La llamada para iniciar medical-device triage vencio en el navegador. Recuperando el resultado del workflow para request_id ${requestId}…`
              : `La respuesta de inicio de medical-device triage llego con un formato inesperado. Intentando recuperar el estado real con request_id ${requestId}…`,
        });

        try {
          const sessionId = await recoverTimedOutRequest(requestId, 'medical_device_triage_start');
          await loadSession(sessionId, {
            successMessage: 'Medical-device triage recuperado tras completar el workflow fuera del tiempo de espera inicial.',
            skipBannerOnStart: true,
          });
          return;
        } catch (recoveryError) {
          try {
            const recoveredAudit = await loadSession(activeAudit.session.id, {
              skipBannerOnStart: true,
              suppressSuccessBanner: true,
            });

            if (recoveredAudit && hasMedicalDeviceTriageRecoveryArtifacts(recoveredAudit)) {
              setBanner({
                tone: 'success',
                text: 'Se recupero el estado de medical-device triage directamente desde la API tras expirar el inicio.',
              });
              return;
            }
          } catch {
            // Preserve the original recovery error when the direct session refresh also fails.
          }

          setBanner({
            tone: 'error',
            text: mapApiError(recoveryError),
          });
          return;
        }
      }

      setBanner({
        tone: 'error',
        text: mapApiError(error),
      });
    } finally {
      setIsReplying(false);
    }
  }

  async function handleMedicalDeviceTriageReply(answer: string) {
    if (!activeAudit) {
      return;
    }

    const requestId = createClientRequestId('medical-device-triage-reply');
    setIsReplying(true);
    setBanner({
      tone: 'info',
      text: 'Respuesta de medical-device triage enviada. Actualizando gaps/questions/uncertainty…',
    });

    try {
      const result = await replyMedicalDeviceTriage({
        request_id: requestId,
        session_id: activeAudit.session.id,
        answer,
      });

      await loadSession(result.session_id, {
        successMessage: `Turno medical-device triage procesado. Agent status: ${result.agent_status}.`,
        skipBannerOnStart: true,
      });
    } catch (error) {
      if (isRecoverableWorkflowDeliveryError(error)) {
        setBanner({
          tone: 'info',
          text:
            error.errorCode === 'request_timeout'
              ? `La llamada del turno medical-device triage vencio en el navegador. Recuperando el resultado del workflow para request_id ${requestId}…`
              : `La respuesta del turno medical-device triage llego con un formato inesperado. Intentando recuperar el estado real con request_id ${requestId}…`,
        });

        try {
          const sessionId = await recoverTimedOutRequest(requestId, 'medical_device_triage_reply');
          await loadSession(sessionId, {
            successMessage: 'Turno medical-device triage recuperado tras completar el workflow fuera del tiempo de espera inicial.',
            skipBannerOnStart: true,
          });
          return;
        } catch (recoveryError) {
          try {
            const recoveredAudit = await loadSession(activeAudit.session.id, {
              skipBannerOnStart: true,
              suppressSuccessBanner: true,
            });

            if (recoveredAudit && hasCompletedMedicalDeviceTriageRequest(recoveredAudit, requestId)) {
              setBanner({
                tone: 'success',
                text: 'Se recupero el estado de medical-device triage directamente desde la API tras expirar el turno.',
              });
              return;
            }
          } catch {
            // Preserve the original recovery error when the direct session refresh also fails.
          }

          setBanner({
            tone: 'error',
            text: mapApiError(recoveryError),
          });
          return;
        }
      }

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
    setActiveReport(null);
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
              report={activeReport}
              isReplying={isReplying}
              onReply={handleReply}
              onSolutionReply={handleSolutionReply}
              onDataAiPrivacyReply={handleDataAiPrivacyReply}
              onMedicalDeviceTriageReply={handleMedicalDeviceTriageReply}
              onStartSolution={handleStartSolution}
              onStartDataAiPrivacy={handleStartDataAiPrivacy}
              onStartMedicalDeviceTriage={handleStartMedicalDeviceTriage}
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
              onLoad={async (sessionId) => {
                await loadSession(sessionId);
              }}
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
