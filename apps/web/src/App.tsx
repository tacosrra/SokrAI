import { useEffect, useRef, useState } from 'react';

import type { BasicAlphaReport, ProposalStartRequest, RecentSession, SessionAuditView } from './domain/contracts';
import {
  ApiError,
  composeBasicAlphaReport,
  downloadBasicAlphaReportPdf,
  fetchBasicAlphaReport,
  fetchRequestExecution,
  recoverRequestExecution,
  fetchSessionAudit,
  replyDataAiPrivacy,
  replyMedicalDeviceTriage,
  replyResourcesPilotViability,
  replySolution,
  replySession,
  startDataAiPrivacy,
  startMedicalDeviceTriage,
  startResourcesPilotViability,
  startSolution,
  startSession,
} from './lib/api';
import { saveBlobDownload } from './lib/download';
import { mapApiError } from './lib/feedback';
import { deriveSessionPresentation, type PhaseId } from './lib/session-view';
import { readLastSessionId, readRecentSessions, persistRecentSession } from './lib/storage';
import { ContinueSessionPanel } from './components/ContinueSessionPanel';
import { NewProposalPanel } from './components/NewProposalPanel';
import { SessionStatePanel } from './components/SessionStatePanel';
import { SessionWorkspace } from './components/SessionWorkspace';
import { WorkflowLoadingPanel } from './components/WorkflowLoadingPanel';
import { WorkspaceTopBar } from './components/WorkspaceTopBar';
import { PhaseRail } from './components/PhaseRail';
import { SessionMenu } from './components/SessionMenu';
import { SokrAiLogo } from './components/SokrAiLogoLoader';

type BannerTone = 'info' | 'success' | 'error';
type ModeView = 'start' | 'resume';

interface BannerState {
  tone: BannerTone;
  text: string;
}

const TOAST_DISMISS_MS = 6500;
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
  | 'medical_device_triage_reply'
  | 'resources_pilot_viability_start'
  | 'resources_pilot_viability_reply';

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
    | 'medical-device-triage-reply'
    | 'resources-pilot-viability-start'
    | 'resources-pilot-viability-reply'
    | 'report-compose',
): string {
  return `web-${prefix}-${crypto.randomUUID()}`;
}

