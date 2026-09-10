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

      <div className="settings-row settings-row-stacked">
        <div>
          <label className="settings-label" htmlFor="terminal-shell-path">Shell 路径</label>
          <div className="settings-desc">留空时 Windows 优先使用 pwsh，macOS 使用系统默认 SHELL。</div>
        </div>
        <input
          id="terminal-shell-path"
          className="settings-input"
          value={settings.terminalShellPath}
          placeholder="例如 C:\\Program Files\\PowerShell\\7\\pwsh.exe 或 /bin/zsh"
          onChange={(event) => updateSettings({ terminalShellPath: event.target.value })}
        />
      </div>

      <div className="settings-group-title">外观</div>

      <div className="settings-row settings-row-stacked">
        <div>
          <label className="settings-label" htmlFor="terminal-font-family">字体</label>
        </div>
        <input
          id="terminal-font-family"
          className="settings-input"
          value={settings.terminalFontFamily}
          onChange={(event) => updateSettings({ terminalFontFamily: event.target.value })}
        />
      </div>

      <div className="settings-row">
        <div>
          <label className="settings-label" htmlFor="terminal-font-size">字号</label>
        </div>
        <div className="settings-font-control">
          <input
            id="terminal-font-size"
            className="settings-input settings-font-input"
            type="number"
            min={10}
            max={24}
            value={settings.terminalFontSize}
            onChange={(event) => updateSettings({ terminalFontSize: Number(event.target.value) })}
          />
        </div>
      </div>

      <div className="settings-row">
        <div>
          <label className="settings-label" htmlFor="terminal-cursor-style">光标样式</label>
        </div>
        <select
          id="terminal-cursor-style"
          className="settings-select"
          value={settings.terminalCursorStyle}
          onChange={(event) => updateSettings({ terminalCursorStyle: event.target.value as TerminalCursorStyle })}
        >
          {cursorOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">光标闪烁</div>
          <div className="settings-desc">关闭后光标保持静止，长时间写作时更稳。</div>
        </div>
        <SettingsToggle
          checked={settings.terminalCursorBlink}
          label="光标闪烁"
          onChange={() => updateSettings({ terminalCursorBlink: !settings.terminalCursorBlink })}
        />
      </div>

      <div className="settings-group-title">行为</div>

      <div className="settings-row">
        <div>
          <label className="settings-label" htmlFor="terminal-shortcut-preset">快捷键预设</label>
        </div>
        <select
          id="terminal-shortcut-preset"
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
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">多行粘贴确认</div>
          <div className="settings-desc">防止把整段命令误粘贴进终端直接执行。</div>
        </div>
        <SettingsToggle
          checked={settings.terminalConfirmMultilinePaste}
          label="多行粘贴确认"
          onChange={() => updateSettings({
            terminalConfirmMultilinePaste: !settings.terminalConfirmMultilinePaste,
          })}
        />
      </div>
    </div>
  );
}
