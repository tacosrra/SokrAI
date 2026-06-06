import type { SessionAuditView } from '../domain/contracts';
import type { SessionPresentation } from '../lib/session-view';
import { StatusBadge, agentTone, phaseTone, sessionTone } from './StatusBadge';

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

function shortHash(value: string | undefined): string {
  return value ? `${value.slice(0, 12)}…` : 'Sin hash';
}

function gapEvidenceLabel(gap: SessionPresentation['gaps'][number]): string {
  if (gap.absence.is_absent) {
    return `absence: ${gap.absence.checked_fields.join(', ')}`;
  }

  if (gap.source_refs.length > 0) {
    return `source: ${gap.source_refs.map((source) => source.label).join(', ')}`;
  }

  return gap.origin.replaceAll('_', ' ');
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
  const currentPhase = presentation.phaseProgress.steps.find((step) =>
    step.id === presentation.phaseProgress.currentPhaseId,
  ) ?? presentation.phaseProgress.steps[0];

  return (
    <section className="state-shell">
      <section className="state-card state-card--score">
        <div className="state-card__header">
          <div>
            <div className="panel__eyebrow">Panel de estado</div>
            <h2>Progreso de la propuesta</h2>
          </div>
          <StatusBadge
            label={currentPhase.status.replaceAll('_', ' ')}
            tone={phaseTone(currentPhase.status)}
          />
        </div>

        <div className="state-overview">
          <div>
            <p>{currentPhase.explanation}</p>
            <strong>{presentation.phaseProgress.percent}%</strong>
          </div>

          <div className="state-badges">
            <StatusBadge label={currentPhase.label} tone={phaseTone(currentPhase.status)} />
            <StatusBadge label={presentation.status.replaceAll('_', ' ')} tone={sessionTone(presentation.status)} />
            <StatusBadge
              label={`agent ${presentation.agentStatus}`}
              tone={agentTone(presentation.agentStatus)}
            />
          </div>
        </div>

        <div className="state-progress" aria-hidden="true">
          <span
            className="state-progress__fill"
            style={{ width: `${presentation.phaseProgress.percent}%` }}
          />
        </div>

        <div className="state-metrics">
          <article>
            <span>Fases</span>
            <strong>
              {presentation.phaseProgress.completedPhases}/{presentation.phaseProgress.totalApplicablePhases}
            </strong>
          </article>
          <article>
            <span>Abiertas</span>
            <strong>{currentPhase.openGapsCount}</strong>
          </article>
          <article>
            <span>Resueltas</span>
            <strong>{currentPhase.resolvedGapsCount}</strong>
          </article>
          <article>
            <span>Turnos</span>
            <strong>{audit.turns.length}</strong>
          </article>
        </div>
      </section>

      <section className="state-card">
        <div className="state-card__header">
          <div>
            <h3>Camino de fases</h3>
            <p>Estado derivado desde la auditoría persistida, sin inferir hechos no registrados.</p>
          </div>
          <strong className="state-count">
            {presentation.phaseProgress.completedPhases}/{presentation.phaseProgress.totalApplicablePhases}
          </strong>
        </div>

        <div className="state-checklist">
          {presentation.phaseProgress.steps.map((step) => (
            <article
              key={step.id}
              className={`state-checklist__item ${
                step.status === 'complete' || step.status === 'not_applicable'
                  ? 'state-checklist__item--complete'
                  : 'state-checklist__item--pending'
              }`}
            >
              <div className="state-checklist__main">
                <div className="state-checklist__title">
                  <span
                    className={`state-checklist__marker ${
                      step.status === 'complete' || step.status === 'not_applicable'
                        ? 'state-checklist__marker--complete'
                        : ''
                    }`}
                  />
                  <strong>{step.label}</strong>
                </div>
                <p>{step.lockedReason ?? step.explanation}</p>
              </div>

              <StatusBadge label={step.status.replaceAll('_', ' ')} tone={phaseTone(step.status)} />
            </article>
          ))}
        </div>
      </section>

      {presentation.latestProblemSection ? (
        <section className="state-card">
          <div className="state-card__header">
            <div>
              <h3>{presentation.latestProblemSection.title}</h3>
              <p>
                v{presentation.latestProblemSection.section_version} · {presentation.latestProblemSection.section_status.replaceAll('_', ' ')}
              </p>
            </div>
            <strong className="state-count">
              {presentation.latestProblemSection.source_refs.length}/{presentation.latestProblemSection.gap_refs.length}
            </strong>
          </div>

          <article className="context-block">
            <span className="context-block__label">Problem section</span>
            <p>{presentation.latestProblemSection.content_markdown}</p>
          </article>
        </section>
      ) : null}

      <section className="state-card">
        <div className="state-card__header">
          <div>
            <h3>Detalle de la fase problema</h3>
            <p>Checklist específico del problema; no representa la madurez completa de la propuesta.</p>
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
            {presentation.gaps.length > 0 ? (
              <ul className="gap-list">
                {presentation.gaps.map((gap) => (
                  <li key={gap.gap_id} className="gap-list__item">
                    <div className="gap-list__header">
                      <strong>{gap.field.replaceAll('_', ' ')}</strong>
                      <span>
                        {gap.gap_kind.replaceAll('_', ' ')} · {gap.gap_status.replaceAll('_', ' ')}
                      </span>
                    </div>
                    <p>{gap.description}</p>
                    {gap.question_hint ? <em>{gap.question_hint}</em> : null}
                    <span className="source-pill">{gapEvidenceLabel(gap)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="list-block">
                {listOrPending(presentation.detectedGaps).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
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
            <h3>Fuentes internas</h3>
            <p>Documentos y fragmentos persistidos para auditoría de la sesión.</p>
          </div>
          <strong className="state-count">
            {audit.documents.length}/{audit.sources.length}
          </strong>
        </div>

        <div className="source-summary">
          {audit.documents.length === 0 ? (
            <p className="empty-state">Sin documentos persistidos todavía.</p>
          ) : (
            audit.documents.map((document) => (
              <article className="source-row" key={document.document_id}>
                <div>
                  <strong>{document.file_name ?? document.source_kind.replaceAll('_', ' ')}</strong>
                  <span>
                    {document.document_status} · {document.source_kind.replaceAll('_', ' ')}
                    {document.sha256 ? ` · sha256 ${shortHash(document.sha256)}` : ''}
                  </span>
                </div>
                {document.warnings.length > 0 ? (
                  <ul className="list-block source-row__warnings">
                    {document.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))
          )}

          {audit.sources.length > 0 ? (
            <div className="source-chip-list">
              {audit.sources.map((source) => (
                <span className="source-pill" key={source.source_id}>
                  {source.label}
                </span>
              ))}
            </div>
          ) : null}
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
