import type { AlphaGap, BasicAlphaReport, GeneratedSection, ProposalSource } from '../domain/contracts';
import type { ReactNode } from 'react';
import {
  deriveReportPresentation,
  formatFieldLabel,
  formatGapKind,
  formatGapStatus,
  formatReportWarning,
  formatSectionStatus,
  formatSourceKind,
  SECTION_LABELS,
} from '../lib/report-view';
import { describeGapForUser, toUserFacingText } from '../lib/user-facing-text';
import { StatusBadge } from './StatusBadge';

interface BasicAlphaReportPanelProps {
  report: BasicAlphaReport;
  generatedSections?: GeneratedSection[];
  canDownloadPdf: boolean;
  isDownloadingPdf: boolean;
  onDownloadPdf: () => Promise<void>;
}

function compactText(value: string, fallback = 'Pendiente de completar'): string {
  const normalized = toUserFacingText(value).replace(/\s+/g, ' ').trim();
  return normalized || fallback;
}

function shortMarkdownSummary(value: string): string {
  const normalized = compactText(
    value
      .split(/\r?\n/)
      .map((line) => line.replace(/^#+\s*/, '').replace(/^\s*[-*]\s+/, ''))
      .join(' '),
    '',
  );

  if (normalized.length <= 220) {
  return normalized || 'La solución está descrita en la sección correspondiente.';
  }

  return `${normalized.slice(0, 217).trim()}...`;
}

function FieldValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="basic-report__field">
      <span>{label}</span>
      <strong>{compactText(value)}</strong>
    </div>
  );
}

