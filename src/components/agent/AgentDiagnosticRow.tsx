import type { AgentDiagnostic } from '../../services/agent/runtime/diagnostics';

type AgentDiagnosticRowProps = {
  diagnostic: AgentDiagnostic;
  onRescan?: () => void;
};

export function AgentDiagnosticRow({ diagnostic, onRescan }: AgentDiagnosticRowProps) {
  const canRescan = diagnostic.fix?.action === 'rescan' && onRescan;
  return (
    <div className={`agent-diagnostic-row ${diagnostic.level}`}>
      <div className="agent-diagnostic-row-main">
        <span className="agent-diagnostic-row-title">{diagnostic.title}</span>
        {diagnostic.detail && <span className="agent-diagnostic-row-detail">{diagnostic.detail}</span>}
      </div>
      {canRescan && (
        <button type="button" className="agent-diagnostic-row-action" onClick={onRescan}>
          {diagnostic.fix?.label || '重新检测'}
        </button>
      )}
    </div>
  );
}
