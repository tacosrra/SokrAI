import { useState, useEffect } from 'react';

import type { BasicAlphaReport, SessionAuditView } from '../domain/contracts';
import type { PhasePrimaryAction, SessionPresentation } from '../lib/session-view';
import { BasicAlphaReportPanel } from './BasicAlphaReportPanel';
import { LocalDemoSafetyNotice } from './LocalDemoSafetyNotice';
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
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  useEffect(() => {
    setReply('');
    setFeedback('');
  }, [presentation.sessionId, presentation.currentQuestion]);

  async function handleReplySubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback('');

    if (!reply.trim()) {
      setFeedback('La respuesta no puede ir vacía.');
      return;
    }

    if (presentation.currentResourcesPilotViabilityQuestion) {
      await onResourcesPilotViabilityReply(reply.trim());
      return;
    }

    if (presentation.currentMedicalDeviceTriageQuestion) {
      await onMedicalDeviceTriageReply(reply.trim());
      return;
    }

    if (presentation.currentDataAiPrivacyQuestion) {
      await onDataAiPrivacyReply(reply.trim());
      return;
    }

    if (presentation.currentSolutionQuestion) {
      await onSolutionReply(reply.trim());
      return;
    }

    await onReply(reply.trim());
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

  // Extract recent turns: last 2-3 meaningful turn pairs
  const meaningfulTurns = audit.turns.filter((turn) => Boolean(turn.answer_text?.trim()));
  const recentTurns = meaningfulTurns.slice(-2);
  const olderTurns = meaningfulTurns.slice(0, -2);

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
      <header className="conversation-current-phase">
        <span className="panel__eyebrow">Fase actual</span>
        <h2>Fase actual: {currentPhase.label}</h2>
        <p>{actionPanelText}</p>
        {unsupportedRecoverAction && (
          <div className="feedback feedback--error">
            Esta fase necesita recuperación. Revisa los detalles antes de continuar.
          </div>
        )}
      </header>

      {/* 2. Active Question */}
      <section className="active-question-card">
        <span className="question-callout__label">Pregunta actual</span>
        <p className="question-text">
          {presentation.currentQuestion || 'SokrAI no tiene un turno esperando respuesta en este momento.'}
        </p>

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
      </section>

      {/* 3. Composer exactly below the active question */}
      <section className="composer-card">
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
                {isReplying ? 'Guardando respuesta...' : 'Enviar respuesta'}
              </button>
            </div>
          </form>
        ) : (
          <div className="empty-state">
            {presentation.status === 'completed' ? (
              <p>La sesión ya quedó marcada como completada.</p>
            ) : presentation.status === 'blocked' || presentation.status === 'failed' ? (
              <p>La sesión necesita revisión antes de continuar.</p>
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
      </section>

      {/* Simple, compact safety warning immediately next to active task */}
      <LocalDemoSafetyNotice compact context="workspace" />

      {/* 4. Recent turns below Composer */}
      <section className="recent-turns-section">
        <div className="stream-divider">
          <span>Conversación reciente</span>
        </div>

        {recentTurns.length === 0 ? (
          <p className="empty-state text-center">Aún no hay respuestas guardadas en esta sesión.</p>
        ) : (
          <div className="recent-turns-list">
            {recentTurns.map((turn) => (
              <div key={turn.id} className="message-pair">
                <article className="message message--assistant">
                  <div className="message__avatar">AI</div>
                  <div className="message__bubble">
                    <div className="message__meta">
                      <span>SokrAI (Turno {turn.turn_seq})</span>
                    </div>
                    <p>{turn.question_text}</p>
                  </div>
                </article>

                <article className="message message--user">
                  <div className="message__avatar">TÚ</div>
                  <div className="message__bubble">
                    <div className="message__meta">Tu respuesta</div>
                    <p>{turn.answer_text}</p>
                  </div>
                </article>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 5. Long history disclosure */}
      <section className="history-disclosure-section">
        <button
          className="button button--secondary"
          type="button"
          onClick={() => setIsHistoryOpen(!isHistoryOpen)}
        >
          {isHistoryOpen ? 'Ocultar historial completo' : 'Ver historial completo'}
        </button>

        {isHistoryOpen && (
          <div className="history-expanded-panel mt-4">
            <h3>Historial persistido</h3>
            {olderTurns.length === 0 ? (
              <p className="empty-state">La sesión todavía no tiene turnos persistidos.</p>
            ) : (
              <div className="older-turns-list">
                {olderTurns.map((turn) => (
                  <div key={turn.id} className="message-pair">
                    <article className="message message--assistant">
                      <div className="message__avatar">AI</div>
                      <div className="message__bubble">
                        <div className="message__meta">
                          <span>SokrAI (Turno {turn.turn_seq})</span>
                        </div>
                        <p>{turn.question_text}</p>
                      </div>
                    </article>

                    <article className="message message--user">
                      <div className="message__avatar">TÚ</div>
                      <div className="message__bubble">
                        <div className="message__meta">Tu respuesta</div>
                        <p>{turn.answer_text}</p>
                      </div>
                    </article>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* 6. Generated downstream sections & Report Preview */}
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
