import type { PhaseId, PhaseStep } from '../lib/session-view';
import { StatusBadge, phaseTone } from './StatusBadge';

interface PhaseRailProps {
  steps: PhaseStep[];
  currentPhaseId: string;
  selectedPhaseId: string;
  completedPhases: number;
  totalApplicablePhases: number;
  selectablePhaseIds: PhaseId[];
  onSelectPhase: (phaseId: PhaseId) => void;
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
  selectedPhaseId,
  completedPhases,
  totalApplicablePhases,
  selectablePhaseIds,
  onSelectPhase,
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
          const isSelected = step.id === selectedPhaseId;
          const isSelectable = selectablePhaseIds.includes(step.id as PhaseId);

          return (
            <li
              key={step.id}
              className={[
                'phase-rail__item',
                isCurrent ? 'phase-rail__item--current' : '',
                isSelected ? 'phase-rail__item--selected' : '',
                step.status === 'locked' ? 'phase-rail__item--locked' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-current={isCurrent ? 'step' : undefined}
            >
              {isSelectable ? (
                <button
                  type="button"
                  className="phase-rail__button"
                  aria-pressed={isSelected}
                  onClick={() => onSelectPhase(step.id as PhaseId)}
                >
                  <div className="phase-rail__item-main">
                    <span className="phase-rail__item-index">{index + 1}</span>
                    <span className="phase-rail__item-label">{step.label}</span>
                  </div>
                  <div className="phase-rail__item-status">
                    <StatusBadge label={phaseStatusLabel(step.status)} tone={phaseTone(step.status)} />
                    {isCurrent ? (
                      <span className="current-action-chip">Acción actual</span>
                    ) : isSelected ? (
                      <span className="current-action-chip current-action-chip--history">Historial</span>
                    ) : null}
                  </div>
                </button>
              ) : (
                <div className="phase-rail__button phase-rail__button--static">
                  <div className="phase-rail__item-main">
                    <span className="phase-rail__item-index">{index + 1}</span>
                    <span className="phase-rail__item-label">{step.label}</span>
                  </div>
                  <div className="phase-rail__item-status">
                    <StatusBadge label={phaseStatusLabel(step.status)} tone={phaseTone(step.status)} />
                    {isCurrent ? (
                      <span className="current-action-chip">Acción actual</span>
                    ) : null}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
