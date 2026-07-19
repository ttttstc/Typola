import { useSettings } from '../../hooks/useSettings';
import { translate } from '../../services/i18n';

type SettingsToggleProps = {
  checked: boolean;
  label: string;
  onChange: () => void;
  disabled?: boolean;
};

export function SettingsToggle({ checked, label, onChange, disabled = false }: SettingsToggleProps) {
  const settings = useSettings();
  const stateLabel = translate(settings.locale, checked ? 'toggleOn' : 'toggleOff');

  return (
    <span className="settings-toggle-control">
      <button
        type="button"
        className={`toggle-switch ${checked ? 'on' : ''}`}
        onClick={onChange}
        disabled={disabled}
        aria-label={label}
        aria-pressed={checked}
      />
      <span className={`settings-toggle-state ${checked ? 'on' : 'off'}`} aria-hidden="true">
        {stateLabel}
      </span>
    </span>
  );
}
