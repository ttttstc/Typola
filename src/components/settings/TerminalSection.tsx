import { useSettings } from '../../hooks/useSettings';
import {
  updateSettings,
  type TerminalCursorStyle,
  type TerminalShortcutPreset,
} from '../../services/settingsService';
import { SettingsToggle } from './SettingsToggle';

const cursorOptions: { value: TerminalCursorStyle; label: string }[] = [
  { value: 'block', label: '块状光标' },
  { value: 'bar', label: '竖线光标' },
  { value: 'underline', label: '下划线光标' },
];

const shortcutOptions: { value: TerminalShortcutPreset; label: string }[] = [
  { value: 'default', label: '默认' },
  { value: 'windows', label: 'Windows 风格' },
];

export function TerminalSection() {
  const settings = useSettings();

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">终端</h3>

      <label className="settings-field">
        <span className="settings-label">Shell 路径</span>
        <span className="settings-desc">留空时 Windows 优先使用 pwsh，macOS 使用系统默认 SHELL。</span>
        <input
          className="settings-input"
          value={settings.terminalShellPath}
          placeholder="例如 C:\\Program Files\\PowerShell\\7\\pwsh.exe 或 /bin/zsh"
          onChange={(event) => updateSettings({ terminalShellPath: event.target.value })}
        />
      </label>

      <label className="settings-field">
        <span className="settings-label">字体</span>
        <input
          className="settings-input"
          value={settings.terminalFontFamily}
          onChange={(event) => updateSettings({ terminalFontFamily: event.target.value })}
        />
      </label>

      <label className="settings-field">
        <span className="settings-label">字号</span>
        <input
          className="settings-input"
          type="number"
          min={10}
          max={24}
          value={settings.terminalFontSize}
          onChange={(event) => updateSettings({ terminalFontSize: Number(event.target.value) })}
        />
      </label>

      <label className="settings-field">
        <span className="settings-label">光标样式</span>
        <select
          className="settings-select"
          value={settings.terminalCursorStyle}
          onChange={(event) => updateSettings({ terminalCursorStyle: event.target.value as TerminalCursorStyle })}
        >
          {cursorOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>

      <label className="settings-field settings-toggle-row">
        <span>
          <span className="settings-label">光标闪烁</span>
          <span className="settings-desc">关闭后光标保持静止，长时间写作时更稳。</span>
        </span>
        <SettingsToggle
          checked={settings.terminalCursorBlink}
          label="光标闪烁"
          onChange={() => updateSettings({ terminalCursorBlink: !settings.terminalCursorBlink })}
        />
      </label>

      <label className="settings-field">
        <span className="settings-label">快捷键预设</span>
        <select
          className="settings-select"
          value={settings.terminalShortcutPreset}
          onChange={(event) => updateSettings({
            terminalShortcutPreset: event.target.value as TerminalShortcutPreset,
          })}
        >
          {shortcutOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>

      <label className="settings-field settings-toggle-row">
        <span>
          <span className="settings-label">多行粘贴确认</span>
          <span className="settings-desc">防止把整段命令误粘贴进终端直接执行。</span>
        </span>
        <SettingsToggle
          checked={settings.terminalConfirmMultilinePaste}
          label="多行粘贴确认"
          onChange={() => updateSettings({
            terminalConfirmMultilinePaste: !settings.terminalConfirmMultilinePaste,
          })}
        />
      </label>
    </div>
  );
}
