import { useState, useEffect, useRef } from 'react';

import { SokrAiLogo } from './SokrAiLogoLoader';
import { ThinkingDots } from './ThinkingDots';
import type { BasicAlphaReport, SessionAuditView } from '../domain/contracts';
import type { PhaseId, PhasePrimaryAction, SessionPresentation } from '../lib/session-view';
import { getPhaseLabel } from '../lib/session-view';
import { BasicAlphaReportPanel } from './BasicAlphaReportPanel';

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
  viewingPhaseId?: PhaseId;
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
  viewingPhaseId,
}: SessionWorkspaceProps) {
  const [reply, setReply] = useState('');
  const [feedback, setFeedback] = useState('');
  const [optimisticReply, setOptimisticReply] = useState<OptimisticReply | null>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const activeViewingPhaseId = viewingPhaseId ?? presentation.phaseProgress.currentPhaseId;
  const isViewingHistoricalPhase = activeViewingPhaseId !== presentation.phaseProgress.currentPhaseId;
  const historyTurns = presentation.conversationHistoryByPhase[activeViewingPhaseId] ?? [];

  useEffect(() => {
    setReply('');
    setFeedback('');
    setOptimisticReply(null);
  }, [presentation.sessionId, activeViewingPhaseId]);

  useEffect(() => {
    if (!isReplying && optimisticReply) {
      const wasPersisted = historyTurns.some(
        (turn) => turn.answer_text?.trim() === optimisticReply.answerText,
      );

      if (!wasPersisted) {
        setReply(optimisticReply.answerText);
      }

      setOptimisticReply(null);
    }
  }, [isReplying, historyTurns, optimisticReply]);

  useEffect(() => {
    const history = historyRef.current;
    if (!history) {
      return;
    }

    if (typeof history.scrollTo === 'function') {
      history.scrollTo({
        top: history.scrollHeight,
        behavior: 'smooth',
      });
      return;
    }

    history.scrollTop = history.scrollHeight;
  }, [
    optimisticReply,
    isReplying,
    presentation.currentQuestion,
    presentation.currentSolutionQuestion,
    presentation.currentDataAiPrivacyQuestion,
    presentation.currentMedicalDeviceTriageQuestion,
    presentation.currentResourcesPilotViabilityQuestion,
    historyTurns.length,
    activeViewingPhaseId,
  ]);

  function resolveCurrentQuestionText(): string {
    if (isViewingHistoricalPhase) {
      const openTurn = historyTurns.find((turn) => !turn.answer_text?.trim());
      return openTurn?.question_text ?? '';
    }

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
    const openTurnSeq = historyTurns.find((turn) => !turn.answer_text?.trim())?.turn_seq;
    const turnSeq =
      openTurnSeq ?? historyTurns.filter((turn) => Boolean(turn.answer_text?.trim())).length + 1;

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
    !isViewingHistoricalPhase &&
    (canResourcesPilotViabilityReply ||
      canMedicalDeviceTriageReply ||
      canDataAiPrivacyReply ||
      canSolutionReply ||
      canProblemReply);
  const currentPhase = presentation.phaseProgress.steps.find((step) =>
    step.id === presentation.phaseProgress.currentPhaseId,
  ) ?? presentation.phaseProgress.steps[0];
  const currentPhaseModuleChat = (() => {
    switch (currentPhase.id) {
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
  })();
  const currentPhaseIsProcessing = currentPhaseModuleChat?.turns.some((turn) =>
    turn.turn_id === currentPhaseModuleChat.active_turn_id &&
    turn.turn_status === 'processing',
  ) ?? false;
  const currentPhaseIsPreparing =
    !isViewingHistoricalPhase &&
    currentPhaseModuleChat?.chat_status === 'preparing';
  const pdfPhase = presentation.phaseProgress.steps.find((step) => step.id === 'pdf_export');
  const canDownloadPdf = pdfPhase?.primaryAction === 'download_pdf';
  const primaryPhaseAction: PrimaryPhaseAction | null = (() => {
    switch (currentPhase.primaryAction) {
      case 'start_solution':
        return {
          kind: currentPhase.primaryAction,
          label: 'Empezar solución',
          busyLabel: 'Preparando...',
          isBusy: isReplying,
          onClick: () => void onStartSolution(),
        };
      case 'start_data_ai_privacy':
        return {
          kind: currentPhase.primaryAction,
          label: 'Revisar datos y privacidad',
          busyLabel: 'Preparando...',
          isBusy: isReplying,
          onClick: () => void onStartDataAiPrivacy(),
        };
      case 'start_medical_device_triage':
        return {
          kind: currentPhase.primaryAction,
          label: 'Revisar aspectos sanitarios',
          busyLabel: 'Preparando...',
          isBusy: isReplying,
          onClick: () => void onStartMedicalDeviceTriage(),
        };
      case 'start_resources_pilot_viability':
        return {
          kind: currentPhase.primaryAction,
          label: 'Preparar piloto y recursos',
          busyLabel: 'Preparando...',
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
          busyLabel: 'Preparando informe...',
          isBusy: isComposingReport,
          onClick: () => void onComposeReport(audit.session.id),
        };
      case 'download_pdf':
        return null;
      case 'recover':
        if (currentPhase.id !== 'report' || report) {
          return null;
        }

        return {
          kind: currentPhase.primaryAction,
          label: 'Reintentar informe',
          busyLabel: 'Preparando informe...',
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
    currentPhaseIsPreparing
      ? 'SokrAI está comprobando si la información disponible basta para cerrar esta fase o si necesita hacerte una pregunta.'
      : presentation.currentQuestion ||
        currentPhaseReportLoadError ||
        currentPhase.lockedReason ||
        currentPhase.explanation;
  const reportPanelCanDownloadPdf = canDownloadPdf;

  const completedTurns = historyTurns
    .filter((turn) => turn.status === 'resolved' && Boolean(turn.answer_text?.trim()))
    .sort((left, right) => left.turn_seq - right.turn_seq);

  const openHistoryTurn = historyTurns.find(
    (turn) =>
      turn.status === 'awaiting_user' ||
      turn.status === 'processing' ||
      (turn.status === 'failed' && Boolean(turn.answer_text?.trim())),
  );
  const viewingPhaseQuestion = resolveCurrentQuestionText();

  const showCurrentQuestionInHistory =
    !isViewingHistoricalPhase &&
    (completedTurns.length > 0 || Boolean(openHistoryTurn)) &&
    Boolean(viewingPhaseQuestion) &&
    !isReplying &&
    !optimisticReply;
  const showQuestionCallout =
    !isViewingHistoricalPhase &&
    Boolean(viewingPhaseQuestion) &&
    !showCurrentQuestionInHistory &&
    !(isReplying && optimisticReply);
  const hasHistoryContent =
    completedTurns.length > 0 ||
    Boolean(optimisticReply) ||
    showCurrentQuestionInHistory ||
    (isViewingHistoricalPhase && Boolean(openHistoryTurn)) ||
    currentPhaseIsPreparing;

  function renderAssistantAvatar() {
    return (
      <div className="message__avatar message__avatar--assistant" aria-hidden="true">
        <SokrAiLogo size="xs" />
      </div>
    );
  }

  function renderAssistantMessage(text: string, meta: string) {
    return (
      <article className="message message--assistant">
        {renderAssistantAvatar()}
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
        <div className="message__avatar">Tú</div>
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
        {renderAssistantAvatar()}
        <div className="message__bubble">
          <div className="message__thinking">
            <ThinkingDots />
          </div>
        </div>
      </article>
    );
  }

  function renderTurnPair(turn: (typeof historyTurns)[number]) {
    return (
      <div key={turn.id} className="message-pair">
        {renderAssistantMessage(turn.question_text, `Pregunta ${turn.turn_seq}`)}
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
          `Pregunta ${optimisticReply.turnSeq}`,
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

    const openTurn = historyTurns.find((turn) => !turn.answer_text?.trim());
    const turnSeq = openTurn?.turn_seq ?? completedTurns.length + 1;
    const questionText = openTurn?.question_text ?? viewingPhaseQuestion;

    return (
      <div className="message-pair message-pair--current">
        {renderAssistantMessage(questionText, `Pregunta ${turnSeq}`)}
      </div>
    );
  }

  function renderHistoricalOpenQuestion() {
    if (!isViewingHistoricalPhase || !openHistoryTurn?.question_text || optimisticReply) {
      return null;
    }

    return (
      <div className="message-pair message-pair--current">
        {renderAssistantMessage(
          openHistoryTurn.question_text,
          `Pregunta ${openHistoryTurn.turn_seq}`,
        )}
      </div>
    );
  }

  function renderPhasePreparationSkeleton() {
    if (!currentPhaseIsPreparing) {
      return null;
    }

    return (
      <article className="phase-preparation-skeleton" aria-live="polite" aria-busy="true">
        <div className="phase-preparation-skeleton__header">
          <span className="phase-preparation-skeleton__eyebrow">Preparando</span>
          <h3>Preparando {currentPhase.label.toLowerCase()}</h3>
        </div>
        <p>
          SokrAI está comprobando si la información disponible basta para cerrar esta fase o si necesita hacerte una pregunta.
        </p>
        <div className="phase-preparation-skeleton__question" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </article>
    );
  }

  function renderComposerPreparationSkeleton() {
    return (
      <div className="composer-preparation-skeleton" aria-live="polite" aria-busy="true">
        <p>Preparando el siguiente paso de esta fase.</p>
        <div className="composer-preparation-skeleton__lines" aria-hidden="true">
          <span />
          <span />
        </div>
      </div>
    );
  }

  return (
    <section className="conversation-shell">
      <section className="phase-action-panel" aria-label={isViewingHistoricalPhase ? 'Fase en revisión' : 'Fase actual'}>
        <div className="phase-action-panel__main">
          <span className="panel__eyebrow">
            {isViewingHistoricalPhase ? 'Historial de fase' : 'Fase actual'}
          </span>
          <h2>
            {isViewingHistoricalPhase
              ? `Revisando: ${getPhaseLabel(activeViewingPhaseId)}`
              : `Fase actual: ${currentPhase.label}`}
          </h2>
          <p>
            {isViewingHistoricalPhase
              ? 'Estás viendo el historial de esta fase. Selecciona la fase actual en el panel izquierdo para seguir respondiendo.'
              : actionPanelText}
          </p>
          {unsupportedRecoverAction && !isViewingHistoricalPhase && (
            <div className="feedback feedback--error">
              Esta fase necesita revisarse antes de continuar.
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
            <p className="empty-state text-center">
              {isViewingHistoricalPhase
                ? 'Esta fase todavía no tiene conversación guardada.'
                : 'Aún no hay respuestas guardadas en esta propuesta.'}
            </p>
          ) : (
            <div className="conversation-panel__messages">
              {completedTurns.map(renderTurnPair)}
              {renderPendingExchange()}
              {renderCurrentQuestionMessage()}
              {renderHistoricalOpenQuestion()}
              {renderPhasePreparationSkeleton()}
            </div>
          )}
        </div>

        {showQuestionCallout ? (
        <section className="question-callout" aria-label="Pregunta actual">
          <span className="question-callout__label">Pregunta actual</span>
          <p className="question-text">
            {presentation.currentQuestion || 'SokrAI no tiene una pregunta pendiente en este momento.'}
          </p>
        </section>
        ) : null}

        <div className="conversation-panel__composer">
          <div className="composer-card__header">
            <div>
              <span className="panel__eyebrow">Tu respuesta</span>
              <h2>Responde a la pregunta actual</h2>
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
                    ? 'Describe equipo, recursos técnicos, entorno piloto, dependencias, indicadores, restricciones y riesgos operativos.'
                    : presentation.currentMedicalDeviceTriageQuestion
                    ? 'Describe el uso previsto, el papel clínico u operativo, la evidencia pendiente y quién debería revisarlo.'
                    : presentation.currentDataAiPrivacyQuestion
                    ? 'Describe los datos tratados, sus fuentes, el papel de la IA, los controles y la revisión humana prevista.'
                    : presentation.currentSolutionQuestion
                    ? 'Describe qué haría la solución, quién la usaría, cómo funcionaría y qué límites tendría.'
                    : 'Describe quién vive el problema, la evidencia concreta, el alcance y las alternativas actuales.'
                }
                disabled={isReplying}
              />

              {feedback ? <div className="feedback feedback--error">{feedback}</div> : null}

              <div className="composer-card__actions">
                <p className="composer-hint">
                  {presentation.currentMedicalDeviceTriageQuestion
                    ? 'No emitas clasificaciones ni dictámenes. Deja claro qué necesita revisión competente.'
                    : presentation.currentResourcesPilotViabilityQuestion
                    ? 'Responde con información operativa concreta. No incluyas aprobaciones, rankings ni modelos financieros.'
                    : presentation.currentDataAiPrivacyQuestion
                    ? 'Describe incertidumbres y controles. No emitas decisiones definitivas.'
                    : presentation.currentSolutionQuestion
                    ? 'Responde con información operativa sobre la solución, sin cerrar costes ni regulación.'
                    : 'Responde con información concreta, verificable y centrada en el problema.'}
                </p>
                <button className="button button--primary" type="submit" disabled={isReplying}>
                  {isReplying ? 'Enviando...' : 'Enviar respuesta'}
                </button>
              </div>
            </form>
          ) : isViewingHistoricalPhase ? (
            <div className="empty-state">
              <p>
                Estás revisando el historial de {getPhaseLabel(activeViewingPhaseId)}. Selecciona la fase
                actual en el panel izquierdo para seguir respondiendo.
              </p>
            </div>
          ) : currentPhaseIsPreparing ? (
            renderComposerPreparationSkeleton()
          ) : (
            <div className="empty-state">
              {currentPhaseIsProcessing ? (
                <p>SokrAI está procesando tu respuesta de esta fase.</p>
              ) : presentation.status === 'completed' && presentation.phaseProgress.isComplete ? (
                <p>La propuesta está completada y lista para revisión.</p>
              ) : presentation.status === 'completed' ? (
                <p>Esta fase ya está completada. Continúa con la siguiente fase cuando esté disponible.</p>
              ) : presentation.status === 'blocked' || presentation.status === 'failed' ? (
                <p>La propuesta necesita revisión antes de continuar. Recárgala o vuelve a intentarlo.</p>
              ) : (
                <p>SokrAI no tiene una pregunta pendiente en este momento.</p>
              )}

              {primaryPhaseAction && !isViewingHistoricalPhase && (
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
            generatedSections={audit.generated_sections}
            canDownloadPdf={reportPanelCanDownloadPdf}
            isDownloadingPdf={isDownloadingReportPdf}
            onDownloadPdf={() => onDownloadReportPdf(audit.session.id)}
          />
        </section>
      )}
    </section>
  );
}
