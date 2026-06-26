import type { AgentDiagnostic } from '../../services/agent/runtime/types';

type AgentDiagnosticRowProps = {
  diagnostic: AgentDiagnostic;
  onRescan?: () => void;
};

export function AgentDiagnosticRow({ diagnostic, onRescan }: AgentDiagnosticRowProps) {
  const fix = diagnostic.fix;
  const runFix = () => {
    if (!fix || fix.action === 'none') return;
    if (fix.action === 'rescan') {
      onRescan?.();
      return;
    }
    if (fix.action === 'open_doc' && fix.payload) {
      window.open(fix.payload, '_blank', 'noopener,noreferrer');
      return;
    }
    const text = fix.payload || diagnostic.detail || diagnostic.title;
    void navigator.clipboard?.writeText(text).catch((error) => {
      console.warn('Failed to copy diagnostic fix payload:', error);
    });
  };

  return (
    <div className={`agent-diagnostic-row ${diagnostic.level}`}>
      <div className="agent-diagnostic-row-main">
        <span className="agent-diagnostic-row-title">{diagnostic.title}</span>
        {diagnostic.detail && <span className="agent-diagnostic-row-detail">{diagnostic.detail}</span>}
      </div>
      {fix && fix.action !== 'none' && (
        <button type="button" className="agent-diagnostic-row-action" onClick={runFix}>
          {fix.label || '处理'}
        </button>
      )}
    </div>
  );
}
