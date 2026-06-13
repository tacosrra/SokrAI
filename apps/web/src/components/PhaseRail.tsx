import type { PhaseStep } from '../lib/session-view';
import { StatusBadge, phaseTone } from './StatusBadge';

interface PhaseRailProps {
  steps: PhaseStep[];
  currentPhaseId: string;
  completedPhases: number;
  totalApplicablePhases: number;
}

function phaseStatusLabel(status: string): string {
  switch (status) {
    case 'complete':
      return 'Completada';
    case 'current':
      return 'Actual';
    case 'ready':
      return 'Lista';
    case 'locked':
      return 'Bloqueada';
    case 'not_applicable':
      return 'No aplica';
    case 'recovering':
      return 'Recuperando';
    case 'error':
      return 'Revisar';
    default:
      return status;
  }
}

export function PhaseRail({
  steps,
  currentPhaseId,
  completedPhases,
  totalApplicablePhases,
}: PhaseRailProps) {
  return (
    <nav className="panel phase-rail" aria-label="Fases de la propuesta">
      <div className="phase-rail__header">
        <h3>Camino de maduración</h3>
        <span className="phase-rail__progress-summary">
          {completedPhases}/{totalApplicablePhases} fases completas
        </span>
      </div>

      <ol className="phase-rail__list">
        {steps.map((step, index) => {
          const isCurrent = step.id === currentPhaseId;

          return (
            <li
              key={step.id}
              className={`phase-rail__item ${isCurrent ? 'phase-rail__item--current' : ''} ${step.status === 'locked' ? 'phase-rail__item--locked' : ''}`}
              aria-current={isCurrent ? 'step' : undefined}
            >
              <div className="phase-rail__item-main">
                <span className="phase-rail__item-index">{index + 1}</span>
                <span className="phase-rail__item-label">{step.label}</span>
              </div>
              <div className="phase-rail__item-status">
                <StatusBadge label={phaseStatusLabel(step.status)} tone={phaseTone(step.status)} />
                {isCurrent && (
                  <span className="current-action-chip">Acción actual</span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
