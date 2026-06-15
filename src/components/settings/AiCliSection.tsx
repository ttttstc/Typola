import { useState } from 'react';
import { useSettings } from '../../hooks/useSettings';
import { detectAgent, clearAgentSession, type AgentDetectResult } from '../../services/agentService';
import { updateSettings } from '../../services/settingsService';

export function AiCliSection() {
  const settings = useSettings();
  const [detecting, setDetecting] = useState(false);
  const [result, setResult] = useState<AgentDetectResult | null>(null);
  const [message, setMessage] = useState('');

  const handleDetect = async () => {
    setDetecting(true);
    setMessage('');
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

  const handleClearGlobalSession = async () => {
    try {
      await clearAgentSession('global');
      setMessage('默认会话已清除。当前文档会话可在 AI 工作台中单独清除。');
    } catch (error) {
      setMessage(`清除失败：${error instanceof Error ? error.message : String(error)}`);
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

      <label className="settings-field settings-toggle-row">
        <span>
          <span className="settings-label">复用 Claude 会话</span>
          <span className="settings-desc">同一文档继续使用 --resume，保留上下文；关闭后后续版本会支持强制新会话。</span>
        </span>
        <button
          type="button"
          className={`toggle-switch ${settings.aiResumeSessions ? 'on' : ''}`}
          onClick={() => updateSettings({ aiResumeSessions: !settings.aiResumeSessions })}
          aria-pressed={settings.aiResumeSessions}
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
        <button
          type="button"
          className="settings-action-button secondary"
          onClick={() => void handleClearGlobalSession()}
        >
          清除默认会话
        </button>
      </div>

      {result && (
        <div className={`settings-message ${result.available ? 'ok' : 'error'}`}>
          {result.available
            ? `可用：${result.path}${result.version ? `（${result.version}）` : ''}`
            : `不可用：${result.error || result.path}`}
        </div>
      )}
      {message && <div className="settings-message">{message}</div>}
    </div>
  );
}
