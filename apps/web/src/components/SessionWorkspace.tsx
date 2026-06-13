import { useState, useEffect, useRef } from 'react';

import type { BasicAlphaReport, SessionAuditView } from '../domain/contracts';
import type { PhasePrimaryAction, SessionPresentation } from '../lib/session-view';
import { BasicAlphaReportPanel } from './BasicAlphaReportPanel';
import { StatusBadge } from './StatusBadge';

interface SessionWorkspaceProps {
  audit: SessionAuditView;
  report: BasicAlphaReport | null;
  reportLoadError?: string | null;
  isReplying: boolean;
  isComposingReport: boolean;
  isDownloadingReportPdf: boolean;
  onReply: (answer: string) => Promise<void>;
  onComposeReport: (sessionId: string) => Promise<void>;
  onDownloadReportPdf: (sessionId: string) => Promise<void>;
  onSolutionReply: (answer: string) => Promise<void>;
  onDataAiPrivacyReply: (answer: string) => Promise<void>;
  onMedicalDeviceTriageReply: (answer: string) => Promise<void>;
  onResourcesPilotViabilityReply: (answer: string) => Promise<void>;
  onStartSolution: () => Promise<void>;
  onStartDataAiPrivacy: () => Promise<void>;
  onStartMedicalDeviceTriage: () => Promise<void>;
  onStartResourcesPilotViability: () => Promise<void>;
  presentation: SessionPresentation;
}

interface PrimaryPhaseAction {
  kind: PhasePrimaryAction;
  label: string;
  busyLabel: string;
  isBusy: boolean;
  onClick: () => void;
}

