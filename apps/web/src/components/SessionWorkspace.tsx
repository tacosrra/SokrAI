import { useEffect, useState } from 'react';

import type { SessionAuditView } from '../domain/contracts';
import type { SessionPresentation } from '../lib/session-view';
import { StatusBadge, agentTone, sessionTone } from './StatusBadge';

interface SessionWorkspaceProps {
  audit: SessionAuditView;
  isReplying: boolean;
  onReply: (answer: string) => Promise<void>;
  presentation: SessionPresentation;
}

function valueOrPending(value: string | null | undefined): string {
  return value && value.trim().length > 0 ? value : 'Pendiente de aclaración';
}

function listOrPending(items: string[]): string[] {
  return items.length > 0 ? items : ['Sin evidencia todavía en la sesión'];
}

export function SessionWorkspace({
  audit,
  isReplying,
  onReply,
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

  const briefRows = [
    ['Target user', valueOrPending(presentation.structuredBrief.target_user)],
    ['Problem owner', valueOrPending(presentation.structuredBrief.problem_owner)],
    ['Problem statement', valueOrPending(presentation.structuredBrief.problem_statement)],
    ['Evidence', valueOrPending(presentation.structuredBrief.evidence_of_problem)],
    ['Current alternatives', valueOrPending(presentation.structuredBrief.current_alternatives)],
    ['Scope', valueOrPending(presentation.structuredBrief.scope)],
  ] as const;

  const problemDefinitionRows = presentation.problemDefinition
    ? [
        ['Problem owner', valueOrPending(presentation.problemDefinition.problem_owner)],
        ['Problem statement', valueOrPending(presentation.problemDefinition.problem_statement)],
        ['Evidence', valueOrPending(presentation.problemDefinition.evidence_of_problem)],
        ['Scope', valueOrPending(presentation.problemDefinition.scope)],
        ['Current alternatives', valueOrPending(presentation.problemDefinition.current_alternatives)],
      ]
    : [];

  return (
    <section className="workspace">
      <header className="workspace-header">
        <div className="workspace-header__intro">
          <div className="panel__eyebrow">Sesión activa</div>
          <h2>{presentation.projectTitle}</h2>
          <p>{presentation.goal}</p>
        </div>

        <div className="workspace-header__meta">
          <div className="workspace-id">
            <span>Session ID</span>
            <strong>{presentation.sessionId}</strong>
            <button className="button button--ghost" type="button" onClick={() => void handleCopy()}>
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <div className="workspace-badges">
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
        </div>
      </header>

      <div className="workspace-stats">
        <div className="metric-card">
          <span>Turns</span>
          <strong>{audit.turns.length}</strong>
        </div>
        <div className="metric-card">
          <span>Snapshots</span>
          <strong>{presentation.snapshotCount}</strong>
        </div>
        <div className="metric-card">
          <span>Runs</span>
          <strong>{presentation.runCount}</strong>
        </div>
        <div className="metric-card">
          <span>Events</span>
          <strong>{presentation.eventCount}</strong>
        </div>
      </div>

      <div className="workspace-grid">
        <section className="workspace-card workspace-card--brief">
          <div className="workspace-card__header">
            <h3>Structured brief</h3>
            <p>Lectura editable sólo desde los workflows actuales. Aquí se inspecciona el último snapshot válido.</p>
          </div>

          <div className="definition-grid">
            {briefRows.map(([label, value]) => (
              <article key={label} className="definition-item">
                <span>{label}</span>
                <strong>{value}</strong>
              </article>
            ))}
          </div>

          <div className="chip-cloud">
            {listOrPending(presentation.structuredBrief.constraints_known).map((item) => (
              <span key={item} className="chip">{item}</span>
            ))}
          </div>
        </section>

        <aside className="workspace-rail">
          <section className="workspace-card workspace-card--question">
            <div className="workspace-card__header">
              <h3>Siguiente pregunta</h3>
              <p>Una sola pregunta principal por turno, respetando el contrato de la v1.</p>
            </div>

            <div className="question-callout">
              {presentation.currentQuestion || 'La sesión no tiene una pregunta abierta en este momento.'}
            </div>
          </section>

          <section className="workspace-card">
            <div className="workspace-card__header">
              <h3>Gaps y diagnóstico</h3>
              <p>Ambigüedades detectadas por el brief y diagnóstico más reciente del carril.</p>
            </div>

            <div className="workspace-columns">
              <div>
                <span className="workspace-columns__label">Detected gaps</span>
                <ul className="list-block">
                  {listOrPending(presentation.detectedGaps).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div>
                <span className="workspace-columns__label">Latest diagnosis</span>
                <ul className="list-block">
                  {listOrPending(presentation.latestDiagnosis).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          {presentation.warnings.length > 0 ? (
            <section className="workspace-card workspace-card--warning">
              <div className="workspace-card__header">
                <h3>Warnings</h3>
                <p>Señales operativas emitidas por el backend o por los guardrails.</p>
              </div>
              <ul className="list-block list-block--warning">
                {presentation.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="workspace-card workspace-card--reply">
            <div className="workspace-card__header">
              <h3>Responder turno</h3>
              <p>La respuesta se envía a `proposal-reply-v1` y vuelve con el siguiente estado de la sesión.</p>
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

                <button className="button button--primary" type="submit" disabled={isReplying}>
                  {isReplying ? 'Procesando turno…' : 'Enviar respuesta'}
                </button>
              </form>
            ) : (
              <div className="empty-state">
                {presentation.status === 'completed'
                  ? 'La sesión ya quedó marcada como completada.'
                  : presentation.status === 'blocked' || presentation.status === 'failed'
                    ? 'La sesión quedó bloqueada. Revisa la trazabilidad antes de reintentar.'
                    : 'No hay un turno esperando respuesta.'}
              </div>
            )}
          </section>
        </aside>
      </div>

      <div className="workspace-grid workspace-grid--secondary">
        <section className="workspace-card">
          <div className="workspace-card__header">
            <h3>Estado de problem definition</h3>
            <p>Snapshot operativo derivado del backend para inspección rápida.</p>
          </div>

          {problemDefinitionRows.length === 0 ? (
            <div className="empty-state">Aún no hay un problem definition consolidado.</div>
          ) : (
            <div className="definition-grid">
              {problemDefinitionRows.map(([label, value]) => (
                <article key={label} className="definition-item">
                  <span>{label}</span>
                  <strong>{value}</strong>
                </article>
              ))}
            </div>
          )}

          <div className="workspace-columns">
            <div>
              <span className="workspace-columns__label">Assumptions</span>
              <ul className="list-block">
                {listOrPending(presentation.problemDefinition?.assumptions ?? []).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div>
              <span className="workspace-columns__label">Ambiguities remaining</span>
              <ul className="list-block">
                {listOrPending(presentation.problemDefinition?.ambiguities_remaining ?? []).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>

          {presentation.completionReason ? (
            <div className="completion-note">
              <span>Completion reason</span>
              <strong>{presentation.completionReason}</strong>
            </div>
          ) : null}
        </section>

        <section className="workspace-card">
          <div className="workspace-card__header">
            <h3>Timeline de turnos</h3>
            <p>Reconstruido desde `conversation_turns` y listo para demo/local review.</p>
          </div>

          {audit.turns.length === 0 ? (
            <div className="empty-state">La sesión aún no tiene turnos persistidos.</div>
          ) : (
            <ol className="timeline">
              {audit.turns.map((turn) => (
                <li key={turn.id} className={`timeline-item timeline-item--${turn.status}`}>
                  <div className="timeline-item__header">
                    <strong>Turno {turn.turn_seq}</strong>
                    <StatusBadge label={turn.status.replaceAll('_', ' ')} tone="neutral" />
                  </div>
                  <div className="timeline-item__question">{turn.question_text}</div>
                  <div className="timeline-item__answer">
                    {turn.answer_text || 'Todavía sin respuesta persistida.'}
                  </div>
                  {turn.diagnosis_json.length > 0 ? (
                    <ul className="list-inline">
                      {turn.diagnosis_json.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                  {turn.completion_reason ? (
                    <div className="timeline-item__reason">{turn.completion_reason}</div>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section className="workspace-card workspace-card--trace">
        <div className="workspace-card__header">
          <h3>Trazabilidad</h3>
          <p>Resumen operativo de snapshots, agent runs y eventos persistidos.</p>
        </div>

        <div className="trace-grid">
          <div className="trace-block">
            <span className="workspace-columns__label">Snapshots</span>
            <ul className="list-block">
              {audit.snapshots.map((snapshot) => (
                <li key={snapshot.id}>
                  <strong>#{snapshot.snapshot_seq}</strong> state {snapshot.state_version}
                  {snapshot.next_question_text ? ` · ${snapshot.next_question_text}` : ''}
                </li>
              ))}
            </ul>
          </div>

          <div className="trace-block">
            <span className="workspace-columns__label">Agent runs</span>
            <ul className="list-block">
              {audit.runs.map((run) => (
                <li key={run.id}>
                  <strong>{run.run_purpose}</strong> · {run.model_name} · {run.status}
                </li>
              ))}
            </ul>
          </div>

          <div className="trace-block">
            <span className="workspace-columns__label">Events</span>
            <ul className="list-block">
              {audit.events.map((event) => (
                <li key={event.id}>
                  <strong>#{event.event_seq}</strong> {event.event_type} · {event.actor_type}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </section>
  );
}