function ReportMarkdown({ value }: { value: string }) {
  const lines = value.split(/\r?\n/);
  const nodes: ReactNode[] = [];
  let listItems: string[] = [];

  function flushList() {
    if (listItems.length === 0) {
      return;
    }

    const items = listItems;
    listItems = [];
    nodes.push(
      <ul key={`list-${nodes.length}`}>
        {items.map((item, index) => (
          <li key={`${item}-${index}`}>{toUserFacingText(item)}</li>
        ))}
      </ul>,
    );
  }

  lines.forEach((line, index) => {
    const normalized = line.trim();

    if (!normalized) {
      flushList();
      return;
    }

    if (/^[-*]\s+/.test(normalized)) {
      listItems.push(normalized.replace(/^[-*]\s+/, ''));
      return;
    }

    flushList();

    if (normalized.startsWith('#')) {
      nodes.push(
        <h4 key={`heading-${index}`}>{toUserFacingText(normalized.replace(/^#+\s*/, ''))}</h4>,
      );
      return;
    }

    nodes.push(<p key={`p-${index}`}>{toUserFacingText(normalized)}</p>);
  });

  flushList();

  return <div className="basic-report__markdown">{nodes}</div>;
}

function GapList({ gaps }: { gaps: AlphaGap[] }) {
  if (gaps.length === 0) {
    return (
      <div className="basic-report__empty">
        No hay puntos pendientes en esta parte del informe.
      </div>
    );
  }

  return (
    <ul className="basic-report__gap-list">
      {gaps.map((gap) => (
        <li key={gap.gap_id}>
          <div className="basic-report__gap-topline">
            <span className="basic-report__status-chip">{formatGapStatus(gap.gap_status)}</span>
            <span>{formatGapKind(gap.gap_kind)}</span>
          </div>
          <strong>{formatFieldLabel(gap.field)}</strong>
          <p>{describeGapForUser(gap)}</p>
          {gap.question_hint ? (
            <em>Para avanzar: {toUserFacingText(gap.question_hint)}</em>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function SourceList({ sources }: { sources: ProposalSource[] }) {
  if (sources.length === 0) {
    return (
      <div className="basic-report__empty">
        No hay material de apoyo asociado al informe.
      </div>
    );
  }

  return (
    <ul className="basic-report__sources">
      {sources.map((source) => (
        <li key={source.source_id}>
          <span className="source-pill">{formatSourceKind(source.source_kind)}</span>
          <strong>{toUserFacingText(source.label)}</strong>
        </li>
      ))}
    </ul>
  );
}

export function BasicAlphaReportPanel({
  report,
  generatedSections = [],
  canDownloadPdf,
  isDownloadingPdf,
  onDownloadPdf,
}: BasicAlphaReportPanelProps) {
  const presentation = deriveReportPresentation(report, generatedSections);
  const readyForReview = report.report_status === 'ready';

  return (
    <article className="basic-report" aria-labelledby="basic-alpha-report-title">
      <header className="basic-report__hero">
        <div className="basic-report__hero-main">
          <span className="basic-report__label">Informe de propuesta</span>
          <h2 id="basic-alpha-report-title">{presentation.executiveSummary.title}</h2>
          <p>{presentation.executiveSummary.context}</p>
          <div className="basic-report__hero-badges" aria-label="Estado del informe">
            <StatusBadge
              label={presentation.reportStatusLabel}
              tone={readyForReview ? 'success' : 'warning'}
            />
            <span>Material para revisión humana</span>
            <span>Actualizado: {presentation.generatedAt}</span>
          </div>
        </div>

        <aside className="basic-report__export-panel" aria-label="Exportación del informe">
          <span>PDF del informe</span>
          <strong>
            {canDownloadPdf
              ? 'Disponible para descargar'
              : 'Disponible cuando el informe esté listo'}
          </strong>
          <p>
            {canDownloadPdf
              ? 'Descarga una versión preparada para compartir en una revisión interna.'
              : 'Completa o valida los aspectos pendientes antes de exportar el documento.'}
          </p>
          {canDownloadPdf ? (
            <button
              className="button button--primary basic-report__download"
              type="button"
              onClick={() => void onDownloadPdf()}
              disabled={isDownloadingPdf}
            >
              {isDownloadingPdf ? 'Preparando PDF...' : 'Descargar PDF'}
            </button>
          ) : null}
        </aside>
      </header>

      <section className="basic-report__executive" aria-label="Resumen ejecutivo">
        <div>
          <span className="basic-report__label">Resumen ejecutivo</span>
          <h3>Qué debe entender quien revise esta propuesta</h3>
          <p>{presentation.executiveSummary.reviewerFocus}</p>
        </div>
        <div className="basic-report__executive-grid">
          <FieldValue label="Problema" value={presentation.executiveSummary.problem} />
          <FieldValue label="Solución propuesta" value={shortMarkdownSummary(presentation.executiveSummary.solution)} />
        </div>
      </section>

      <section className="basic-report__summary-strip" aria-label="Estado de la propuesta">
        <div>
          <strong>{presentation.availableSections.length}</strong>
          <span>secciones recogidas</span>
        </div>
        <div>
          <strong>{presentation.activeGapCount}</strong>
          <span>aspectos pendientes</span>
        </div>
        <div>
          <strong>{presentation.resolvedGapCount}</strong>
          <span>puntos respondidos</span>
        </div>
        <div>
          <strong>{presentation.sourceCount}</strong>
          <span>materiales usados</span>
        </div>
      </section>

      <section className="basic-report__section basic-report__section--flush" aria-labelledby="report-map-title">
        <div className="basic-report__section-heading">
          <div>
            <span className="basic-report__label">Mapa de revisión</span>
            <h3 id="report-map-title">Estado por parte de la propuesta</h3>
          </div>
        </div>
        <div className="basic-report__phase-map">
          {presentation.sectionSummaries.map((section) => (
            <div
              key={section.id}
              className={`basic-report__phase-card basic-report__phase-card--${section.status}`}
            >
              <div>
                <strong>{section.label}</strong>
                <span>{section.statusLabel}</span>
              </div>
              <p>{section.description}</p>
              <small>
                {section.openGapsCount > 0
                  ? `${section.openGapsCount} pendiente(s) por revisar`
                  : section.resolvedGapsCount > 0
                    ? `${section.resolvedGapsCount} punto(s) respondido(s)`
                    : 'Sin pendientes registrados'}
              </small>
            </div>
          ))}
        </div>
      </section>

      <div className="basic-report__body-grid">
        <section className="basic-report__section" aria-labelledby="proposal-overview-title">
          <div className="basic-report__section-heading">
            <div>
              <span className="basic-report__label">Información recogida</span>
              <h3 id="proposal-overview-title">Vista general</h3>
            </div>
          </div>
          <div className="basic-report__overview">
            <FieldValue label="Usuario objetivo" value={report.structured_brief.target_user} />
            <FieldValue label="Responsable del problema" value={report.structured_brief.problem_owner} />
            <FieldValue label="Evidencia" value={report.structured_brief.evidence_of_problem} />
            <FieldValue label="Alcance" value={report.structured_brief.scope} />
            <FieldValue label="Alternativas actuales" value={report.structured_brief.current_alternatives} />
          </div>
        </section>

        <section className="basic-report__section basic-report__section--attention" aria-labelledby="open-gaps-title">
          <div className="basic-report__section-heading">
            <div>
              <span className="basic-report__label">Aspectos pendientes</span>
            <h3 id="open-gaps-title">Qué falta validar</h3>
            </div>
            <StatusBadge
              label={presentation.activeGapCount === 0 ? 'Sin pendientes abiertos' : `${presentation.activeGapCount} pendiente(s)`}
              tone={presentation.activeGapCount === 0 ? 'success' : 'warning'}
            />
          </div>
          <GapList gaps={presentation.openGaps} />
        </section>
      </div>

      <section className="basic-report__section basic-report__section--flush" aria-labelledby="report-sections-title">
        <div className="basic-report__section-heading">
          <div>
            <span className="basic-report__label">Contenido del informe</span>
            <h3 id="report-sections-title">Secciones preparadas</h3>
          </div>
        </div>
        <div className="basic-report__section-stack">
          {presentation.availableSections.map((section) => (
            <section key={section.section_id} className="basic-report__prepared-section">
              <div className="basic-report__prepared-heading">
                <div>
                  <span>Sección preparada</span>
                  <h4>{SECTION_LABELS[section.section_kind]}</h4>
                </div>
                <span>{formatSectionStatus(section.section_status)}</span>
              </div>
              <ReportMarkdown value={section.content_markdown} />
            </section>
          ))}
        </div>
      </section>

      <div className="basic-report__body-grid basic-report__body-grid--balanced">
        <section className="basic-report__section" aria-labelledby="review-checklist-title">
          <div className="basic-report__section-heading">
            <div>
              <span className="basic-report__label">Lista de revisión</span>
              <h3 id="review-checklist-title">Antes de usar este material</h3>
            </div>
          </div>
          <ul className="basic-report__checklist">
            {presentation.reviewChecklist.map((item) => (
              <li key={item.id} className={`basic-report__checkitem basic-report__checkitem--${item.status}`}>
                <span aria-hidden="true">{item.status === 'complete' ? '✓' : item.status === 'not_applicable' ? '•' : ''}</span>
                <div>
                  <strong>{item.label}</strong>
                  <p>{item.description}</p>
                </div>
                <em>{item.statusLabel}</em>
              </li>
            ))}
          </ul>
        </section>

        <section className="basic-report__section" aria-labelledby="next-actions-title">
          <div className="basic-report__section-heading">
            <div>
              <span className="basic-report__label">Próximos pasos</span>
              <h3 id="next-actions-title">Acciones recomendadas</h3>
            </div>
          </div>
          <ol className="basic-report__next-actions">
            {presentation.nextActions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ol>
        </section>
      </div>

      <section className="basic-report__section basic-report__section--warning" aria-labelledby="report-warnings-title">
        <div className="basic-report__section-heading">
          <div>
            <span className="basic-report__label">Avisos importantes</span>
            <h3 id="report-warnings-title">Limites de uso</h3>
          </div>
        </div>
        <ul className="basic-report__warning-list">
          {presentation.warnings.length > 0
            ? presentation.warnings.map((warning) => <li key={warning}>{warning}</li>)
            : [formatReportWarning('This Alpha report is not a legal, clinical, or regulatory decision.')].map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
          <li>No introduzcas datos reales de pacientes en esta versión local de demostración.</li>
        </ul>
      </section>

      <section className="basic-report__section basic-report__section--supporting" aria-labelledby="report-sources-title">
        <div className="basic-report__section-heading">
          <div>
            <span className="basic-report__label">Material de apoyo</span>
            <h3 id="report-sources-title">Origen de la información</h3>
          </div>
        </div>
        <SourceList sources={report.internal_sources} />
      </section>
    </article>
  );
}
