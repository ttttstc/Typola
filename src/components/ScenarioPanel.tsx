import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, Presentation, WandSparkles } from 'lucide-react';
import { useSettings } from '../hooks/useSettings';
import {
  buildContextFromFile,
  openFlowScenariosFile,
  readFlowScenarios,
  resolveFlowScenarioTemplate,
} from '../services/flowScenarioService';
import { isClaudeNotFoundError } from '../services/agentErrors';
import type { AgentBridge } from '../services/agentBridge';
import type { FlowScenario } from '../types/flowScenario';

type ScenarioPanelProps = {
  bridge: AgentBridge;
  filePath?: string;
  workspaceRoot?: string;
  onEnsureTerminalVisible: () => void;
  onBeforeInject: () => void | Promise<void>;
  // P1-E:Claude CLI 未找到时跳设置面板 AI CLI 段
  onOpenAiCliSettings: () => void;
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
  onOpenAiCliSettings,
}: ScenarioPanelProps) {
  const settings = useSettings();
  const [scenarios, setScenarios] = useState<FlowScenario[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState('');
  // P1-D:加载时一次性写入的 JSON 错误,独立于 apply/copy 的 transient error,
  // 不会被后续 handleApply 误清
  const [loadError, setLoadError] = useState('');
  // P1-E:Claude CLI 未找到时显示「打开设置」入口(独立状态避免每次重写 error 文案)
  const [agentNotFound, setAgentNotFound] = useState(false);
  // 单步应用:点击后按顺序走「启动 → 注入」,阶段用于按钮文案 + 防连点
  // (替代旧版「启动完成,点击应用」两步式 —— spec §5:启动与注入是一段连续体验)
  const [phase, setPhase] = useState<'idle' | 'starting' | 'injecting'>('idle');
  // P1-C:同步 ref 锁。phase 是 React state,在 await onBeforeInject 期间还没翻到非 idle,
  // 仅靠 phase / 按钮 disabled 挡不住同帧二次点击;ref 进入即置位,才真正防连点。
  const applyingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void readFlowScenarios()
      .then((result) => {
        if (cancelled) return;
        setScenarios(result.scenarios);
        if (result.scenarios.length > 0) setSelectedId(result.scenarios[0].id);
        if (result.error) setLoadError(result.error);
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(String(e));
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
    // P1-C:同步 ref 锁防连点(phase 异步更新前的窗口里,二次点击仍会进来)
    if (applyingRef.current) return;
    applyingRef.current = true;
    setError('');
    setAgentNotFound(false);
    const claudeCommand = settings.aiClaudePath?.trim() || 'claude';
    try {
      try {
        await onBeforeInject();
      } catch (e) {
        setError(String(e));
        return;
      }
      const ctx = buildContextFromFile(filePath, workspaceRoot);
      const command = resolveFlowScenarioTemplate(selected.promptTemplate, ctx);
      const cwd = workspaceRoot
        ?? (filePath ? filePath.replace(/\\/g, '/').split('/').slice(0, -1).join('/') : undefined);

      if (!bridge.hasTerminal()) {
        // P1-C:TerminalPanel.startAgentTerminal 内部用 PTY 静默检测等真正就绪后才返回
        setPhase('starting');
        await bridge.ensureTerminal(claudeCommand, cwd);
      }
      setPhase('injecting');
      bridge.injectText(command);
      onEnsureTerminalVisible();
    } catch (e) {
      // P1-E:Claude CLI 不存在时,给用户跳设置面板的入口(不止 raw error 文案)
      if (isClaudeNotFoundError(e)) {
        setAgentNotFound(true);
        setError(`未找到 Claude CLI(${claudeCommand})。请在设置中配置正确的可执行文件路径。`);
      } else {
        setError(`启动或注入失败: ${e instanceof Error ? e.message : String(e)}`);
      }
    } finally {
      applyingRef.current = false;
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
        {loadError ? (
          // P1-D:JSON 解析失败 / 文件读不出 — 红条 + 一键打开文件修复(不静默回退)
          <div className="scenario-load-error" role="alert">
            <p className="scenario-load-error-text">场景注册表加载失败:{loadError}</p>
            <button
              type="button"
              className="scenario-load-error-btn"
              onClick={() => void handleOpenRegistry()}
            >
              打开文件修复
            </button>
          </div>
        ) : (
          <p className="scenario-empty">正在加载场景注册表…</p>
        )}
        {error && <p className="scenario-error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="scenario-panel">
      {loadError && (
        // 解析失败但 seed 已用(例如 IO 错误) — 顶部红条,下方仍可用
        <div className="scenario-load-error" role="alert">
          <p className="scenario-load-error-text">场景注册表异常:{loadError}</p>
          <button
            type="button"
            className="scenario-load-error-btn"
            onClick={() => void handleOpenRegistry()}
          >
            打开文件修复
          </button>
        </div>
      )}
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
          {error && (
            <div className="scenario-error-block" role="alert">
              <p className="scenario-error">{error}</p>
              {agentNotFound && (
                <button
                  type="button"
                  className="scenario-error-action-btn"
                  onClick={onOpenAiCliSettings}
                >
                  打开设置
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
