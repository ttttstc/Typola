import { useMemo } from 'react';
import type { AgentProvider } from '../../services/agent/provider';
import { AGENT_PROVIDERS, getAgentProviderConfig } from '../../services/agent/provider';
import { ControlMenu, type ControlMenuItem } from '../ui/ControlMenu';
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
  const items = useMemo<ControlMenuItem[]>(() => options.map((option) => ({
    id: option.id,
    label: option.label,
    description: option.status,
    icon: <AgentIcon id={option.id} size={18} />,
    active: option.id === activeProvider,
    selection: 'radio',
    disabled: !option.selectable,
    onSelect: () => {
      if (option.selectable && option.id !== 'codex') onSwitchProvider(option.id);
    },
  })), [activeProvider, onSwitchProvider, options]);

  return (
    <ControlMenu
      label={`${active.label} · ${modelLabel}`}
      icon={(
        <span className="avatar-btn">
          <AgentIcon id={active.id} size={18} />
        </span>
      )}
      items={items}
      active
      placement="top-start"
      className="agent-provider-picker"
      triggerClassName="avatar-agent-trigger"
      menuClassName="agent-provider-popover"
      itemClassName="agent-provider-option"
    />
  );
}
