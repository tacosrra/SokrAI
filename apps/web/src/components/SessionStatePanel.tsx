import type { AlphaGap } from '../domain/contracts';
import type { PhaseId, SessionPresentation } from '../lib/session-view';
import { describeGapForUser } from '../lib/user-facing-text';

interface SessionStatePanelProps {
  presentation: SessionPresentation;
  selectedPhaseId?: PhaseId;
}

function gapIsAnswered(gap: AlphaGap): boolean {
  return Boolean(gap.resolved_by_turn_id) ||
    gap.gap_status === 'resolved' ||
    gap.gap_status === 'not_applicable' ||
    gap.gap_status === 'deferred';
}

function formatGapStatus(gap: AlphaGap): string {
  if (gap.gap_status === 'not_applicable') {
    return 'No aplica';
  }

  if (gap.gap_status === 'deferred') {
    return 'Más adelante';
  }

  if (gapIsAnswered(gap)) {
    return 'Respondido';
  }

  if (gap.gap_status === 'in_progress') {
    return 'En preparación';
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

function moduleChatForPhase(
  presentation: SessionPresentation,
  phaseId: PhaseId,
) {
  switch (phaseId) {
    case 'problem':
      return presentation.problemModuleChat;
    case 'solution':
      return presentation.solutionModuleChat;
    case 'data_ai_privacy':
      return presentation.dataAiPrivacyModuleChat;
    case 'medical_device_triage':
      return presentation.medicalDeviceTriageModuleChat;
    case 'resources_pilot_viability':
      return presentation.resourcesPilotViabilityModuleChat;
    default:
      return null;
  }
}

function questionForPhase(
  presentation: SessionPresentation,
  phaseId: PhaseId,
): string {
  if (phaseId === presentation.phaseProgress.currentPhaseId) {
    switch (phaseId) {
      case 'solution':
        return presentation.currentSolutionQuestion;
      case 'data_ai_privacy':
        return presentation.currentDataAiPrivacyQuestion;
      case 'medical_device_triage':
        return presentation.currentMedicalDeviceTriageQuestion;
      case 'resources_pilot_viability':
        return presentation.currentResourcesPilotViabilityQuestion;
      case 'problem':
        return presentation.currentQuestion;
      default:
        return '';
    }
  }

  const phaseHistory = presentation.conversationHistoryByPhase[phaseId] ?? [];
  const activeTurn = [...phaseHistory]
    .reverse()
    .find((turn) => turn.status === 'awaiting_user' || turn.status === 'processing');

  return activeTurn?.question_text ?? '';
}

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function describeActiveGap(gap: AlphaGap | undefined, fallbackQuestion: string): string {
  if (!gap) {
    return fallbackQuestion;
  }

  return gap.question_hint ?? describeGapForUser(gap);
}

export function SessionStatePanel({
  presentation,
  selectedPhaseId,
}: SessionStatePanelProps) {
  const activePhaseId = selectedPhaseId ?? presentation.phaseProgress.currentPhaseId;
  const currentPhase = presentation.phaseProgress.steps.find((step) =>
    step.id === activePhaseId,
  ) ?? presentation.phaseProgress.steps[0];
  const isViewingHistoricalPhase = activePhaseId !== presentation.phaseProgress.currentPhaseId;
  const hasCurrentQuestion = Boolean(
    presentation.currentResourcesPilotViabilityQuestion ||
      presentation.currentMedicalDeviceTriageQuestion ||
      presentation.currentDataAiPrivacyQuestion ||
      presentation.currentSolutionQuestion ||
      presentation.currentQuestion,
  );

  const getNextStepText = () => {
    if (isViewingHistoricalPhase) {
      return 'Estás revisando el historial y las aclaraciones de esta fase. Vuelve a la fase actual para continuar.';
    }

    if (hasCurrentQuestion) {
      return 'SokrAI guardará tu respuesta y decidirá si falta otra aclaración o si la fase puede avanzar.';
    }

    if (currentPhase.status === 'preparing') {
      return 'SokrAI está preparando esta fase en segundo plano.';
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
    if (isViewingHistoricalPhase) {
      return 'Historial de fase';
    }

    if (hasCurrentQuestion) {
      return 'Responder a la pregunta actual';
    }

    if (currentPhase.status === 'preparing') {
      return `Preparando ${currentPhase.label.toLowerCase()}`;
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
  const activeQuestion = questionForPhase(presentation, currentPhase.id);
  const activeModuleChat = moduleChatForPhase(presentation, currentPhase.id);
  const activeTurn = activeModuleChat?.turns.find((turn) =>
    turn.turn_id === activeModuleChat.active_turn_id,
  ) ?? null;
  const activeTurnGapRefs = new Set(activeTurn?.gap_refs ?? []);
  const visibleGaps = currentModule
    ? presentation.gaps.filter((gap) => gap.module === currentModule)
    : presentation.gaps;
  const sortGaps = (gaps: AlphaGap[]) => [...gaps].sort((left, right) => {
    const answeredDelta = Number(gapIsAnswered(left)) - Number(gapIsAnswered(right));

    if (answeredDelta !== 0) {
      return answeredDelta;
    }

    return left.updated_at.localeCompare(right.updated_at);
  });
  const activeGaps = visibleGaps.filter((gap) =>
    !gapIsAnswered(gap) &&
    (
      activeTurnGapRefs.has(gap.gap_id) ||
      (activeQuestion && gap.gap_status === 'in_progress')
    ),
  );
  const activeGapIds = new Set(activeGaps.map((gap) => gap.gap_id));
  const answeredGaps = sortGaps(visibleGaps.filter(gapIsAnswered));
  const waitingGaps = sortGaps(visibleGaps.filter((gap) =>
    !gapIsAnswered(gap) && !activeGapIds.has(gap.gap_id),
  ));
  const savedGaps = [...waitingGaps, ...answeredGaps];
  const answeredGapCount = answeredGaps.length;
  const waitingGapCount = waitingGaps.length;
  const hasActiveClarification = Boolean(activeQuestion);
  const phaseTitle = hasActiveClarification && currentPhase.id !== 'problem'
    ? `${currentPhase.label} en curso`
    : currentModule
      ? `Aclaraciones de ${currentPhase.label.toLowerCase()}`
      : 'Aclaraciones de la propuesta';
  const stateLabel = isViewingHistoricalPhase
    ? 'Historial'
    : hasActiveClarification
      ? 'Aclaración activa'
      : waitingGapCount > 0
        ? 'En espera'
        : 'Sin pendientes';
  const summaryText = hasActiveClarification
    ? [
        'Una pregunta abierta ahora.',
        answeredGapCount > 0 ? pluralize(answeredGapCount, 'respondida', 'respondidas') : null,
        waitingGapCount > 0 ? pluralize(waitingGapCount, 'en espera', 'en espera') : null,
      ].filter(Boolean).join(' ')
    : waitingGapCount > 0
      ? `${pluralize(waitingGapCount, 'aclaración en espera', 'aclaraciones en espera')}.`
      : answeredGapCount > 0
        ? `${pluralize(answeredGapCount, 'respondida', 'respondidas')}.`
        : currentModule
          ? 'Esta fase no tiene aclaraciones pendientes.'
          : 'No hay aclaraciones pendientes detectadas.';
  const savedSummary = [
    answeredGapCount > 0 ? pluralize(answeredGapCount, 'respondida', 'respondidas') : null,
    waitingGapCount > 0 ? pluralize(waitingGapCount, 'en espera', 'en espera') : null,
  ].filter(Boolean).join(' · ');

  return (
    <aside className="panel guidance-panel" aria-label="Guía de la sesión">
      <header className="guidance-panel__summary">
        <div className="guidance-panel__score">
          <div>
            <span className="panel__eyebrow">Fase guiada</span>
            <h2>{phaseTitle}</h2>
          </div>
          <strong className="guidance-panel__state-pill">{stateLabel}</strong>
        </div>
        <p>{summaryText}</p>
      </header>

      {activeQuestion ? (
        <section className="guidance-panel__focus" aria-label="Aclaración actual">
          <span>Ahora</span>
          <div className="gap-checklist__item gap-checklist__item--active">
            <span className="gap-checklist__check" aria-hidden="true">•</span>
            <div className="gap-checklist__body">
              <div className="gap-checklist__meta">
                <span>{currentModule ? formatGapModule(currentModule) : currentPhase.label}</span>
                <em>Aclaración activa</em>
              </div>
              <p>{describeActiveGap(activeGaps[0], activeQuestion)}</p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="guidance-panel__section guidance-panel__section--checklist">
        <div className="guidance-panel__section-heading">
          <h3>Aclaraciones guardadas</h3>
          {savedSummary ? <span>{savedSummary}</span> : null}
        </div>
        {savedGaps.length === 0 ? (
          <p>{currentModule
            ? 'Esta fase todavía no tiene aclaraciones guardadas.'
            : 'No hay aclaraciones guardadas. Continúa con la pregunta actual o prepara el informe cuando esté disponible.'}</p>
        ) : (
          <ol className="gap-checklist">
            {savedGaps.map((gap) => {
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
                    <p>{describeGapForUser(gap)}</p>
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
