import type { SessionPresentation } from '../lib/session-view';

interface WorkspaceTopBarProps {
  presentation: SessionPresentation | null;
  isLoadingSession: boolean;
  isReplying: boolean;
  isComposingReport: boolean;
  isDownloadingReportPdf: boolean;
  onChangeSessionClick: () => void;
  onNewProposalClick: () => void;
}

export function WorkspaceTopBar({
  presentation,
  isLoadingSession,
  isReplying,
  isComposingReport,
  isDownloadingReportPdf,
  onChangeSessionClick,
  onNewProposalClick,
}: WorkspaceTopBarProps) {
  const getSyncStatusText = () => {
    if (isLoadingSession) return 'Recuperando sesión...';
    if (isReplying) return 'Guardando respuesta...';
    if (isComposingReport) return 'Preparando informe...';
    if (isDownloadingReportPdf) return 'Exportando PDF...';
    return 'Sesión sincronizada';
  };

  const projectTitle = presentation?.projectTitle || 'Cargando propuesta...';
  const currentPhaseLabel = presentation?.phaseProgress?.currentPhaseLabel || '';

  return (
    <header className="workspace-topbar">
      <div className="workspace-topbar__brand">
        <div className="brand-mark">S</div>
        <div className="brand-copy">
          <span className="brand-copy__eyebrow">SokrAI v1</span>
          <strong>SokrAI proposal interview</strong>
          <span className="brand-copy__meta">
            {presentation ? `Fase: ${currentPhaseLabel}` : 'Maduración guiada de propuestas sanitarias.'}
          </span>
        </div>
      </div>

      {presentation && (
        <div className="workspace-topbar__project">
          <span className="project-eyebrow">Propuesta</span>
          <h1 className="project-title-top">{projectTitle}</h1>
        </div>
      )}

      <div className="workspace-topbar__actions">
        <div className="sync-badge" aria-live="polite">
          <span className={`sync-badge__dot ${isLoadingSession || isReplying || isComposingReport || isDownloadingReportPdf ? 'sync-badge__dot--busy' : 'sync-badge__dot--idle'}`} />
          <span>{getSyncStatusText()}</span>
        </div>

        <button
          className="button button--secondary button--sm"
          type="button"
          onClick={onChangeSessionClick}
        >
          Cambiar sesión
        </button>

        <button
          className="button button--primary button--sm"
          type="button"
          onClick={onNewProposalClick}
        >
          Nueva propuesta
        </button>
      </div>
    </header>
  );
}
