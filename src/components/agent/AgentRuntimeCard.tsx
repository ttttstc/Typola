import { AgentDiagnosticRow } from './AgentDiagnosticRow';
import type { AgentProvider } from '../../services/agent/provider';
import type { AgentDetectResult } from '../../services/agentService';
import type { AgentRuntimeDef } from '../../services/agent/runtime/types';

type AgentRuntimeCardProps = {
  runtime: AgentRuntimeDef;
  active: boolean;
  pathValue: string;
  detecting: boolean;
  result?: AgentDetectResult;
  onSetActive: (provider: AgentProvider) => void;
  onPathChange: (value: string) => void;
  onDetect: () => void;
};

export function AgentRuntimeCard({
  runtime,
  active,
  pathValue,
  detecting,
  result,
  onSetActive,
  onPathChange,
  onDetect,
}: AgentRuntimeCardProps) {
  const statusLabel = !result
    ? '未检测'
    : result.available
      ? '已识别'
      : '不可用';
  const statusTone = !result ? 'idle' : result.available ? 'ok' : 'error';
  const canSetActive = !runtime.detectionOnly;

  return (
    <section className={`agent-runtime-card ${active ? 'active' : ''}`} aria-label={`${runtime.label} 设置`}>
      <header className="agent-runtime-card-header">
        <div>
          <strong>{runtime.label}</strong>
          <span className={`agent-runtime-status ${statusTone}`}>{statusLabel}</span>
        </div>
        <button
          type="button"
          className="settings-action-button"
          disabled={active || !canSetActive}
          onClick={() => {
            if (canSetActive) onSetActive(runtime.id as AgentProvider);
          }}
        >
          {runtime.detectionOnly ? '仅检测' : active ? '当前默认' : '设为默认'}
        </button>
      </header>
      {runtime.description && <p className="settings-desc agent-runtime-desc">{runtime.description}</p>}

      <label className="settings-field">
        <span className="settings-label">CLI 路径</span>
        <span className="settings-desc">留空时使用系统 PATH；Windows 可填写 .cmd 或 .exe 完整路径。</span>
        <input
          className="settings-input"
          value={pathValue}
          placeholder={`例如 ${runtime.defaultCommand}`}
          onChange={(event) => onPathChange(event.target.value)}
        />
      </label>

      <div className="agent-runtime-meta-grid">
        <span>默认命令</span>
        <code>{runtime.defaultCommand}</code>
        <span>版本参数</span>
        <code>{runtime.versionArgs.join(' ')}</code>
      </div>

      <div className="settings-section-actions">
        <button type="button" className="settings-action-button" onClick={onDetect} disabled={detecting}>
          {detecting ? '检测中...' : '重新检测 CLI'}
        </button>
        {runtime.docsUrl && (
          <a className="settings-action-link" href={runtime.docsUrl} target="_blank" rel="noreferrer">查看文档</a>
        )}
      </div>

      {result && (
        <div className={`agent-detect-result ${result.available ? 'ok' : 'error'}`}>
          <div className={`settings-message ${result.available ? 'ok' : 'error'}`}>
            {result.available
              ? `可用：${result.executablePath || result.path}${result.version ? `（${result.version}）` : ''}`
              : `不可用：${result.error || `${runtime.label} CLI 检测失败`}`}
          </div>
          {(result.diagnostics ?? []).length > 0 && (
            <div className="agent-diagnostic-list">
              {(result.diagnostics ?? []).map((diagnostic, index) => (
                <AgentDiagnosticRow
                  key={`${diagnostic.code}-${index}`}
                  diagnostic={diagnostic}
                  onRescan={onDetect}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
