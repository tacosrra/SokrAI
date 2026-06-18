import type { RecentSession, SessionAuditView, SessionStatus } from '../domain/contracts';
import { deriveSessionPresentation, type SessionPresentation } from './session-view';

const RECENT_SESSIONS_KEY = 'sokrai:v1:recent-sessions';
const LAST_SESSION_ID_KEY = 'sokrai:v1:last-session-id';
const MAX_RECENT_SESSIONS = 6;

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function readRecentSessions(): RecentSession[] {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(RECENT_SESSIONS_KEY);

    if (!rawValue) {
      return [];
    }

    const parsed = JSON.parse(rawValue) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isRecentSession);
  } catch {
    return [];
  }
}

export function readLastSessionId(): string {
  if (!canUseStorage()) {
    return '';
  }

  return window.localStorage.getItem(LAST_SESSION_ID_KEY) ?? '';
}

export function persistRecentSession(audit: SessionAuditView): RecentSession[] {
  if (!canUseStorage()) {
    return [];
  }

  const presentation = deriveSessionPresentation(audit);

  const entry: RecentSession = {
    sessionId: audit.session.id,
    projectTitle: audit.session.project_title,
    goal: audit.session.goal,
    status: deriveRecentSessionStatus(audit, presentation),
    updatedAt: new Date().toISOString(),
    currentQuestion: deriveRecentSessionPrompt(presentation),
    phaseLabel: presentation.phaseProgress.currentPhaseLabel,
  };

  const deduped = [
    entry,
    ...readRecentSessions().filter((item) => item.sessionId !== audit.session.id),
  ].slice(0, MAX_RECENT_SESSIONS);

  window.localStorage.setItem(RECENT_SESSIONS_KEY, JSON.stringify(deduped));
  window.localStorage.setItem(LAST_SESSION_ID_KEY, audit.session.id);

  return deduped;
}

export function removeRecentSession(sessionId: string): RecentSession[] {
  if (!canUseStorage()) {
    return [];
  }

  const trimmedSessionId = sessionId.trim();
  const remaining = readRecentSessions()
    .filter((item) => item.sessionId !== trimmedSessionId)
    .slice(0, MAX_RECENT_SESSIONS);

  window.localStorage.setItem(RECENT_SESSIONS_KEY, JSON.stringify(remaining));

  if (readLastSessionId() === trimmedSessionId) {
    window.localStorage.setItem(LAST_SESSION_ID_KEY, '');
  }

  return remaining;
}

function deriveRecentSessionStatus(
  audit: SessionAuditView,
  presentation: SessionPresentation,
): SessionStatus {
  if (audit.session.status === 'blocked' || audit.session.status === 'failed') {
    return audit.session.status;
  }

  if (presentation.phaseProgress.isComplete) {
    return 'completed';
  }

  if (
    presentation.currentQuestion ||
    presentation.currentSolutionQuestion ||
    presentation.currentDataAiPrivacyQuestion ||
    presentation.currentMedicalDeviceTriageQuestion ||
    presentation.currentResourcesPilotViabilityQuestion
  ) {
    return 'waiting_for_user';
  }

  return 'active';
}

function deriveRecentSessionPrompt(presentation: SessionPresentation): string {
  const currentQuestion =
    presentation.currentResourcesPilotViabilityQuestion ||
    presentation.currentMedicalDeviceTriageQuestion ||
    presentation.currentDataAiPrivacyQuestion ||
    presentation.currentSolutionQuestion ||
    presentation.currentQuestion;

  if (currentQuestion) {
    return currentQuestion;
  }

  const currentPhase = presentation.phaseProgress.steps.find((step) =>
    step.id === presentation.phaseProgress.currentPhaseId,
  );
  const phaseLabel = currentPhase?.label ?? presentation.phaseProgress.currentPhaseLabel;

  if (currentPhase?.status === 'preparing') {
    return `Preparando fase: ${phaseLabel}.`;
  }

  switch (currentPhase?.primaryAction) {
    case 'start_solution':
    case 'start_data_ai_privacy':
    case 'start_medical_device_triage':
    case 'start_resources_pilot_viability':
      return `Siguiente fase: ${phaseLabel}.`;
    case 'prepare_report':
      return 'Siguiente paso: preparar el informe.';
    case 'download_pdf':
      return 'Siguiente paso: descargar el PDF.';
    case 'review_report':
      return 'Informe listo para revisión.';
    case 'recover':
      return `Revisar la fase ${phaseLabel}.`;
    default:
      return phaseLabel ? `Continuar desde ${phaseLabel}.` : '';
  }
}

function isRecentSession(value: unknown): value is RecentSession {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.sessionId === 'string' &&
    typeof candidate.projectTitle === 'string' &&
    typeof candidate.goal === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.updatedAt === 'string' &&
    typeof candidate.currentQuestion === 'string'
  );
}
