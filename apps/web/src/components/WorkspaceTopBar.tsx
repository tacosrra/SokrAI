import type { SessionPresentation } from '../lib/session-view';
import { SokrAiLogo } from './SokrAiLogoLoader';

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
    if (isLoadingSession) return 'Recuperando propuesta...';
    if (isReplying) return 'Preparando siguiente paso...';
    if (isComposingReport) return 'Preparando informe...';
    if (isDownloadingReportPdf) return 'Descargando PDF...';
    return 'Propuesta guardada';
  };

  const projectTitle = presentation?.projectTitle || 'Cargando propuesta...';
  const currentPhaseLabel = presentation?.phaseProgress?.currentPhaseLabel || '';

  const isBusy = isLoadingSession || isReplying || isComposingReport || isDownloadingReportPdf;

  return (
    <header className="app-topbar workspace-topbar">
      <div className="workspace-topbar__project-block">
        <div className="brand-mark workspace-topbar__mark">
          <SokrAiLogo size="sm" />
        </div>
        <div className="workspace-topbar__copy">
          <span className="brand-copy__eyebrow">SokrAI</span>
          <h1 className="project-title-top">{projectTitle}</h1>
          <p>
            {presentation ? `Fase: ${currentPhaseLabel}` : 'Maduración guiada'}
            <span className="workspace-topbar__meta-separator">·</span>
            <span className="sync-badge sync-badge--inline" aria-live="polite">
              <span className={`sync-badge__dot ${isBusy ? 'sync-badge__dot--busy' : 'sync-badge__dot--idle'}`} />
              <span>{getSyncStatusText()}</span>
            </span>
          </p>
        </div>
      </div>

      <div className="workspace-topbar__actions">
        <button
          className="button button--secondary workspace-topbar__action"
          type="button"
          onClick={onChangeSessionClick}
        >
          Cambiar propuesta
        </button>

        <button
          className="button button--primary workspace-topbar__action"
          type="button"
          onClick={onNewProposalClick}
        >
          Nueva propuesta
        </button>
      </div>
    </header>
  );
}
