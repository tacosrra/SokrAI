import type { AgentStatus, SessionStatus } from '../domain/contracts';
import type { PhaseStatus } from '../lib/session-view';

interface StatusBadgeProps {
  label: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger' | 'accent';
}

export function StatusBadge({ label, tone }: StatusBadgeProps) {
  return <span className={`status-badge status-badge--${tone}`}>{label}</span>;
}

export function sessionTone(status: SessionStatus): StatusBadgeProps['tone'] {
  switch (status) {
    case 'completed':
      return 'success';
    case 'blocked':
    case 'failed':
      return 'danger';
    case 'waiting_for_user':
      return 'accent';
    default:
      return 'warning';
  }
}

export function agentTone(status: AgentStatus): StatusBadgeProps['tone'] {
  switch (status) {
    case 'done':
      return 'success';
    case 'blocked':
      return 'danger';
    default:
      return 'accent';
  }
}

export function phaseTone(status: PhaseStatus): StatusBadgeProps['tone'] {
  switch (status) {
    case 'complete':
    case 'not_applicable':
      return 'success';
    case 'error':
      return 'danger';
    case 'current':
    case 'recovering':
      return 'accent';
    case 'ready':
      return 'warning';
    case 'locked':
      return 'neutral';
  }
}
