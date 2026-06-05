import { useEffect, useState } from 'react';

import type { BasicAlphaReport, SessionAuditView } from '../domain/contracts';
import type { SessionPresentation } from '../lib/session-view';
import { BasicAlphaReportPanel } from './BasicAlphaReportPanel';
import { LocalDemoSafetyNotice } from './LocalDemoSafetyNotice';
import { StatusBadge, agentTone, sessionTone } from './StatusBadge';

interface SessionWorkspaceProps {
  audit: SessionAuditView;
  report: BasicAlphaReport | null;
  isReplying: boolean;
  isDownloadingReportPdf: boolean;
  onReply: (answer: string) => Promise<void>;
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

export function SessionWorkspace({
  audit,
  report,
  isReplying,
  isDownloadingReportPdf,
  onReply,
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
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setReply('');
    setFeedback('');
  }, [presentation.sessionId, presentation.currentQuestion]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(presentation.sessionId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

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
  const canStartSolution = Boolean(
    presentation.latestProblemSection &&
      !canSolutionReply &&
      presentation.solutionModuleChat?.chat_status !== 'completed' &&
      presentation.solutionModuleChat?.chat_status !== 'waiting_for_user',
  );
  const canStartDataAiPrivacy = Boolean(
    presentation.latestSolutionSection &&
      !canDataAiPrivacyReply &&
      presentation.dataAiPrivacyModuleChat?.chat_status !== 'completed' &&
      presentation.dataAiPrivacyModuleChat?.chat_status !== 'waiting_for_user',
  );
  const canStartMedicalDeviceTriage = Boolean(
    presentation.latestDataAiPrivacySection &&
      !canMedicalDeviceTriageReply &&
      presentation.medicalDeviceTriageModuleChat?.chat_status !== 'completed' &&
      presentation.medicalDeviceTriageModuleChat?.chat_status !== 'waiting_for_user',
  );
  const canStartResourcesPilotViability = Boolean(
    presentation.latestSolutionSection &&
      !canResourcesPilotViabilityReply &&
      presentation.resourcesPilotViabilityModuleChat?.chat_status !== 'completed' &&
      presentation.resourcesPilotViabilityModuleChat?.chat_status !== 'waiting_for_user',
  );
  const resolvedTurns = audit.turns.filter((turn) => Boolean(turn.answer_text?.trim())).length;

  return (
    <section className="conversation-shell">
      <header className="conversation-header">
        <div className="conversation-header__intro">
          <div className="conversation-header__orb" aria-hidden="true">
            <span>AI</span>
          </div>

          <div>
            <div className="panel__eyebrow">Entrevista activa</div>
            <h1>{presentation.projectTitle}</h1>
            <p>{presentation.goal}</p>
          </div>
        </div>

        <div className="conversation-header__meta">
          <div className="session-token">
            <span>Session ID</span>
            <strong>{presentation.sessionId}</strong>
          </div>

          <button className="button button--ghost" type="button" onClick={() => void handleCopy()}>
            {copied ? 'Copiado' : 'Copiar ID'}
          </button>
        </div>
      </header>

      <section className="conversation-toolbar">
        <div className="conversation-toolbar__badges">
          <StatusBadge label={presentation.stage.replace('_', ' ')} tone="neutral" />
          <StatusBadge
            label={presentation.status.replaceAll('_', ' ')}
            tone={sessionTone(presentation.status)}
          />
          <StatusBadge
            label={`agent ${presentation.agentStatus}`}
            tone={agentTone(presentation.agentStatus)}
          />
        </div>

        <div className="conversation-toolbar__stats">
          <article className="conversation-toolbar__stat">
            <span>Turnos resueltos</span>
            <strong>{resolvedTurns}</strong>
          </article>
          <article className="conversation-toolbar__stat">
            <span>Categorías</span>
            <strong>
              {presentation.progress.completedItems}/{presentation.progress.totalItems}
            </strong>
          </article>
          <article className="conversation-toolbar__stat">
            <span>Snapshots</span>
            <strong>{presentation.snapshotCount}</strong>
          </article>
        </div>
      </section>

      <LocalDemoSafetyNotice compact context="workspace" />

      <section className="question-callout">
        <span className="question-callout__label">
          {presentation.currentResourcesPilotViabilityQuestion
            ? 'Pregunta abierta de recursos/piloto'
            : presentation.currentMedicalDeviceTriageQuestion
            ? 'Pregunta abierta de medical-device triage'
            : presentation.currentDataAiPrivacyQuestion
            ? 'Pregunta abierta de datos/IA/privacidad'
            : presentation.currentSolutionQuestion
              ? 'Pregunta abierta de solución'
              : 'Pregunta abierta'}
        </span>
        <p>{presentation.currentQuestion || 'La sesión no tiene una pregunta abierta en este momento.'}</p>
      </section>

      {presentation.latestProblemSection ? (
        <section className="question-callout">
          <span className="question-callout__label">Carril de solución</span>
          <p>
            {presentation.latestSolutionSection
              ? `Se generó ${presentation.latestSolutionSection.title} v${presentation.latestSolutionSection.section_version}.`
              : presentation.solutionModuleChat
                ? `Estado: ${presentation.solutionModuleChat.chat_status.replaceAll('_', ' ')}.`
                : 'El problema ya tiene sección generada y la solución puede iniciarse.'}
          </p>

          {canStartSolution ? (
            <button
              className="button button--secondary"
              type="button"
              onClick={() => void onStartSolution()}
              disabled={isReplying}
            >
              {isReplying ? 'Procesando…' : 'Iniciar solución'}
            </button>
          ) : null}
        </section>
      ) : null}

      {presentation.latestSolutionSection ? (
        <section className="question-callout">
          <span className="question-callout__label">Carril datos/IA/privacidad</span>
          <p>
            {presentation.latestDataAiPrivacySection
              ? `Se generó ${presentation.latestDataAiPrivacySection.title} v${presentation.latestDataAiPrivacySection.section_version}.`
              : presentation.dataAiPrivacyModuleChat
                ? `Estado: ${presentation.dataAiPrivacyModuleChat.chat_status.replaceAll('_', ' ')}.`
                : 'La solución ya tiene sección generada y el módulo de gaps sensibles puede iniciarse.'}
          </p>

          {canStartDataAiPrivacy ? (
            <button
              className="button button--secondary"
              type="button"
              onClick={() => void onStartDataAiPrivacy()}
              disabled={isReplying}
            >
              {isReplying ? 'Procesando…' : 'Iniciar datos/IA/privacidad'}
            </button>
          ) : null}

          <LocalDemoSafetyNotice compact context="clinic-module" />
        </section>
      ) : null}

      {presentation.latestDataAiPrivacySection ? (
        <section className="question-callout question-callout--muted">
          <span className="question-callout__label">{presentation.latestDataAiPrivacySection.title}</span>
          <p>{presentation.latestDataAiPrivacySection.content_markdown}</p>
        </section>
      ) : null}

      {presentation.latestDataAiPrivacySection ? (
        <section className="question-callout">
          <span className="question-callout__label">Medical-device triage</span>
          <p>
            {presentation.latestMedicalDeviceTriageSection
              ? `Se generó ${presentation.latestMedicalDeviceTriageSection.title} v${presentation.latestMedicalDeviceTriageSection.section_version}.`
              : presentation.medicalDeviceTriageModuleChat
                ? `Estado: ${presentation.medicalDeviceTriageModuleChat.chat_status.replaceAll('_', ' ')}.`
                : 'El módulo registra gaps/questions/uncertainty cuando hay señales o incertidumbre y requiere competent human review cuando corresponde.'}
          </p>

          {canStartMedicalDeviceTriage ? (
            <button
              className="button button--secondary"
              type="button"
              onClick={() => void onStartMedicalDeviceTriage()}
              disabled={isReplying}
            >
              {isReplying ? 'Procesando…' : 'Iniciar medical-device triage'}
            </button>
          ) : null}

          <LocalDemoSafetyNotice compact context="clinic-module" />
        </section>
      ) : null}

      {presentation.latestMedicalDeviceTriageSection ? (
        <section className="question-callout question-callout--muted">
          <span className="question-callout__label">{presentation.latestMedicalDeviceTriageSection.title}</span>
          <p>{presentation.latestMedicalDeviceTriageSection.content_markdown}</p>
        </section>
      ) : null}

      {presentation.latestSolutionSection ? (
        <section className="question-callout">
          <span className="question-callout__label">Recursos, piloto e insumos operativos</span>
          <p>
            {presentation.latestResourcesPilotViabilitySection
              ? `Se generó ${presentation.latestResourcesPilotViabilitySection.title} v${presentation.latestResourcesPilotViabilitySection.section_version}.`
              : presentation.resourcesPilotViabilityModuleChat
                ? `Estado: ${presentation.resourcesPilotViabilityModuleChat.chat_status.replaceAll('_', ' ')}.`
                : 'La solución ya tiene sección generada y el módulo puede recoger recursos, entorno, dependencias, métricas, restricciones y riesgos operativos.'}
          </p>

          {canStartResourcesPilotViability ? (
            <button
              className="button button--secondary"
              type="button"
              onClick={() => void onStartResourcesPilotViability()}
              disabled={isReplying}
            >
              {isReplying ? 'Procesando…' : 'Iniciar recursos/piloto'}
            </button>
          ) : null}

          <LocalDemoSafetyNotice compact context="clinic-module" />
        </section>
      ) : null}

      {presentation.latestResourcesPilotViabilitySection ? (
        <section className="question-callout question-callout--muted">
          <span className="question-callout__label">{presentation.latestResourcesPilotViabilitySection.title}</span>
          <p>{presentation.latestResourcesPilotViabilitySection.content_markdown}</p>
        </section>
      ) : null}

      {report ? (
        <BasicAlphaReportPanel
          report={report}
          isDownloadingPdf={isDownloadingReportPdf}
          onDownloadPdf={() => onDownloadReportPdf(audit.session.id)}
        />
      ) : presentation.latestProblemSection && presentation.latestSolutionSection ? (
        <section className="question-callout question-callout--muted">
          <span className="question-callout__label">Informe Alpha</span>
          <p>El informe estructurado todavía no está compuesto para esta sesión.</p>
        </section>
      ) : null}

      <div className="conversation-stream">
        <div className="stream-divider">
          <span>Historial persistido</span>
        </div>

        <article className="message message--system">
          <div className="message__avatar">AI</div>
          <div className="message__bubble">
            <div className="message__meta">Estado del carril</div>
            <p>{presentation.progress.description}</p>
          </div>
        </article>

        {audit.turns.length === 0 ? (
          <div className="empty-state">
            La sesión todavía no tiene turnos persistidos en `conversation_turns`.
          </div>
        ) : (
          audit.turns.map((turn) => (
            <div key={turn.id} className="message-pair">
              <article className="message message--assistant">
                <div className="message__avatar">AI</div>
                <div className="message__bubble">
                  <div className="message__meta">
                    <span>Turno {turn.turn_seq}</span>
                    <StatusBadge label={turn.status.replaceAll('_', ' ')} tone="neutral" />
                  </div>
                  <p>{turn.question_text}</p>

                  {turn.diagnosis_json.length > 0 ? (
                    <ul className="message__chips">
                      {turn.diagnosis_json.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : null}

                  {turn.completion_reason ? (
                    <div className="message__note">{turn.completion_reason}</div>
                  ) : null}
                </div>
              </article>

              {turn.answer_text ? (
                <article className="message message--user">
                  <div className="message__avatar">TÚ</div>
                  <div className="message__bubble">
                    <div className="message__meta">Respuesta del usuario</div>
                    <p>{turn.answer_text}</p>
                  </div>
                </article>
              ) : null}
            </div>
          ))
        )}

        {isReplying ? (
          <article className="message message--assistant">
            <div className="message__avatar">AI</div>
            <div className="message__bubble message__bubble--typing">
              <div className="message__meta">Procesando turno</div>
              <div className="typing-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            </div>
          </article>
        ) : null}
      </div>

      <section className="composer-card">
        <div className="composer-card__header">
          <div>
            <span className="panel__eyebrow">Responder</span>
            <h2>Siguiente intervención</h2>
            <p>La respuesta se envía a `proposal-reply-v1` y actualiza el estado real de la sesión.</p>
          </div>
        </div>

        <LocalDemoSafetyNotice compact context="clinic-module" />

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
              <p>
                {presentation.currentMedicalDeviceTriageQuestion
                  ? 'Responde solo con gaps/questions/uncertainty y competent human review; no clasifiques.'
                  : presentation.currentResourcesPilotViabilityQuestion
                  ? 'Responde con insumos operativos concretos; no incluyas score, aprobacion, ranking ni modelo financiero.'
                  : presentation.currentDataAiPrivacyQuestion
                  ? 'Responde con gaps, incertidumbre y revision humana competente; no emitas decisiones definitivas.'
                  : presentation.currentSolutionQuestion
                  ? 'Responde con informacion operativa sobre la solucion, sin entrar en costes o regulacion.'
                  : 'Responde en un tono operativo: concreto, verificable y centrado en el problema.'}
              </p>
              <button className="button button--primary" type="submit" disabled={isReplying}>
                {isReplying ? 'Procesando turno…' : 'Enviar respuesta'}
              </button>
            </div>
          </form>
        ) : (
          <div className="empty-state">
            {presentation.status === 'completed'
              ? 'La sesión ya quedó marcada como completada.'
              : presentation.status === 'blocked' || presentation.status === 'failed'
                ? 'La sesión quedó bloqueada. Revisa el estado antes de reintentar.'
                : 'No hay un turno esperando respuesta.'}
          </div>
        )}
      </section>
    </section>
  );
}
