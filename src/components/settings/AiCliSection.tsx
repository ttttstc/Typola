import { useState } from 'react';
import { AgentRuntimeCard } from '../agent/AgentRuntimeCard';
import { useSettings } from '../../hooks/useSettings';
import { detectAgentRuntime } from '../../services/agent/runtime/detection';
import type { AgentDetectResult } from '../../services/agentService';
import { listAgentRuntimeDefs } from '../../services/agent/runtime/registry';
import type { AgentRuntimeId } from '../../services/agent/runtime/types';
import { updateSettings } from '../../services/settingsService';

export function AiCliSection() {
  const settings = useSettings();
  const [detecting, setDetecting] = useState<AgentRuntimeId | null>(null);
  const [results, setResults] = useState<Partial<Record<AgentRuntimeId, AgentDetectResult>>>({});
  const runtimes = listAgentRuntimeDefs();

  const handleDetect = async (runtimeId: AgentRuntimeId, path: string) => {
    setDetecting(runtimeId);
    try {
      const next = await detectAgentRuntime(runtimeId, path);
      setResults((current) => ({ ...current, [runtimeId]: next }));
    } catch (error) {
      setResults((current) => ({
        ...current,
        [runtimeId]: {
          available: false,
          path,
          diagnostics: [{
            code: 'unknown',
            level: 'error',
            title: 'AI CLI 检测失败',
            detail: error instanceof Error ? error.message : String(error),
            fix: { label: '重新检测', action: 'rescan' },
          }],
          error: error instanceof Error ? error.message : String(error),
        },
      }));
    } finally {
      setDetecting(null);
    }
  };

  const runtimePath = (runtimeId: AgentRuntimeId) => {
    if (runtimeId === 'opencode') return settings.aiOpenCodePath;
    if (runtimeId === 'codex') return settings.aiCodexPath;
    return settings.aiClaudePath;
  };
  const updateRuntimePath = (runtimeId: AgentRuntimeId, value: string) => {
    if (runtimeId === 'opencode') updateSettings({ aiOpenCodePath: value });
    else if (runtimeId === 'codex') updateSettings({ aiCodexPath: value });
    else updateSettings({ aiClaudePath: value });
  };

  return (
    <div className="settings-section settings-section-agent-runtime">
      <h3 className="settings-section-title">AI 执行</h3>
      <p className="settings-section-intro">
        选择 Typola AI 工作台默认使用的本地 CLI，并检测 Claude / OpenCode / Codex 是否能被桌面应用识别。这里不运行模型测试，Codex 当前仅检测不发送。
      </p>
      <div className="agent-runtime-card-list">
        {runtimes.map((runtime) => (
          <AgentRuntimeCard
            key={runtime.id}
            runtime={runtime}
            active={settings.aiActiveProvider === runtime.id}
            pathValue={runtimePath(runtime.id)}
            detecting={detecting === runtime.id}
            result={results[runtime.id]}
            onSetActive={(provider) => updateSettings({ aiActiveProvider: provider })}
            onPathChange={(value) => updateRuntimePath(runtime.id, value)}
            onDetect={() => void handleDetect(runtime.id, runtimePath(runtime.id))}
          />
        ))}
      </div>
    </div>
  );
}
