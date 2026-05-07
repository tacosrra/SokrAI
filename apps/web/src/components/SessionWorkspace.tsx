import { useEffect, useState } from 'react';

import type { SessionAuditView } from '../domain/contracts';
import type { SessionPresentation } from '../lib/session-view';
import { StatusBadge, agentTone, sessionTone } from './StatusBadge';

interface SessionWorkspaceProps {
  audit: SessionAuditView;
  isReplying: boolean;
  isSwitchingSpecialty: boolean;
  onReply: (answer: string) => Promise<void>;
  onSwitchSpecialty: (specialty: 'default' | 'legal') => Promise<void>;
  presentation: SessionPresentation;
}

export function SessionWorkspace({
  audit,
  isReplying,
  isSwitchingSpecialty,
  onReply,
  onSwitchSpecialty,
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

    await onReply(reply.trim());
  }

  const canReply =
    presentation.status === 'waiting_for_user' ||
    presentation.status === 'active';
  const resolvedTurns = audit.turns.filter((turn) => Boolean(turn.answer_text?.trim())).length;
  const currentSpecialty = audit.session.current_specialty ?? audit.session.specialty ?? 'default';

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

        <div className="conversation-toolbar__specialty">
          <span className="conversation-toolbar__specialty-label">Agente activo</span>
          {currentSpecialty === 'legal' && (
            <span className="specialty-badge specialty-badge--legal">Legal</span>
          )}
          <div className="specialty-toggle">
            <button
              className={`specialty-toggle__option ${currentSpecialty !== 'legal' ? 'specialty-toggle__option--active' : ''}`}
              type="button"
              onClick={() => void onSwitchSpecialty('default')}
              disabled={isSwitchingSpecialty || isReplying || currentSpecialty !== 'legal'}
            >
              Planificador
            </button>
            <button
              className={`specialty-toggle__option ${currentSpecialty === 'legal' ? 'specialty-toggle__option--active' : ''}`}
              type="button"
              onClick={() => void onSwitchSpecialty('legal')}
              disabled={isSwitchingSpecialty || isReplying || currentSpecialty === 'legal'}
            >
              Legal
            </button>
          </div>
        </div>
      </section>

      <section className="question-callout">
        <span className="question-callout__label">Pregunta abierta</span>
        <p>{presentation.currentQuestion || 'La sesión no tiene una pregunta abierta en este momento.'}</p>
      </section>

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

        {canReply ? (
          <form className="reply-form" onSubmit={handleReplySubmit}>
            <textarea
              className="field__control field__control--large"
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              placeholder="Describe quién vive el problema, la evidencia concreta, el alcance y las alternativas actuales."
              disabled={isReplying}
            />

            {feedback ? <div className="feedback feedback--error">{feedback}</div> : null}

            <div className="composer-card__actions">
              <p>Responde en un tono operativo: concreto, verificable y centrado en el problema.</p>
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
