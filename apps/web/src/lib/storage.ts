import type { RecentSession, SessionAuditView } from '../domain/contracts';

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

  const openTurn = [...audit.turns]
    .reverse()
    .find((turn) => turn.status === 'awaiting_user' || turn.status === 'processing');

  const nextQuestion =
    openTurn?.question_text ??
    audit.snapshots[audit.snapshots.length - 1]?.next_question_text ??
    '';

  const entry: RecentSession = {
    sessionId: audit.session.id,
    projectTitle: audit.session.project_title,
    goal: audit.session.goal,
    status: audit.session.status,
    updatedAt: new Date().toISOString(),
    currentQuestion: nextQuestion,
  };

  const deduped = [
    entry,
    ...readRecentSessions().filter((item) => item.sessionId !== audit.session.id),
  ].slice(0, MAX_RECENT_SESSIONS);

  window.localStorage.setItem(RECENT_SESSIONS_KEY, JSON.stringify(deduped));
  window.localStorage.setItem(LAST_SESSION_ID_KEY, audit.session.id);

  return deduped;
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
