import type { AgentStatus, SessionStatus } from '../domain/contracts';

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
