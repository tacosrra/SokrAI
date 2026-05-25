import type { AlphaGap, BasicAlphaReport, ProposalSource } from '../domain/contracts';
import { deriveReportPresentation } from '../lib/report-view';
import { StatusBadge } from './StatusBadge';

interface BasicAlphaReportPanelProps {
  report: BasicAlphaReport;
}

function FieldValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="basic-report__field">
      <span>{label}</span>
      <strong>{value || 'Sin dato persistido'}</strong>
    </div>
  );
}

function GapList({ gaps }: { gaps: AlphaGap[] }) {
  if (gaps.length === 0) {
    return <div className="empty-state">No hay gaps en este grupo.</div>;
  }

  return (
    <ul className="basic-report__gap-list">
      {gaps.map((gap) => (
        <li key={gap.gap_id}>
          <span>{gap.gap_status.replaceAll('_', ' ')}</span>
          <strong>{gap.field}</strong>
          <p>{gap.description}</p>
        </li>
      ))}
    </ul>
  );
}

function SourceList({ sources }: { sources: ProposalSource[] }) {
  if (sources.length === 0) {
    return <div className="empty-state">El informe no tiene fuentes internas asociadas.</div>;
  }

  return (
    <ul className="basic-report__sources">
      {sources.map((source) => (
        <li key={source.source_id}>
          <span className="source-pill">{source.source_kind.replaceAll('_', ' ')}</span>
          <strong>{source.label}</strong>
          <small>{source.source_id}</small>
        </li>
      ))}
    </ul>
  );
}

export function BasicAlphaReportPanel({ report }: BasicAlphaReportPanelProps) {
  const presentation = deriveReportPresentation(report);

  return (
    <section className="basic-report" aria-labelledby="basic-alpha-report-title">
      <header className="basic-report__header">
        <div>
          <span className="panel__eyebrow">Informe Alpha</span>
          <h2 id="basic-alpha-report-title">Basic Alpha Report</h2>
          <p>
            {report.structured_brief.project_title} · {report.structured_brief.goal}
          </p>
        </div>

        <div className="basic-report__meta">
          <StatusBadge label={presentation.status} tone={report.report_status === 'ready' ? 'success' : 'warning'} />
          <span>{presentation.schemaVersion}</span>
          <span>{presentation.generatedAt}</span>
        </div>
      </header>

      <div className="basic-report__summary">
        <FieldValue label="Usuario objetivo" value={report.structured_brief.target_user} />
        <FieldValue label="Responsable del problema" value={report.structured_brief.problem_owner} />
        <FieldValue label="Fuentes internas" value={String(presentation.sourceCount)} />
        <FieldValue label="Referencias de auditoría" value={String(presentation.auditRefCount)} />
      </div>

      <div className="basic-report__grid">
        <section className="basic-report__section">
          <h3>Brief</h3>
          <FieldValue label="Problema" value={report.structured_brief.problem_statement} />
          <FieldValue label="Evidencia" value={report.structured_brief.evidence_of_problem} />
          <FieldValue label="Alcance" value={report.structured_brief.scope} />
          <FieldValue label="Alternativas actuales" value={report.structured_brief.current_alternatives} />
        </section>

        <section className="basic-report__section">
          <h3>Gaps abiertos</h3>
          <GapList gaps={presentation.openGaps} />
        </section>
      </div>

      <section className="basic-report__section">
        <div className="basic-report__section-heading">
          <h3>{presentation.problemSection.title}</h3>
          <span>
            v{presentation.problemSection.version} · {presentation.problemSection.status}
          </span>
        </div>
        <div className="basic-report__markdown">{report.problem_section.content_markdown}</div>
      </section>

      <section className="basic-report__section">
        <div className="basic-report__section-heading">
          <h3>{presentation.solutionSection.title}</h3>
          <span>
            v{presentation.solutionSection.version} · {presentation.solutionSection.status}
          </span>
        </div>
        <div className="basic-report__markdown">{report.solution_section.content_markdown}</div>
      </section>

      <section className="basic-report__section">
        <h3>Estados de gaps</h3>
        <div className="basic-report__gap-groups">
          {presentation.gapGroups.map((group) => (
            <div key={group.status} className="basic-report__gap-group">
              <span>{group.status.replaceAll('_', ' ')}</span>
              <GapList gaps={group.gaps} />
            </div>
          ))}
        </div>
      </section>

      <section className="basic-report__section">
        <h3>Fuentes internas</h3>
        <SourceList sources={report.internal_sources} />
      </section>

      <section className="basic-report__section basic-report__section--warning">
        <h3>Advertencias</h3>
        <ul className="basic-report__warning-list">
          {presentation.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      </section>
    </section>
  );
}