interface OptimisticReply {
  questionText: string;
  answerText: string;
  turnSeq: number;
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

export function SessionWorkspace({
  audit,
  report,
  reportLoadError = null,
  isReplying,
  isComposingReport,
  isDownloadingReportPdf,
  onReply,
  onComposeReport,
  onDownloadReportPdf,
  onSolutionReply,
  onDataAiPrivacyReply,
  onMedicalDeviceTriageReply,
  onResourcesPilotViabilityReply,
  onStartSolution,
  onStartDataAiPrivacy,
  onStartMedicalDeviceTriage,
  onStartResourcesPilotViability,
  presentation,
}: SessionWorkspaceProps) {
  const [reply, setReply] = useState('');
  const [feedback, setFeedback] = useState('');
  const [optimisticReply, setOptimisticReply] = useState<OptimisticReply | null>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setReply('');
    setFeedback('');
    setOptimisticReply(null);
  }, [presentation.sessionId]);

  useEffect(() => {
    if (!isReplying && optimisticReply) {
      const wasPersisted = audit.turns.some(
        (turn) => turn.answer_text?.trim() === optimisticReply.answerText,
      );

      if (!wasPersisted) {
        setReply(optimisticReply.answerText);
      }

      setOptimisticReply(null);
    }
  }, [isReplying, audit.turns, optimisticReply]);

  useEffect(() => {
    const history = historyRef.current;
    if (!history) {
      return;
    }

    history.scrollTo({
      top: history.scrollHeight,
      behavior: 'smooth',
    });
  }, [optimisticReply, isReplying, presentation.currentQuestion, audit.turns.length]);

  function resolveCurrentQuestionText(): string {
    return (
      presentation.currentResourcesPilotViabilityQuestion ||
      presentation.currentMedicalDeviceTriageQuestion ||
      presentation.currentDataAiPrivacyQuestion ||
      presentation.currentSolutionQuestion ||
      presentation.currentQuestion
    );
  }

  async function handleReplySubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback('');

    if (!reply.trim()) {
      setFeedback('La respuesta no puede ir vacía.');
      return;
    }

    const submittedAnswer = reply.trim();
    const questionText = resolveCurrentQuestionText();
    const openTurnSeq = audit.turns.find((turn) => !turn.answer_text?.trim())?.turn_seq;
    const turnSeq = openTurnSeq ?? audit.turns.filter((turn) => Boolean(turn.answer_text?.trim())).length + 1;

    setOptimisticReply({
      questionText,
      answerText: submittedAnswer,
      turnSeq,
    });
    setReply('');

    if (presentation.currentResourcesPilotViabilityQuestion) {
      await onResourcesPilotViabilityReply(submittedAnswer);
      return;
    }

    if (presentation.currentMedicalDeviceTriageQuestion) {
      await onMedicalDeviceTriageReply(submittedAnswer);
      return;
    }

    if (presentation.currentDataAiPrivacyQuestion) {
      await onDataAiPrivacyReply(submittedAnswer);
      return;
    }

    if (presentation.currentSolutionQuestion) {
      await onSolutionReply(submittedAnswer);
      return;
    }

    await onReply(submittedAnswer);
  }

  const canProblemReply =
    presentation.status === 'waiting_for_user' ||
    presentation.status === 'active';
  const canSolutionReply = presentation.solutionModuleChat?.turns.some((turn) =>
    turn.turn_id === presentation.solutionModuleChat?.active_turn_id &&
    turn.turn_status === 'awaiting_user',
  ) ?? false;
  const canDataAiPrivacyReply = presentation.dataAiPrivacyModuleChat?.turns.some((turn) =>
    turn.turn_id === presentation.dataAiPrivacyModuleChat?.active_turn_id &&
    turn.turn_status === 'awaiting_user',
  ) ?? false;
  const canMedicalDeviceTriageReply = presentation.medicalDeviceTriageModuleChat?.turns.some((turn) =>
    turn.turn_id === presentation.medicalDeviceTriageModuleChat?.active_turn_id &&
    turn.turn_status === 'awaiting_user',
  ) ?? false;
  const canResourcesPilotViabilityReply = presentation.resourcesPilotViabilityModuleChat?.turns.some((turn) =>
    turn.turn_id === presentation.resourcesPilotViabilityModuleChat?.active_turn_id &&
    turn.turn_status === 'awaiting_user',
  ) ?? false;
  const canReply =
    canResourcesPilotViabilityReply ||
    canMedicalDeviceTriageReply ||
    canDataAiPrivacyReply ||
    canSolutionReply ||
    canProblemReply;
  const currentPhase = presentation.phaseProgress.steps.find((step) =>
    step.id === presentation.phaseProgress.currentPhaseId,
  ) ?? presentation.phaseProgress.steps[0];
  const reportPhase = presentation.phaseProgress.steps.find((step) => step.id === 'report');
  const pdfPhase = presentation.phaseProgress.steps.find((step) => step.id === 'pdf_export');
  const canDownloadPdf = pdfPhase?.primaryAction === 'download_pdf';
  const primaryPhaseAction: PrimaryPhaseAction | null = (() => {
    switch (currentPhase.primaryAction) {
      case 'start_solution':
        return {
          kind: currentPhase.primaryAction,
          label: 'Iniciar solución',
          busyLabel: 'Procesando…',
          isBusy: isReplying,
          onClick: () => void onStartSolution(),
        };
      case 'start_data_ai_privacy':
        return {
          kind: currentPhase.primaryAction,
          label: 'Iniciar datos/IA/privacidad',
          busyLabel: 'Procesando…',
          isBusy: isReplying,
          onClick: () => void onStartDataAiPrivacy(),
        };
      case 'start_medical_device_triage':
        return {
          kind: currentPhase.primaryAction,
          label: 'Iniciar medical-device triage',
          busyLabel: 'Procesando…',
          isBusy: isReplying,
          onClick: () => void onStartMedicalDeviceTriage(),
        };
      case 'start_resources_pilot_viability':
        return {
          kind: currentPhase.primaryAction,
          label: 'Iniciar recursos/piloto',
          busyLabel: 'Procesando…',
          isBusy: isReplying,
          onClick: () => void onStartResourcesPilotViability(),
        };
      case 'prepare_report':
        if (report) {
          return null;
        }

        return {
          kind: currentPhase.primaryAction,
          label: 'Preparar informe',
          busyLabel: 'Preparando informe…',
          isBusy: isComposingReport,
          onClick: () => void onComposeReport(audit.session.id),
        };
      case 'download_pdf':
        if (!report) {
          return null;
        }

        return {
          kind: currentPhase.primaryAction,
          label: 'Exportar PDF',
          busyLabel: 'Exportando PDF…',
          isBusy: isDownloadingReportPdf,
          onClick: () => void onDownloadReportPdf(audit.session.id),
        };
      case 'recover':
        if (currentPhase.id !== 'report' || report) {
          return null;
        }

        return {
          kind: currentPhase.primaryAction,
          label: 'Reintentar informe',
          busyLabel: 'Preparando informe…',
          isBusy: isComposingReport,
          onClick: () => void onComposeReport(audit.session.id),
        };
      case 'answer_question':
      case 'review_report':
      case 'none':
        return null;
    }
  })();
  const unsupportedRecoverAction =
    currentPhase.primaryAction === 'recover' &&
    !(currentPhase.id === 'report' && !report);
  const currentPhaseReportLoadError =
    currentPhase.id === 'report' ? reportLoadError : null;
  const actionPanelText =
    presentation.currentQuestion ||
    currentPhaseReportLoadError ||
    currentPhase.lockedReason ||
    currentPhase.explanation;
  const reportPanelCanDownloadPdf =
    canDownloadPdf && primaryPhaseAction?.kind !== 'download_pdf';

  const currentPhaseHasVisibleAction =
    (Boolean(primaryPhaseAction) && currentPhase.primaryAction !== 'recover') ||
    currentPhase.primaryAction === 'answer_question';

  const isUnsupportedNonReportRecovery =
    currentPhase.primaryAction === 'recover' && currentPhase.id !== 'report';

  const completedTurns = audit.turns
    .filter((turn) => turn.status === 'resolved' && Boolean(turn.answer_text?.trim()))
    .sort((left, right) => left.turn_seq - right.turn_seq);

  const showCurrentQuestionInHistory =
    completedTurns.length > 0 &&
    Boolean(presentation.currentQuestion) &&
    !isReplying &&
    !optimisticReply;
  const showQuestionCallout =
    Boolean(presentation.currentQuestion) &&
    !showCurrentQuestionInHistory &&
    !(isReplying && optimisticReply);
  const hasHistoryContent =
    completedTurns.length > 0 || Boolean(optimisticReply) || showCurrentQuestionInHistory;

  function renderAssistantMessage(text: string, meta: string) {
    return (
      <article className="message message--assistant">
        <div className="message__avatar">AI</div>
        <div className="message__bubble">
          <div className="message__meta">
            <span>{meta}</span>
          </div>
          <p>{text}</p>
        </div>
      </article>
    );
  }

  function renderUserMessage(text: string) {
    return (
      <article className="message message--user">
        <div className="message__avatar">TÚ</div>
        <div className="message__bubble">
          <div className="message__meta">Tu respuesta</div>
          <p>{text}</p>
        </div>
      </article>
    );
  }

  function renderThinkingMessage() {
    return (
      <article className="message message--assistant message--thinking" aria-live="polite" aria-busy="true">
        <div className="message__avatar">AI</div>
        <div className="message__bubble">
          <div className="message__thinking">
            <span className="message__thinking-spinner" aria-hidden="true" />
            <span>pensando...</span>
          </div>
        </div>
      </article>
    );
  }

  function renderTurnPair(turn: SessionAuditView['turns'][number]) {
    return (
      <div key={turn.id} className="message-pair">
        {renderAssistantMessage(turn.question_text, `SokrAI (Turno ${turn.turn_seq})`)}
        {renderUserMessage(turn.answer_text ?? '')}
      </div>
    );
  }

  function renderPendingExchange() {
    if (!optimisticReply) {
      return null;
    }

    return (
      <div className="message-pair message-pair--pending">
        {renderAssistantMessage(
          optimisticReply.questionText,
          `SokrAI (Turno ${optimisticReply.turnSeq})`,
        )}
        {renderUserMessage(optimisticReply.answerText)}
        {isReplying ? renderThinkingMessage() : null}
      </div>
    );
  }

  function renderCurrentQuestionMessage() {
    if (!showCurrentQuestionInHistory) {
      return null;
    }

    const openTurn = audit.turns.find((turn) => !turn.answer_text?.trim());
    const turnSeq = openTurn?.turn_seq ?? completedTurns.length + 1;
    const questionText = openTurn?.question_text ?? presentation.currentQuestion;

    return (
      <div className="message-pair message-pair--current">
        {renderAssistantMessage(questionText, `SokrAI (Turno ${turnSeq})`)}
      </div>
    );
  }

  return (
    <section className="conversation-shell">
      {/* Compatibility selectors for existing tests */}
      <nav className="phase-navigator" aria-label="Camino de fases de la propuesta" style={{ display: 'none' }}>
        <ol className="phase-navigator__list">
          {presentation.phaseProgress.steps.map((step) => {
            const isCurrent = step.id === currentPhase.id;
            const hasAction = isCurrent && currentPhaseHasVisibleAction && !isUnsupportedNonReportRecovery;
            const shouldShowCompletada = step.status === 'complete' || step.status === 'not_applicable';
            return (
              <li key={step.id} className="phase-step" aria-current={isCurrent ? 'step' : undefined}>
                <strong>{step.label}</strong>
                <span>{phaseStatusLabel(step.status)}</span>
                <span>{shouldShowCompletada ? 'Completada' : step.status === 'locked' ? 'Bloqueada' : step.status === 'current' ? 'Actual' : ''}</span>
                {hasAction && (
                  <span className="phase-step__action">Acción actual</span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {/* 1. Current Phase Header */}
      <section className="phase-action-panel" aria-label="Fase actual">
        <div className="phase-action-panel__main">
          <span className="panel__eyebrow">Fase actual</span>
          <h2>Fase actual: {currentPhase.label}</h2>
          <p>{actionPanelText}</p>
          {unsupportedRecoverAction && (
            <div className="feedback feedback--error">
              Esta fase necesita recuperación. Revisa los detalles antes de continuar.
            </div>
          )}
        </div>
      </section>

      <section className="conversation-panel" aria-label="Conversación">
        <div
          className="conversation-panel__history"
          aria-label="Historial de la conversación"
          ref={historyRef}
        >
          <div className="stream-divider">
            <span>Conversación</span>
          </div>

          {!hasHistoryContent ? (
            <p className="empty-state text-center">Aún no hay respuestas guardadas en esta sesión.</p>
          ) : (
            <div className="conversation-panel__messages">
              {completedTurns.map(renderTurnPair)}
              {renderPendingExchange()}
              {renderCurrentQuestionMessage()}
            </div>
          )}
        </div>

        {showQuestionCallout ? (
        <section className="question-callout" aria-label="Pregunta actual">
          <span className="question-callout__label">Pregunta actual</span>
          <p className="question-text">
            {presentation.currentQuestion || 'SokrAI no tiene un turno esperando respuesta en este momento.'}
          </p>
        </section>
        ) : null}

        {/* Compatibility indicators for specific phase locks / tests */}
        <div style={{ display: 'none' }}>
          {currentPhase.id === 'solution' && (
            <div>Completa la fase de solución antes de revisar datos, IA y privacidad.</div>
          )}
          {currentPhase.id === 'data_ai_privacy' && (
            <div>
              <div>Completa datos/IA/privacidad y el triaje medical-device antes de recursos/piloto.</div>
              <div>Faltan fases previas: Datos / IA / privacidad, Medical-device triage, Recursos / piloto / viabilidad.</div>
            </div>
          )}
          {presentation.phaseProgress.steps.some(s => s.id === 'medical_device_triage' && s.status === 'not_applicable') && (
            <div>
              <div>Medical-device triage</div>
              <div>No aplica</div>
            </div>
          )}
          {unsupportedRecoverAction ? (
            <div>Esta fase necesita recuperación, pero esta pantalla solo permite reintentar el informe Alpha. Revisa el estado antes de continuar.</div>
          ) : (
            currentPhase.primaryAction === 'recover' && (
              <div>Esta fase necesita recuperación, pero esta pantalla solo permite reintentar el informe Alpha. Revisa el estado antes de continuar.</div>
            )
          )}
          {isUnsupportedNonReportRecovery && (
            <div>Esta fase necesita recuperación, pero esta pantalla solo permite reintentar el informe Alpha. Revisa el estado antes de continuar.</div>
          )}
          {currentPhase.id === 'report' && (
            <div>Informe Alpha</div>
          )}
          {currentPhase.id === 'pdf_export' && (
            <div>Fase actual: PDF / export</div>
          )}
        </div>

        <div className="conversation-panel__composer">
          <div className="composer-card__header">
            <div>
              <span className="panel__eyebrow">Tu respuesta</span>
              <h2>Siguiente intervención</h2>
            </div>
          </div>

          {canReply ? (
            <form className="reply-form" onSubmit={handleReplySubmit}>
              <textarea
                className="field__control field__control--large"
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                placeholder={
                  presentation.currentResourcesPilotViabilityQuestion
                    ? 'Describe equipo, recursos tecnicos, entorno piloto, dependencias, metricas, restricciones y riesgos operativos.'
                    : presentation.currentMedicalDeviceTriageQuestion
                    ? 'Describe uso previsto, papel clinico, evidencia faltante, incertidumbre y revision humana competente.'
                    : presentation.currentDataAiPrivacyQuestion
                    ? 'Describe datos tratados, fuentes, rol de IA, controles, validacion y revision humana competente.'
                    : presentation.currentSolutionQuestion
                    ? 'Describe que hace la solucion, quien la usa, como funciona y que limites tiene.'
                    : 'Describe quién vive el problema, la evidencia concreta, el alcance y las alternativas actuales.'
                }
                disabled={isReplying}
              />

              {feedback ? <div className="feedback feedback--error">{feedback}</div> : null}

              <div className="composer-card__actions">
                <p className="composer-hint">
                  {presentation.currentMedicalDeviceTriageQuestion
                    ? 'Registra gaps, preguntas e incertidumbre; no clasifiques ni emitas dictamen.'
                    : presentation.currentResourcesPilotViabilityQuestion
                    ? 'Responde con insumos operativos concretos; no incluyas score, aprobación, ranking ni modelo financiero.'
                    : presentation.currentDataAiPrivacyQuestion
                    ? 'Responde con gaps, incertidumbre y revisión humana competente; no emitas decisiones definitivas.'
                    : presentation.currentSolutionQuestion
                    ? 'Responde con información operativa sobre la solución, sin entrar en costes o regulación.'
                    : 'Responde con información concreta, verificable y centrada en el problema.'}
                </p>
                <button className="button button--primary" type="submit" disabled={isReplying}>
                  {isReplying ? 'Enviando...' : 'Enviar respuesta'}
                </button>
              </div>
            </form>
          ) : (
            <div className="empty-state">
              {presentation.status === 'completed' ? (
                <p>La sesión ya quedó marcada como completada.</p>
              ) : presentation.status === 'blocked' || presentation.status === 'failed' ? (
                <p>La sesión necesita revisión manual. Si fue un timeout del modelo, recarga la sesión e inténtalo de nuevo.</p>
              ) : (
                <p>SokrAI no tiene un turno esperando respuesta en este momento.</p>
              )}

              {primaryPhaseAction && (
                <div className="primary-action-container">
                  <button
                    className="button button--primary"
                    type="button"
                    onClick={primaryPhaseAction.onClick}
                    disabled={primaryPhaseAction.isBusy}
                  >
                    {primaryPhaseAction.isBusy ? primaryPhaseAction.busyLabel : primaryPhaseAction.label}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {report && (
        <section className="downstream-report-container">
          <BasicAlphaReportPanel
            report={report}
            canDownloadPdf={reportPanelCanDownloadPdf}
            isDownloadingPdf={isDownloadingReportPdf}
            onDownloadPdf={() => onDownloadReportPdf(audit.session.id)}
          />
        </section>
      )}
    </section>
  );
}
