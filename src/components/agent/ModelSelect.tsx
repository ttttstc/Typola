import type { AgentModelOption } from '../../services/agent/runtime/types';

type ModelSelectProps = {
  label: string;
  description: string;
  value: string;
  options: AgentModelOption[];
  placeholder?: string;
  onChange: (value: string) => void;
};

export function ModelSelect({
  label,
  description,
  value,
  options,
  placeholder = '留空使用 CLI 默认模型',
  onChange,
}: ModelSelectProps) {
  const normalizedValue = value.trim();
  const knownValue = normalizedValue || 'default';
  const isCustom = normalizedValue.length > 0 && !options.some((option) => option.id === normalizedValue);

  return (
    <div className="agent-model-select">
      <label className="settings-field">
        <span className="settings-label">{label}</span>
        <span className="settings-desc">{description}</span>
        <select
          className="settings-input"
          value={isCustom ? 'custom' : knownValue}
          onChange={(event) => {
            const next = event.target.value;
            onChange(next === 'default' || next === 'custom' ? '' : next);
          }}
        >
          {options.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
          <option value="custom">自定义...</option>
        </select>
      </label>
      {(isCustom || knownValue === 'default') && (
        <label className="settings-field agent-model-custom-field">
          <span className="settings-label">自定义模型</span>
          <input
            className="settings-input"
            value={value}
            placeholder={placeholder}
            onChange={(event) => onChange(event.target.value)}
          />
        </label>
      )}
    </div>
  );
}
