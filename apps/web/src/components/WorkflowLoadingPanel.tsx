import {
  getWorkflowLoadingCopy,
  type WorkflowOperationKind,
} from '../lib/feedback';

interface WorkflowLoadingPanelProps {
  kind: WorkflowOperationKind;
}

export function WorkflowLoadingPanel({ kind }: WorkflowLoadingPanelProps) {
  const copy = getWorkflowLoadingCopy(kind);

  return (
    <section className="panel workflow-loading-panel" aria-live="polite" aria-busy="true">
      <div className="workflow-loading-panel__hero">
        <div>
          <div className="panel__eyebrow">{copy.eyebrow}</div>
          <h2>{copy.title}</h2>
          <p>{copy.description}</p>
        </div>

        <div className="workflow-loading-panel__pulse" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>

      <ol className="workflow-loading-panel__steps">
        {copy.steps.map((step, index) => (
          <li key={step}>
            <strong>{String(index + 1).padStart(2, '0')}</strong>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      <div className="workflow-loading-panel__note">{copy.note}</div>
    </section>
  );
}
