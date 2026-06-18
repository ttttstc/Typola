import { useState } from 'react';
import { useSettings } from '../../hooks/useSettings';
import { detectAgent, type AgentDetectResult } from '../../services/agentService';
import { updateSettings } from '../../services/settingsService';

export function AiCliSection() {
  const settings = useSettings();
  const [detecting, setDetecting] = useState(false);
  const [result, setResult] = useState<AgentDetectResult | null>(null);

  const handleDetect = async () => {
    setDetecting(true);
    try {
      const next = await detectAgent(settings.aiClaudePath);
      setResult(next);
    } catch (error) {
      setResult({
        available: false,
        path: settings.aiClaudePath || 'claude',
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setDetecting(false);
    }
  };

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">AI CLI</h3>

      <label className="settings-field">
        <span className="settings-label">Claude CLI 路径</span>
        <span className="settings-desc">留空时使用系统 PATH 中的 claude；Windows 可填写 claude.cmd 或完整 exe 路径。</span>
        <input
          className="settings-input"
          value={settings.aiClaudePath}
          placeholder="例如 claude 或 C:\\Users\\you\\AppData\\Roaming\\npm\\claude.cmd"
          onChange={(event) => updateSettings({ aiClaudePath: event.target.value })}
        />
      </label>

      <label className="settings-field">
        <span className="settings-label">Claude 模型</span>
        <span className="settings-desc">M1 默认留空，交给 Claude CLI 使用自身默认模型；需要固定模型时填写如 sonnet。</span>
        <input
          className="settings-input"
          value={settings.aiClaudeModel}
          placeholder="留空使用 Claude CLI 默认模型"
          onChange={(event) => updateSettings({ aiClaudeModel: event.target.value })}
        />
      </label>

      <div className="settings-section-actions">
        <button
          type="button"
          className="settings-action-button"
          onClick={() => void handleDetect()}
          disabled={detecting}
        >
          {detecting ? '检测中...' : '检测 Claude CLI'}
        </button>
      </div>

      {result && (
        <div className={`settings-message ${result.available ? 'ok' : 'error'}`}>
          {result.available
            ? `可用：${result.path}${result.version ? `（${result.version}）` : ''}`
            : `不可用：${result.error || result.path}`}
        </div>
      )}
    </div>
  );
}
