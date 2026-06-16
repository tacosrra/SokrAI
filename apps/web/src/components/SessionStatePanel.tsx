import type { AlphaGap } from '../domain/contracts';
import type { SessionPresentation } from '../lib/session-view';
import { toUserFacingText } from '../lib/user-facing-text';

interface SessionStatePanelProps {
  presentation: SessionPresentation;
}

function gapIsAnswered(gap: AlphaGap): boolean {
  return Boolean(gap.resolved_by_turn_id) ||
    gap.gap_status === 'resolved' ||
    gap.gap_status === 'not_applicable';
}

function formatGapStatus(gap: AlphaGap): string {
  if (gap.gap_status === 'not_applicable') {
    return 'No aplica';
  }

  if (gapIsAnswered(gap)) {
    return 'Respondido';
  }

  if (gap.gap_status === 'in_progress') {
    return 'En preparación';
  }

  if (gap.gap_status === 'deferred') {
    return 'Más adelante';
  }

  return 'Pendiente';
}

function formatGapModule(module: AlphaGap['module']): string {
  switch (module) {
    case 'problem':
      return 'Problema';
    case 'solution':
      return 'Solución';
    case 'data_ai_privacy':
      return 'Datos y privacidad';
    case 'medical_device_triage':
      return 'Revisión sanitaria';
    case 'resources_pilot_viability':
      return 'Piloto y recursos';
  }
}

function moduleForPhase(phaseId: string): AlphaGap['module'] | null {
  switch (phaseId) {
    case 'problem':
      return 'problem';
    case 'solution':
      return 'solution';
    case 'data_ai_privacy':
      return 'data_ai_privacy';
    case 'medical_device_triage':
      return 'medical_device_triage';
    case 'resources_pilot_viability':
      return 'resources_pilot_viability';
    default:
      return null;
  }
}

export function SessionStatePanel({
  presentation,
}: SessionStatePanelProps) {
  const currentPhase = presentation.phaseProgress.steps.find((step) =>
    step.id === presentation.phaseProgress.currentPhaseId,
  ) ?? presentation.phaseProgress.steps[0];

  const getNextStepText = () => {
    if (presentation.currentQuestion) {
      return 'SokrAI guardará tu respuesta y decidirá si falta otra aclaración o si la fase puede avanzar.';
    }
    switch (currentPhase.primaryAction) {
      case 'prepare_report':
        return 'SokrAI preparará el informe para revisión humana.';
      case 'download_pdf':
        return 'Se descargará un PDF con el material preparado.';
      default:
        return 'SokrAI abrirá esta fase y preparará la primera pregunta.';
    }
  };

  const getNextStepLabel = () => {
    if (presentation.currentQuestion) {
      return 'Responder a la pregunta actual';
    }

    switch (currentPhase.primaryAction) {
      case 'prepare_report':
        return 'Preparar informe';
      case 'download_pdf':
        return 'Descargar PDF';
      case 'start_solution':
      case 'start_data_ai_privacy':
      case 'start_medical_device_triage':
      case 'start_resources_pilot_viability':
        return `Abrir ${currentPhase.label.toLowerCase()}`;
      case 'recover':
        return 'Revisar esta fase';
      default:
        return 'Continuar cuando haya un paso disponible';
    }
  };

  const currentModule = moduleForPhase(currentPhase.id);
  const visibleGaps = currentModule
    ? presentation.gaps.filter((gap) => gap.module === currentModule)
    : presentation.gaps;
  const sortedGaps = [...visibleGaps].sort((left, right) => {
    const answeredDelta = Number(gapIsAnswered(left)) - Number(gapIsAnswered(right));

    if (answeredDelta !== 0) {
      return answeredDelta;
    }

    return left.updated_at.localeCompare(right.updated_at);
  });
  const answeredGapCount = visibleGaps.filter(gapIsAnswered).length;
  const totalGapCount = visibleGaps.length;
  const checklistPercent = totalGapCount > 0
    ? Math.round((answeredGapCount / totalGapCount) * 100)
    : 100;

  return (
    <aside className="panel guidance-panel" aria-label="Guía de la sesión">
      <header className="guidance-panel__summary">
        <div className="guidance-panel__score">
          <div>
            <span className="panel__eyebrow">Checklist</span>
            <h2>{currentModule ? `Aclaraciones de ${currentPhase.label.toLowerCase()}` : 'Aclaraciones de la propuesta'}</h2>
          </div>
          <strong>{answeredGapCount}/{totalGapCount}</strong>
        </div>
        <div className="guidance-progress-bar" aria-hidden="true">
          <span style={{ width: `${checklistPercent}%` }} />
        </div>
        <p>
          {totalGapCount === 0
            ? currentModule
              ? 'No hay aclaraciones detectadas en esta fase.'
              : 'No hay aclaraciones pendientes detectadas.'
            : `${totalGapCount - answeredGapCount} pendientes de responder.`}
        </p>
      </header>

      <section className="guidance-panel__section guidance-panel__section--checklist">
        <h3>Puntos por aclarar</h3>
        {sortedGaps.length === 0 ? (
          <p>{currentModule
            ? 'Esta fase no tiene puntos pendientes visibles.'
            : 'No hay puntos pendientes visibles. Continúa con la pregunta actual o prepara el informe cuando esté disponible.'}</p>
        ) : (
          <ol className="gap-checklist">
            {sortedGaps.map((gap) => {
              const isAnswered = gapIsAnswered(gap);

              return (
                <li
                  key={gap.gap_id}
                  className={`gap-checklist__item ${isAnswered ? 'gap-checklist__item--answered' : 'gap-checklist__item--pending'}`}
                >
                  <span className="gap-checklist__check" aria-hidden="true">
                    {isAnswered ? '✓' : ''}
                  </span>
                  <div className="gap-checklist__body">
                    <div className="gap-checklist__meta">
                      <span>{formatGapModule(gap.module)}</span>
                      <em>{formatGapStatus(gap)}</em>
                    </div>
                    <p>{toUserFacingText(gap.description)}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="guidance-panel__next">
        <span>Siguiente paso</span>
        <strong>{getNextStepLabel()}</strong>
        <p>{getNextStepText()}</p>
      </section>
    </aside>
  );
}
