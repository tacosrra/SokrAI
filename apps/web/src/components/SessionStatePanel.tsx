import type { SessionAuditView } from '../domain/contracts';
import type { SessionPresentation } from '../lib/session-view';
import { StatusBadge, agentTone, sessionTone } from './StatusBadge';

interface SessionStatePanelProps {
  audit: SessionAuditView;
  presentation: SessionPresentation;
}

function listOrPending(items: string[]): string[] {
  return items.length > 0 ? items : ['Sin señales registradas todavía.'];
}

function sourceLabel(source: SessionPresentation['checklist'][number]['source']): string {
  switch (source) {
    case 'problem_definition':
      return 'problem definition';
    case 'structured_brief':
      return 'structured brief';
    default:
      return 'pendiente';
  }
}

export function SessionStatePanel({
  audit,
  presentation,
}: SessionStatePanelProps) {
  const ambiguities =
    presentation.problemDefinition?.ambiguities_remaining ??
    presentation.structuredBrief.ambiguities;
  const assumptions =
    presentation.problemDefinition?.assumptions ?? presentation.structuredBrief.assumptions;

  return (
    <section className="state-shell">
      <section className="state-card state-card--score">
        <div className="state-card__header">
          <div>
            <div className="panel__eyebrow">Panel de estado</div>
            <h2>Maduración del problema</h2>
          </div>
          <StatusBadge
            label={presentation.status.replaceAll('_', ' ')}
            tone={sessionTone(presentation.status)}
          />
        </div>

        <div className="state-overview">
          <div>
            <p>{presentation.progress.title}</p>
            <strong>{presentation.progress.percent}%</strong>
          </div>

          <div className="state-badges">
            <StatusBadge label={presentation.stage.replace('_', ' ')} tone="neutral" />
            <StatusBadge
              label={`agent ${presentation.agentStatus}`}
              tone={agentTone(presentation.agentStatus)}
            />
          </div>
        </div>

        <div className="state-progress" aria-hidden="true">
          <span
            className="state-progress__fill"
            style={{ width: `${presentation.progress.percent}%` }}
          />
        </div>

        <div className="state-metrics">
          <article>
            <span>Turnos</span>
            <strong>{audit.turns.length}</strong>
          </article>
          <article>
            <span>Snapshots</span>
            <strong>{presentation.snapshotCount}</strong>
          </article>
          <article>
            <span>Runs</span>
            <strong>{presentation.runCount}</strong>
          </article>
          <article>
            <span>Eventos</span>
            <strong>{presentation.eventCount}</strong>
          </article>
        </div>
      </section>

      <section className="state-card">
        <div className="state-card__header">
          <div>
            <h3>Categorías clave</h3>
            <p>Estado actual de cada bloque que el agente necesita consolidar.</p>
          </div>
          <strong className="state-count">
            {presentation.progress.completedItems}/{presentation.progress.totalItems}
          </strong>
        </div>

        <div className="state-checklist">
          {presentation.checklist.map((item) => (
            <article
              key={item.id}
              className={`state-checklist__item ${
                item.isComplete ? 'state-checklist__item--complete' : 'state-checklist__item--pending'
              }`}
            >
              <div className="state-checklist__main">
                <div className="state-checklist__title">
                  <span
                    className={`state-checklist__marker ${
                      item.isComplete ? 'state-checklist__marker--complete' : ''
                    }`}
                  />
                  <strong>{item.label}</strong>
                </div>
                <p>{item.value}</p>
              </div>

              <span className={`source-pill source-pill--${item.source}`}>
                {sourceLabel(item.source)}
              </span>
            </article>
          ))}
        </div>
      </section>

      <section className="state-card">
        <div className="state-card__header">
          <div>
            <h3>Insights en vivo</h3>
            <p>Señales útiles para el siguiente turno y para revisión rápida.</p>
          </div>
        </div>

        <div className="insight-stack">
          <article className="insight-card insight-card--warning">
            <span className="context-block__label">Detected gaps</span>
            <ul className="list-block">
              {listOrPending(presentation.detectedGaps).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="insight-card insight-card--accent">
            <span className="context-block__label">Warnings</span>
            <ul className="list-block">
              {listOrPending(presentation.warnings).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <section className="state-card">
        <div className="state-card__header">
          <div>
            <h3>Contexto de trabajo</h3>
            <p>Hipótesis, ambigüedades y constraints vigentes en la sesión.</p>
          </div>
        </div>

        <div className="context-stack">
          <article className="context-block">
            <span className="context-block__label">Assumptions</span>
            <ul className="list-block">
              {listOrPending(assumptions).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="context-block">
            <span className="context-block__label">Ambiguities</span>
            <ul className="list-block">
              {listOrPending(ambiguities).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="context-block">
            <span className="context-block__label">Latest diagnosis</span>
            <ul className="list-block">
              {listOrPending(presentation.latestDiagnosis).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="context-block">
            <span className="context-block__label">Constraints</span>
            <ul className="list-block">
              {listOrPending(presentation.structuredBrief.constraints_known).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </div>

        {presentation.completionReason ? (
          <div className="completion-note">
            <span>Completion reason</span>
            <strong>{presentation.completionReason}</strong>
          </div>
        ) : null}
      </section>
    </section>
  );
}
