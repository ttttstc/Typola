import { useState } from 'react';
import { AgentRuntimeCard } from '../agent/AgentRuntimeCard';
import { useSettings } from '../../hooks/useSettings';
import { detectAgentRuntime } from '../../services/agent/runtime/detection';
import type { AgentDetectResult } from '../../services/agentService';
import type { AgentProvider } from '../../services/agent/provider';
import { listAgentRuntimeDefs } from '../../services/agent/runtime/registry';
import { updateSettings } from '../../services/settingsService';

export function AiCliSection() {
  const settings = useSettings();
  const [detecting, setDetecting] = useState<AgentProvider | null>(null);
  const [results, setResults] = useState<Partial<Record<AgentProvider, AgentDetectResult>>>({});
  const runtimes = listAgentRuntimeDefs();

  const handleDetect = async (provider: AgentProvider, path: string) => {
    setDetecting(provider);
    try {
      const next = await detectAgentRuntime(provider, path);
      setResults((current) => ({ ...current, [provider]: next }));
    } catch (error) {
      setResults((current) => ({
        ...current,
        [provider]: {
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

  const providerPath = (provider: AgentProvider) => provider === 'opencode'
    ? settings.aiOpenCodePath
    : settings.aiClaudePath;
  const providerModel = (provider: AgentProvider) => provider === 'opencode'
    ? settings.aiOpenCodeModel
    : settings.aiClaudeModel;
  const updateProviderPath = (provider: AgentProvider, value: string) => {
    updateSettings(provider === 'opencode' ? { aiOpenCodePath: value } : { aiClaudePath: value });
  };
  const updateProviderModel = (provider: AgentProvider, value: string) => {
    updateSettings(provider === 'opencode' ? { aiOpenCodeModel: value } : { aiClaudeModel: value });
  };

  return (
    <div className="settings-section settings-section-agent-runtime">
      <h3 className="settings-section-title">AI 执行</h3>
      <p className="settings-section-intro">
        选择 Typola AI 工作台默认使用的本地 CLI，并查看它能访问的工作区、Plugin 目录与检测状态。这里只做 CLI 识别，不运行模型测试。
      </p>
      <div className="agent-runtime-card-list">
        {runtimes.map((runtime) => (
          <AgentRuntimeCard
            key={runtime.id}
            runtime={runtime}
            active={settings.aiActiveProvider === runtime.id}
            pathValue={providerPath(runtime.id)}
            modelValue={providerModel(runtime.id)}
            detecting={detecting === runtime.id}
            result={results[runtime.id]}
            workspaceRoot={settings.aiWorkspaceRoot}
            pluginDirs={settings.aiPluginDirs}
            onSetActive={(provider) => updateSettings({ aiActiveProvider: provider })}
            onPathChange={(value) => updateProviderPath(runtime.id, value)}
            onModelChange={(value) => updateProviderModel(runtime.id, value)}
            onDetect={() => void handleDetect(runtime.id, providerPath(runtime.id))}
          />
        ))}
      </div>
    </div>
  );
}
