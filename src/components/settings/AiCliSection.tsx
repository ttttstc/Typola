import { useState } from 'react';
import { useSettings } from '../../hooks/useSettings';
import { detectAgent, type AgentDetectResult } from '../../services/agentService';
import { getAgentProviderConfig, type AgentProvider } from '../../services/agent/provider';
import { updateSettings } from '../../services/settingsService';

export function AiCliSection() {
  const settings = useSettings();
  const [detecting, setDetecting] = useState<AgentProvider | null>(null);
  const [results, setResults] = useState<Partial<Record<AgentProvider, AgentDetectResult>>>({});

  const handleDetect = async (provider: AgentProvider, path: string) => {
    setDetecting(provider);
    const config = getAgentProviderConfig(provider);
    try {
      const next = await detectAgent(path, provider);
      setResults((current) => ({ ...current, [provider]: next }));
    } catch (error) {
      setResults((current) => ({
        ...current,
        [provider]: {
          available: false,
          path: path || config.defaultCommand,
          error: error instanceof Error ? error.message : String(error),
        },
      }));
    } finally {
      setDetecting(null);
    }
  };

  const renderDetectResult = (result?: AgentDetectResult) => result && (
    <div className={`settings-message ${result.available ? 'ok' : 'error'}`}>
      {result.available
        ? `可用：${result.path}${result.version ? `（${result.version}）` : ''}`
        : `不可用：${result.error || result.path}`}
    </div>
  );

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">AI CLI</h3>

      <label className="settings-field">
        <span className="settings-label">Claude Code CLI 路径</span>
        <span className="settings-desc">留空时使用系统 PATH 中的 claude；Windows 可填写 claude.cmd 或完整 exe 路径。</span>
        <input
          className="settings-input"
          value={settings.aiClaudePath}
          placeholder="例如 claude 或 C:\\Users\\you\\AppData\\Roaming\\npm\\claude.cmd"
          onChange={(event) => updateSettings({ aiClaudePath: event.target.value })}
        />
      </label>

      <label className="settings-field">
        <span className="settings-label">Claude Code 模型</span>
        <span className="settings-desc">留空时交给 Claude Code CLI 使用自身默认模型；需要固定模型时填写如 sonnet。</span>
        <input
          className="settings-input"
          value={settings.aiClaudeModel}
          placeholder="留空使用 Claude Code CLI 默认模型"
          onChange={(event) => updateSettings({ aiClaudeModel: event.target.value })}
        />
      </label>

      <div className="settings-section-actions">
        <button
          type="button"
          className="settings-action-button"
          onClick={() => void handleDetect('claude', settings.aiClaudePath)}
          disabled={detecting !== null}
        >
          {detecting === 'claude' ? '检测中...' : '检测 Claude Code CLI'}
        </button>
      </div>
      {renderDetectResult(results.claude)}

      <label className="settings-field">
        <span className="settings-label">OpenCode CLI 路径</span>
        <span className="settings-desc">留空时使用系统 PATH 中的 opencode；Windows 可填写 opencode.cmd 或完整 exe 路径。</span>
        <input
          className="settings-input"
          value={settings.aiOpenCodePath}
          placeholder="例如 opencode 或 C:\\Users\\you\\AppData\\Roaming\\npm\\opencode.cmd"
          onChange={(event) => updateSettings({ aiOpenCodePath: event.target.value })}
        />
      </label>

      <label className="settings-field">
        <span className="settings-label">OpenCode 模型</span>
        <span className="settings-desc">留空时交给 OpenCode CLI 使用自身默认模型；需要固定模型时填写 provider/model。</span>
        <input
          className="settings-input"
          value={settings.aiOpenCodeModel}
          placeholder="例如 anthropic/claude-sonnet-4"
          onChange={(event) => updateSettings({ aiOpenCodeModel: event.target.value })}
        />
      </label>

      <div className="settings-section-actions">
        <button
          type="button"
          className="settings-action-button"
          onClick={() => void handleDetect('opencode', settings.aiOpenCodePath)}
          disabled={detecting !== null}
        >
          {detecting === 'opencode' ? '检测中...' : '检测 OpenCode CLI'}
        </button>
      </div>
      {renderDetectResult(results.opencode)}
    </div>
  );
}