function canComposeReportFromAudit(audit: SessionAuditView): boolean {
  const presentation = deriveSessionPresentation(audit);
  const reportPhase = presentation.phaseProgress.steps.find((step) => step.id === 'report');

  return Boolean(
    reportPhase &&
      (reportPhase.status === 'current' || reportPhase.status === 'ready') &&
      reportPhase.primaryAction === 'prepare_report',
  );
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

function hasCompletedResourcesPilotViabilityRequest(audit: SessionAuditView, requestId: string): boolean {
  return audit.runs.some((run) =>
    run.request_id === requestId &&
    run.run_purpose === 'resources_pilot_viability' &&
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

function normalizeProposalLookup(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return '';
  }

  try {
    const parsedUrl = new URL(trimmed);
    return parsedUrl.searchParams.get('session') ?? trimmed;
  } catch {
    return trimmed;
  }
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

function hasResourcesPilotViabilityRecoveryArtifacts(audit: SessionAuditView): boolean {
  const presentation = deriveSessionPresentation(audit);

  return Boolean(
    presentation.resourcesPilotViabilityModuleChat ||
      presentation.currentResourcesPilotViabilityQuestion ||
      presentation.latestResourcesPilotViabilitySection,
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
      <div className="mode-card__top">
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

        <div className="mode-card__check" aria-hidden="true">
          <span />
        </div>
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

function BannerMessage({ banner }: { banner: BannerState }) {
  const role = banner.tone === 'error' ? 'alert' : 'status';

  return (
    <div
      className={`toast-notification toast-notification--${banner.tone}`}
      role={role}
      aria-atomic="true"
    >
      {banner.text}
    </div>
  );
}

export function App() {
  const phaseNavigationRef = useRef<HTMLElement | null>(null);
  const workspaceShellRef = useRef<HTMLElement | null>(null);
  const [activeAudit, setActiveAudit] = useState<SessionAuditView | null>(null);
  const [activeReport, setActiveReport] = useState<BasicAlphaReport | null>(null);
  const [reportLoadError, setReportLoadError] = useState<string | null>(null);
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const [defaultSessionId, setDefaultSessionId] = useState('');
  const [sessionLookupId, setSessionLookupId] = useState('');
  const [selectedMode, setSelectedMode] = useState<ModeView>('start');
  const [isSubmittingStart, setIsSubmittingStart] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [isComposingReport, setIsComposingReport] = useState(false);
  const [isDownloadingReportPdf, setIsDownloadingReportPdf] = useState(false);
  const [lastPdfExportSessionId, setLastPdfExportSessionId] = useState<string | null>(null);
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [isSessionMenuOpen, setIsSessionMenuOpen] = useState(false);
  const [viewingPhaseId, setViewingPhaseId] = useState<PhaseId | null>(null);

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
        successMessage: 'Propuesta cargada desde el enlace.',
        skipBannerOnStart: true,
      });
    }
  }, []);

  useEffect(() => {
    setViewingPhaseId(null);
  }, [activeAudit?.session.id]);

  useEffect(() => {
    const phaseNavigation = phaseNavigationRef.current;
    const workspaceShell = workspaceShellRef.current;

    if (!phaseNavigation || !workspaceShell) {
      return;
    }

    const setWorkspaceRowHeight = () => {
      const phaseRailHeight = phaseNavigation.getBoundingClientRect().height;

      if (phaseRailHeight > 0) {
        workspaceShell.style.setProperty('--workspace-row-height', `${Math.ceil(phaseRailHeight)}px`);
      }
    };

    setWorkspaceRowHeight();
    window.addEventListener('resize', setWorkspaceRowHeight);

    if (typeof ResizeObserver === 'undefined') {
      return () => {
        window.removeEventListener('resize', setWorkspaceRowHeight);
      };
    }

    const observer = new ResizeObserver(setWorkspaceRowHeight);
    observer.observe(phaseNavigation);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', setWorkspaceRowHeight);
    };
  }, [activeAudit?.session.id, viewingPhaseId]);

  useEffect(() => {
    if (!banner || banner.tone === 'info') {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setBanner((currentBanner) => (currentBanner === banner ? null : currentBanner));
    }, TOAST_DISMISS_MS);

    return () => window.clearTimeout(timeoutId);
  }, [banner]);

  async function loadSession(
    sessionId: string,
    options?: { successMessage?: string; skipBannerOnStart?: boolean; suppressSuccessBanner?: boolean },
  ): Promise<SessionAuditView | null> {
    const lookupId = normalizeProposalLookup(sessionId);

    if (!options?.skipBannerOnStart) {
      setBanner({
        tone: 'info',
        text: 'Recuperando la propuesta guardada...',
      });
    }

    setIsLoadingSession(true);
    setReportLoadError(null);

    try {
      const audit = await fetchSessionAudit(lookupId);
      setActiveAudit(audit);
      setRecentSessions(persistRecentSession(audit));
      setDefaultSessionId(audit.session.id);
      setSessionLookupId(audit.session.id);
      writeSessionToUrl(audit.session.id);

      let loadedReportError: string | null = null;

      try {
        setActiveReport(await loadReportIfAvailable(audit.session.id, audit));
        setReportLoadError(null);
      } catch (error) {
        loadedReportError = `La propuesta se ha cargado, pero el informe todavía no está disponible. ${mapApiError(error)}`;
        setActiveReport((currentReport) =>
          currentReport?.proposal_id === audit.session.id ? currentReport : null
        );
        setReportLoadError(loadedReportError);
      }

      if (loadedReportError) {
        setBanner({
          tone: 'error',
          text: loadedReportError,
        });
      } else if (!options?.suppressSuccessBanner) {
        setBanner({
          tone: 'success',
          text:
            options?.successMessage ??
            'Propuesta cargada. Puedes continuar desde el punto en que se quedó.',
        });
      }

      return audit;
    } catch (error) {
      setActiveReport(null);
      setReportLoadError(null);
      setBanner({
        tone: 'error',
        text: mapApiError(error),
      });

      return null;
    } finally {
      setIsLoadingSession(false);
    }
  }

  async function loadReportIfAvailable(
    sessionId: string,
    audit?: SessionAuditView,
  ): Promise<BasicAlphaReport | null> {
    try {
      return await fetchBasicAlphaReport(sessionId);
    } catch (error) {
      if (error instanceof ApiError && error.errorCode === 'report_not_found') {
        if (audit && canComposeReportFromAudit(audit)) {
          try {
            return await composeBasicAlphaReport(sessionId, createClientRequestId('report-compose'));
          } catch (composeError) {
            if (
              composeError instanceof ApiError &&
              (
                composeError.errorCode === 'problem_section_required_for_report' ||
                composeError.errorCode === 'solution_section_required_for_report'
              )
            ) {
              return null;
            }

            throw composeError;
          }
        }

        return null;
      }

      throw error;
    }
  }

  async function handleComposeReport(sessionId: string): Promise<void> {
    setIsComposingReport(true);
    setBanner({
      tone: 'info',
      text: 'Preparando el informe para revisión...',
    });

    try {
      const report = await composeBasicAlphaReport(sessionId, createClientRequestId('report-compose'));
      setActiveReport(report);
      setReportLoadError(null);
      setBanner({
        tone: 'success',
        text: 'Informe preparado. Ya puedes revisarlo y descargar el PDF.',
      });
    } catch (error) {
      const message = mapApiError(error);
      setReportLoadError(message);
      setBanner({
        tone: 'error',
        text: message,
      });
    } finally {
      setIsComposingReport(false);
    }
  }

  async function handleDownloadReportPdf(sessionId: string): Promise<void> {
    setIsDownloadingReportPdf(true);

    try {
      const result = await downloadBasicAlphaReportPdf(sessionId);

      saveBlobDownload(result.blob, result.fileName);
      setLastPdfExportSessionId(sessionId);

      setBanner({
        tone: 'success',
        text: 'PDF preparado. La descarga se ha iniciado en este navegador.',
      });
    } catch (error) {
      setBanner({
        tone: 'error',
        text: mapApiError(error),
      });
    } finally {
      setIsDownloadingReportPdf(false);
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
      text: 'Propuesta enviada. Preparando tu primera pregunta...',
    });

    try {
      const result = await startSession({
        ...payload,
        request_id: requestId,
      });
      await loadSession(result.session_id, {
        successMessage: 'Propuesta creada. Ya puedes responder a la primera pregunta.',
        skipBannerOnStart: true,
      });
    } catch (error) {
      if (isRecoverableWorkflowDeliveryError(error)) {
        setBanner({
          tone: 'info',
          text:
            error.errorCode === 'request_timeout'
              ? 'Este primer paso está tardando más de lo esperado. Intentando recuperar el resultado...'
              : 'La respuesta no ha llegado de forma completa. Intentando recuperar la propuesta...',
        });

        try {
          const sessionId = await recoverTimedOutRequest(requestId, 'proposal_start');
          await loadSession(sessionId, {
            successMessage: 'Propuesta recuperada. Puedes continuar con la entrevista.',
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
      text: 'Guardando tu respuesta y preparando el siguiente paso...',
    });

    try {
      const result = await replySession({
        request_id: requestId,
        session_id: activeAudit.session.id,
        answer,
      });

      await loadSession(result.session_id, {
        successMessage: 'Respuesta guardada. La propuesta se ha actualizado.',
        skipBannerOnStart: true,
      });
    } catch (error) {
      if (isRecoverableWorkflowDeliveryError(error)) {
        setBanner({
          tone: 'info',
          text:
            error.errorCode === 'request_timeout'
              ? 'Este paso está tardando más de lo esperado. Intentando recuperar el resultado...'
              : 'La respuesta no ha llegado de forma completa. Intentando recuperar la propuesta...',
        });

        try {
          const sessionId = await recoverTimedOutRequest(requestId, 'proposal_reply');
          await loadSession(sessionId, {
            successMessage: 'Respuesta recuperada. Puedes continuar con la entrevista.',
            skipBannerOnStart: true,
          });
          return;
        } catch (recoveryError) {
          try {
            await loadSession(activeAudit.session.id, {
              successMessage: 'Se ha recuperado la propuesta. Revisa la pregunta actual antes de responder.',
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
      text: 'Abriendo la fase de solución y preparando la primera pregunta...',
    });

    try {
      const result = await startSolution({
        request_id: requestId,
        session_id: activeAudit.session.id,
      });

      await loadSession(result.session_id, {
        successMessage: 'Fase de solución preparada. Responde a la nueva pregunta cuando puedas.',
        skipBannerOnStart: true,
      });
    } catch (error) {
      if (isRecoverableWorkflowDeliveryError(error)) {
        setBanner({
          tone: 'info',
          text:
            error.errorCode === 'request_timeout'
              ? 'La fase de solución está tardando más de lo esperado. Intentando recuperar el resultado...'
              : 'No hemos recibido la fase de solución completa. Intentando recuperarla...',
        });

        try {
          const sessionId = await recoverTimedOutRequest(requestId, 'solution_start');
          await loadSession(sessionId, {
            successMessage: 'Fase de solución recuperada. Puedes continuar.',
            skipBannerOnStart: true,
          });
          return;
        } catch (recoveryError) {
          try {
            await loadSession(activeAudit.session.id, {
              successMessage: 'Se ha recuperado la propuesta. Revisa el estado antes de continuar.',
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
      text: 'Guardando la respuesta sobre la solución...',
    });

    try {
      const result = await replySolution({
        request_id: requestId,
        session_id: activeAudit.session.id,
        answer,
      });

      await loadSession(result.session_id, {
        successMessage: 'Respuesta de solución guardada. La propuesta se ha actualizado.',
        skipBannerOnStart: true,
      });
    } catch (error) {
      if (isRecoverableWorkflowDeliveryError(error)) {
        setBanner({
          tone: 'info',
          text:
            error.errorCode === 'request_timeout'
              ? 'Este paso está tardando más de lo esperado. Intentando recuperar el resultado...'
              : 'No hemos recibido la actualización completa. Intentando recuperarla...',
        });

        try {
          const sessionId = await recoverTimedOutRequest(requestId, 'solution_reply');
          await loadSession(sessionId, {
            successMessage: 'Respuesta de solución recuperada. Puedes continuar.',
            skipBannerOnStart: true,
          });
          return;
        } catch (recoveryError) {
          try {
            await loadSession(activeAudit.session.id, {
              successMessage: 'Se ha recuperado la propuesta. Revisa el estado antes de continuar.',
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
      text: 'Abriendo la fase de datos y privacidad...',
    });

    try {
      const result = await startDataAiPrivacy({
        request_id: requestId,
        session_id: activeAudit.session.id,
        profile_id: 'hospital_clinic_v1',
      });

      await loadSession(result.session_id, {
        successMessage: 'Fase de datos y privacidad preparada. Responde a la nueva pregunta cuando puedas.',
        skipBannerOnStart: true,
      });
    } catch (error) {
      if (isRecoverableWorkflowDeliveryError(error)) {
        setBanner({
          tone: 'info',
          text:
            error.errorCode === 'request_timeout'
              ? 'La fase de datos y privacidad está tardando más de lo esperado. Intentando recuperar el resultado...'
              : 'No hemos recibido la fase completa. Intentando recuperarla...',
        });

        try {
          const sessionId = await recoverTimedOutRequest(requestId, 'data_ai_privacy_start');
          await loadSession(sessionId, {
            successMessage: 'Fase de datos y privacidad recuperada. Puedes continuar.',
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
                text: 'Se ha recuperado la fase de datos y privacidad. Puedes continuar.',
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
      text: 'Guardando la respuesta sobre datos y privacidad...',
    });

    try {
      const result = await replyDataAiPrivacy({
        request_id: requestId,
        session_id: activeAudit.session.id,
        answer,
      });

      await loadSession(result.session_id, {
        successMessage: 'Respuesta de datos y privacidad guardada. La propuesta se ha actualizado.',
        skipBannerOnStart: true,
      });
    } catch (error) {
      if (isRecoverableWorkflowDeliveryError(error)) {
        setBanner({
          tone: 'info',
          text:
            error.errorCode === 'request_timeout'
              ? 'Este paso está tardando más de lo esperado. Intentando recuperar el resultado...'
              : 'No hemos recibido la actualización completa. Intentando recuperarla...',
        });

        try {
          const sessionId = await recoverTimedOutRequest(requestId, 'data_ai_privacy_reply');
          await loadSession(sessionId, {
            successMessage: 'Respuesta de datos y privacidad recuperada. Puedes continuar.',
            skipBannerOnStart: true,
          });
          return;
        } catch (recoveryError) {
          try {
            await loadSession(activeAudit.session.id, {
              successMessage: 'Se ha recuperado la propuesta. Revisa el estado antes de continuar.',
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
      text: 'Abriendo la revisión sanitaria y regulatoria...',
    });

    try {
      const result = await startMedicalDeviceTriage({
        request_id: requestId,
        session_id: activeAudit.session.id,
        profile_id: 'hospital_clinic_v1',
      });

      await loadSession(result.session_id, {
        successMessage: 'Revisión sanitaria preparada. Responde a la nueva pregunta cuando puedas.',
        skipBannerOnStart: true,
      });
    } catch (error) {
      if (isRecoverableWorkflowDeliveryError(error)) {
        setBanner({
          tone: 'info',
          text:
            error.errorCode === 'request_timeout'
              ? 'La revisión sanitaria está tardando más de lo esperado. Intentando recuperar el resultado...'
              : 'No hemos recibido la revisión completa. Intentando recuperarla...',
        });

        try {
          const sessionId = await recoverTimedOutRequest(requestId, 'medical_device_triage_start');
          await loadSession(sessionId, {
            successMessage: 'Revisión sanitaria recuperada. Puedes continuar.',
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
                text: 'Se ha recuperado la revisión sanitaria. Puedes continuar.',
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
      text: 'Guardando la respuesta de revisión sanitaria...',
    });

    try {
      const result = await replyMedicalDeviceTriage({
        request_id: requestId,
        session_id: activeAudit.session.id,
        answer,
      });

      await loadSession(result.session_id, {
        successMessage: 'Respuesta de revisión sanitaria guardada. La propuesta se ha actualizado.',
        skipBannerOnStart: true,
      });
    } catch (error) {
      if (isRecoverableWorkflowDeliveryError(error)) {
        setBanner({
          tone: 'info',
          text:
            error.errorCode === 'request_timeout'
              ? 'Este paso está tardando más de lo esperado. Intentando recuperar el resultado...'
              : 'No hemos recibido la actualización completa. Intentando recuperarla...',
        });

        try {
          const sessionId = await recoverTimedOutRequest(requestId, 'medical_device_triage_reply');
          await loadSession(sessionId, {
            successMessage: 'Respuesta de revisión sanitaria recuperada. Puedes continuar.',
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
                text: 'Se ha recuperado la revisión sanitaria. Puedes continuar.',
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

  async function handleStartResourcesPilotViability() {
    if (!activeAudit) {
      return;
    }

    const requestId = createClientRequestId('resources-pilot-viability-start');
    setIsReplying(true);
    setBanner({
      tone: 'info',
      text: 'Abriendo la fase de piloto y recursos...',
    });

    try {
      const result = await startResourcesPilotViability({
        request_id: requestId,
        session_id: activeAudit.session.id,
      });

      await loadSession(result.session_id, {
        successMessage: 'Fase de piloto y recursos preparada. Responde a la nueva pregunta cuando puedas.',
        skipBannerOnStart: true,
      });
    } catch (error) {
      if (isRecoverableWorkflowDeliveryError(error)) {
        setBanner({
          tone: 'info',
          text:
            error.errorCode === 'request_timeout'
              ? 'La fase de piloto y recursos está tardando más de lo esperado. Intentando recuperar el resultado...'
              : 'No hemos recibido la fase completa. Intentando recuperarla...',
        });

        try {
          const sessionId = await recoverTimedOutRequest(requestId, 'resources_pilot_viability_start');
          await loadSession(sessionId, {
            successMessage: 'Fase de piloto y recursos recuperada. Puedes continuar.',
            skipBannerOnStart: true,
          });
          return;
        } catch (recoveryError) {
          try {
            const recoveredAudit = await loadSession(activeAudit.session.id, {
              skipBannerOnStart: true,
              suppressSuccessBanner: true,
            });

            if (recoveredAudit && hasResourcesPilotViabilityRecoveryArtifacts(recoveredAudit)) {
              setBanner({
                tone: 'success',
                text: 'Se ha recuperado la fase de piloto y recursos. Puedes continuar.',
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

  async function handleResourcesPilotViabilityReply(answer: string) {
    if (!activeAudit) {
      return;
    }

    const requestId = createClientRequestId('resources-pilot-viability-reply');
    setIsReplying(true);
    setBanner({
      tone: 'info',
      text: 'Guardando la respuesta sobre piloto y recursos...',
    });

    try {
      const result = await replyResourcesPilotViability({
        request_id: requestId,
        session_id: activeAudit.session.id,
        answer,
      });

      await loadSession(result.session_id, {
        successMessage: 'Respuesta de piloto y recursos guardada. La propuesta se ha actualizado.',
        skipBannerOnStart: true,
      });
    } catch (error) {
      if (isRecoverableWorkflowDeliveryError(error)) {
        setBanner({
          tone: 'info',
          text:
            error.errorCode === 'request_timeout'
              ? 'Este paso está tardando más de lo esperado. Intentando recuperar el resultado...'
              : 'No hemos recibido la actualización completa. Intentando recuperarla...',
        });

        try {
          const sessionId = await recoverTimedOutRequest(requestId, 'resources_pilot_viability_reply');
          await loadSession(sessionId, {
            successMessage: 'Respuesta de piloto y recursos recuperada. Puedes continuar.',
            skipBannerOnStart: true,
          });
          return;
        } catch (recoveryError) {
          try {
            const recoveredAudit = await loadSession(activeAudit.session.id, {
              skipBannerOnStart: true,
              suppressSuccessBanner: true,
            });

            if (recoveredAudit && hasCompletedResourcesPilotViabilityRequest(recoveredAudit, requestId)) {
              setBanner({
                tone: 'success',
                text: 'Se ha recuperado la fase de piloto y recursos. Puedes continuar.',
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
    setReportLoadError(null);
    setLastPdfExportSessionId(null);
    setBanner(null);
    setDefaultSessionId('');
    setSessionLookupId('');
    setSelectedMode('start');
    setIsSessionMenuOpen(false);
    writeSessionToUrl('');
  }

  function handleChangeSession() {
    const currentSessionId = activeAudit?.session.id ?? sessionLookupId;

    setActiveAudit(null);
    setActiveReport(null);
    setReportLoadError(null);
    setLastPdfExportSessionId(null);
    setBanner(null);
    setSessionLookupId(currentSessionId);
    setDefaultSessionId(currentSessionId);
    setSelectedMode('resume');
    setIsSessionMenuOpen(false);
    writeSessionToUrl('');
  }



  const presentation = activeAudit
    ? deriveSessionPresentation(activeAudit, {
      report: activeReport,
      isDownloadingReportPdf,
      hasDownloadedReportPdf: lastPdfExportSessionId === activeAudit.session.id,
    })
    : null;

  if (presentation && activeAudit) {
    const activeViewingPhaseId = viewingPhaseId ?? presentation.phaseProgress.currentPhaseId;
    const selectablePhaseIds = Object.keys(presentation.conversationHistoryByPhase) as PhaseId[];

    return (
      <div className="app-shell app-shell--workspace">
        <div className="app-shell__ambient" />

        {/* 1. Row 1: Sticky Top Bar across the shell */}
        <WorkspaceTopBar
          presentation={presentation}
          isLoadingSession={isLoadingSession}
          isReplying={isReplying}
          isComposingReport={isComposingReport}
          isDownloadingReportPdf={isDownloadingReportPdf}
          onChangeSessionClick={handleChangeSession}
          onNewProposalClick={handleStartFreshSession}
        />

        {banner ? <BannerMessage banner={banner} /> : null}

        {/* Workspace Layout */}
        <main className="workspace-shell" ref={workspaceShellRef}>
          {/* 2. Row 2: phase-navigation left, main-chat center, guidance-panel right */}
          <section className="phase-navigation-column" ref={phaseNavigationRef}>
            <PhaseRail
              steps={presentation.phaseProgress.steps}
              currentPhaseId={presentation.phaseProgress.currentPhaseId}
              selectedPhaseId={activeViewingPhaseId}
              completedPhases={presentation.phaseProgress.completedPhases}
              totalApplicablePhases={presentation.phaseProgress.totalApplicablePhases}
              selectablePhaseIds={selectablePhaseIds}
              onSelectPhase={(phaseId) => {
                if (phaseId === presentation.phaseProgress.currentPhaseId) {
                  setViewingPhaseId(null);
                  return;
                }

                setViewingPhaseId(phaseId);
              }}
            />
          </section>

          <section className="workspace-main main-chat-column">
            <SessionWorkspace
              audit={activeAudit}
              report={activeReport}
              reportLoadError={reportLoadError}
              isReplying={isReplying}
              isComposingReport={isComposingReport}
              isDownloadingReportPdf={isDownloadingReportPdf}
              onReply={handleReply}
              onComposeReport={handleComposeReport}
              onDownloadReportPdf={handleDownloadReportPdf}
              onSolutionReply={handleSolutionReply}
              onDataAiPrivacyReply={handleDataAiPrivacyReply}
              onMedicalDeviceTriageReply={handleMedicalDeviceTriageReply}
              onResourcesPilotViabilityReply={handleResourcesPilotViabilityReply}
              onStartSolution={handleStartSolution}
              onStartDataAiPrivacy={handleStartDataAiPrivacy}
              onStartMedicalDeviceTriage={handleStartMedicalDeviceTriage}
              onStartResourcesPilotViability={handleStartResourcesPilotViability}
              presentation={presentation}
              viewingPhaseId={activeViewingPhaseId}
            />
          </section>

          <aside className="workspace-insights guidance-panel-column">
            <SessionStatePanel presentation={presentation} />
          </aside>
        </main>

        {/* 3. Session Menu Drawer */}
        <SessionMenu
          isOpen={isSessionMenuOpen}
          onClose={() => setIsSessionMenuOpen(false)}
          sessionLookupId={sessionLookupId}
          setSessionLookupId={setSessionLookupId}
          recentSessions={recentSessions}
          isLoadingSession={isLoadingSession}
          onLoadSession={async (sessionId) => {
            await loadSession(sessionId);
          }}
        />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="app-shell__ambient" />

      <header className="app-topbar">
        <div className="app-topbar__brand">
          <div className="brand-mark">
            <SokrAiLogo size="md" />
          </div>
          <div className="brand-copy">
            <span className="brand-copy__eyebrow">SokrAI</span>
            <strong>Propuestas para revisión humana</strong>
            <span className="brand-copy__meta">Entrevista guiada para ideas sanitarias y operativas.</span>
          </div>
        </div>

      </header>

      {banner ? <BannerMessage banner={banner} /> : null}

      <main className="mode-page">
        <nav className="mode-breadcrumbs" aria-label="Información del producto">
          <span>Propuesta en preparación</span>
          <span>Revisión humana recomendada</span>
          <span>Sin datos reales de pacientes</span>
        </nav>

        <section className="mode-hero">
          <div className="mode-hero__visual" aria-hidden="true">
            <div className="mode-hero__pulse" />
            <div className="mode-hero__orb">
              <SokrAiLogo size="xl" />
            </div>
            <div className="mode-hero__presence">
              <span />
            </div>
          </div>

          <span className="panel__eyebrow">Espacio local de maduración</span>
          <h1>Mejora tu propuesta con SokrAI</h1>
          <p>
            Responde unas preguntas guiadas para convertir tu idea en una propuesta clara,
            revisable y lista para compartir.
          </p>
        </section>

        <section className="mode-grid" aria-label="modes">
          <ModeCard
            activeMode={selectedMode}
            callout="Desde una idea, texto o PDF"
            cta="Empezar"
            description="Crea una propuesta y recibe una primera pregunta para aclarar el problema antes de avanzar."
            mode="start"
            onSelect={setSelectedMode}
            title="Empezar nueva propuesta"
          />

          <ModeCard
            activeMode={selectedMode}
            callout={defaultSessionId ? 'Propuesta anterior detectada' : 'Con enlace o código guardado'}
            cta="Continuar"
            description="Retoma una propuesta anterior y sigue desde la pregunta pendiente."
            mode="resume"
            onSelect={setSelectedMode}
            title="Continuar una propuesta"
          />
        </section>

        <section className="detail-shell">
          {isSubmittingStart ? <WorkflowLoadingPanel kind="start" /> : null}

          {selectedMode === 'start' ? (
            <div hidden={isSubmittingStart}>
              <NewProposalPanel isSubmitting={isSubmittingStart} onSubmit={handleStart} />
            </div>
          ) : isSubmittingStart ? null : (
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
      </main>
    </div>
  );
}
