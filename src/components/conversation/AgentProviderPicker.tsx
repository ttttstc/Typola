import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Settings } from 'lucide-react';
import type { AgentProvider } from '../../services/agent/provider';
import { AGENT_PROVIDERS, getAgentProviderConfig } from '../../services/agent/provider';
import { AgentIcon } from './AgentIcon';

type ProviderOption = {
  id: AgentProvider | 'codex';
  label: string;
  status: string;
  selectable: boolean;
};

type AgentProviderPickerProps = {
  activeProvider: AgentProvider;
  currentModel?: string;
  configuredModel?: string;
  onSwitchProvider: (provider: AgentProvider) => void;
};

const CODEX_OPTION: ProviderOption = {
  id: 'codex',
  label: 'Codex',
  status: '仅检测，暂不支持发送',
  selectable: false,
};

export function AgentProviderPicker({
  activeProvider,
  currentModel,
  configuredModel,
  onSwitchProvider,
}: AgentProviderPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = getAgentProviderConfig(activeProvider);
  const modelLabel = currentModel || configuredModel || '默认模型';
  const options = useMemo<ProviderOption[]>(() => [
    ...AGENT_PROVIDERS.map((provider) => ({
      id: provider.id,
      label: provider.label,
      status: provider.id === activeProvider ? `当前使用 · ${modelLabel}` : '可发送',
      selectable: true,
    })),
    CODEX_OPTION,
  ], [activeProvider, modelLabel]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="agent-provider-picker" ref={rootRef}>
      <button
        type="button"
        className={`avatar-agent-trigger${open ? ' is-open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`${active.label} · ${modelLabel}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="avatar-btn">
          <AgentIcon id={active.id} size={18} />
        </span>
        <ChevronDown size={13} />
      </button>
      {open && (
        <div className="agent-provider-popover" role="menu">
          <div className="agent-provider-menu">
            {options.map((option) => {
              const activeOption = option.id === activeProvider;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={activeOption}
                  disabled={!option.selectable}
                  className={`agent-provider-option${activeOption ? ' active' : ''}`}
                  onClick={() => {
                    if (!option.selectable || option.id === 'codex') return;
                    setOpen(false);
                    onSwitchProvider(option.id);
                  }}
                >
                  <AgentIcon id={option.id} size={18} />
                  <span className="agent-provider-option-text">
                    <strong>{option.label}</strong>
                    <span>{option.status}</span>
                  </span>
                  {activeOption ? <Check size={14} /> : null}
                </button>
              );
            })}
          </div>
          <div className="agent-provider-popover-footer">
            <Settings size={13} />
            <span>CLI 检测与路径设置在设置页管理</span>
          </div>
        </div>
      )}
    </div>
  );
}
