import { useEffect, useState } from 'react';
import { ExternalLink, Loader2, Presentation, WandSparkles } from 'lucide-react';
import { useSettings } from '../hooks/useSettings';
import {
  buildContextFromFile,
  openFlowScenariosFile,
  readFlowScenarios,
  resolveFlowScenarioTemplate,
} from '../services/flowScenarioService';
import type { AgentBridge } from '../services/agentBridge';
import type { FlowScenario } from '../types/flowScenario';

type ScenarioPanelProps = {
  bridge: AgentBridge;
  filePath?: string;
  workspaceRoot?: string;
  onEnsureTerminalVisible: () => void;
  onBeforeInject: () => void | Promise<void>;
};

function iconFor(scenario: FlowScenario): React.ReactNode {
  const size = 22;
  switch (scenario.icon) {
    case 'presentation': return <Presentation size={size} />;
    default: return <WandSparkles size={size} />;
  }
}

export function ScenarioPanel({
  bridge,
  filePath,
  workspaceRoot,
  onEnsureTerminalVisible,
  onBeforeInject,
}: ScenarioPanelProps) {
  const settings = useSettings();
  const [scenarios, setScenarios] = useState<FlowScenario[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState('');
  // 单步应用:点击后按顺序走「启动 → 注入」,阶段用于按钮文案 + 防连点
  // (替代旧版「启动完成,点击应用」两步式 —— spec §5:启动与注入是一段连续体验)
  const [phase, setPhase] = useState<'idle' | 'starting' | 'injecting'>('idle');

  useEffect(() => {
    let cancelled = false;
    void readFlowScenarios()
      .then((list) => {
        if (cancelled) return;
        setScenarios(list);
        if (list.length > 0) setSelectedId(list[0].id);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(String(e));
      });
    return () => { cancelled = true; };
  }, []);

  const selected = scenarios.find((s) => s.id === selectedId) ?? null;

  const handleApply = async () => {
    if (!selected) return;
    if (!filePath) {
      setError('请先打开文件再应用场景卡。');
      return;
    }
    if (phase !== 'idle') return; // 防连点
    setError('');
    try {
      await onBeforeInject();
    } catch (e) {
      setError(String(e));
      return;
    }
    const ctx = buildContextFromFile(filePath, workspaceRoot);
    const command = resolveFlowScenarioTemplate(selected.promptTemplate, ctx);
    const claudeCommand = settings.aiClaudePath?.trim() || 'claude';
    const cwd = workspaceRoot
      ?? (filePath ? filePath.replace(/\\/g, '/').split('/').slice(0, -1).join('/') : undefined);

    try {
      if (!bridge.hasTerminal()) {
        // P1-C:TerminalPanel.startAgentTerminal 内部用 PTY 静默检测等真正就绪后才返回
        setPhase('starting');
        await bridge.ensureTerminal(claudeCommand, cwd);
      }
      setPhase('injecting');
      bridge.injectText(command);
      onEnsureTerminalVisible();
    } catch (e) {
      setError(`启动或注入失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPhase('idle');
    }
  };

  const handleCopy = async () => {
    if (!selected || !filePath) return;
    const ctx = buildContextFromFile(filePath, workspaceRoot);
    const command = resolveFlowScenarioTemplate(selected.promptTemplate, ctx);
    try {
      await navigator.clipboard.writeText(command);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleOpenRegistry = async () => {
    try {
      await openFlowScenariosFile();
    } catch (e) {
      setError(String(e));
    }
  };

  if (scenarios.length === 0) {
    return (
      <div className="scenario-panel">
        <p className="scenario-empty">正在加载场景注册表…</p>
        {error && <p className="scenario-error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="scenario-panel">
      <div className="scenario-header">
        <h3 className="scenario-title">场景</h3>
        <button
          type="button"
          className="scenario-edit-link"
          onClick={handleOpenRegistry}
          title="编辑场景注册表(JSON)"
        >
          <ExternalLink size={12} />
          <span>编辑场景</span>
        </button>
      </div>

      <div className="scenario-grid">
        {scenarios.map((scenario) => (
          <button
            key={scenario.id}
            type="button"
            className={`scenario-card ${selectedId === scenario.id ? 'active' : ''}`}
            onClick={() => setSelectedId(scenario.id)}
          >
            <span className="scenario-card-icon">{iconFor(scenario)}</span>
            <span className="scenario-card-label">{scenario.label}</span>
            <span className="scenario-card-desc">{scenario.description}</span>
          </button>
        ))}
      </div>

      {selected && (
        <div className="scenario-detail">
          {selected.guidance && (
            <pre className="scenario-guidance">{selected.guidance}</pre>
          )}
          {selected.skillHint && (
            <p className="scenario-skill-hint">建议 skill:<code>{selected.skillHint}</code></p>
          )}
          <div className="scenario-actions">
            <button
              type="button"
              className="scenario-apply-btn"
              onClick={() => void handleApply()}
              disabled={!filePath || phase !== 'idle'}
              title={
                phase === 'starting' ? '正在启动 Claude…'
                : phase === 'injecting' ? '正在把场景命令贴入终端…'
                : '把场景命令贴到终端;若 claude 未起,先启动再应用'
              }
            >
              {phase !== 'idle' && <Loader2 size={14} className="spinning" />}
              <span>
                {phase === 'starting' ? '正在启动 Claude…'
                  : phase === 'injecting' ? '正在注入…'
                  : '应用到终端'}
              </span>
            </button>
            <button
              type="button"
              className="scenario-copy-btn"
              onClick={() => void handleCopy()}
              disabled={!filePath}
            >
              复制命令
            </button>
          </div>
          {error && <p className="scenario-error">{error}</p>}
        </div>
      )}
    </div>
  );
}
