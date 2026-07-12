import { useState } from 'react';
import { EDITOR_FONT_FAMILY_OPTIONS, getSettings, updateSettings, type AppSettings } from '../../services/settingsService';
import type { EditorFontFamily } from '../../services/settingsService';

const FONT_SIZES = [12, 13, 14, 15, 16, 18];
const TAB_SIZES = [2, 4, 8];
export function EditorSection() {
  const [settings, setSettings] = useState(() => getSettings());

  const handleChange = (patch: Partial<AppSettings>) => {
    updateSettings(patch);
    setSettings(getSettings());
  };

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">编辑器</h3>

      <div className="settings-row">
        <div>
          <div className="settings-label">字体</div>
        </div>
        <select
          className="settings-select"
          value={settings.editorFontFamily}
          onChange={(e) => handleChange({ editorFontFamily: e.target.value as EditorFontFamily })}
        >
          {EDITOR_FONT_FAMILY_OPTIONS.map((font) => (
            <option key={font.value} value={font.value}>{font.label}</option>
          ))}
        </select>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">字号</div>
        </div>
        <select
          className="settings-select"
          value={settings.editorFontSize}
          onChange={(e) => handleChange({ editorFontSize: Number(e.target.value) })}
        >
          {FONT_SIZES.map((s) => (
            <option key={s} value={s}>{s}px</option>
          ))}
        </select>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">Tab 宽度</div>
        </div>
        <select
          className="settings-select"
          value={settings.editorTabSize}
          onChange={(e) => handleChange({ editorTabSize: Number(e.target.value) })}
        >
          {TAB_SIZES.map((s) => (
            <option key={s} value={s}>{s} 空格</option>
          ))}
        </select>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">行号显示</div>
        </div>
        <button
          className={`toggle-switch ${settings.editorLineNumbers ? 'on' : ''}`}
          onClick={() => handleChange({ editorLineNumbers: !settings.editorLineNumbers })}
        />
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">自动换行</div>
        </div>
        <button
          className={`toggle-switch ${settings.editorWordWrap ? 'on' : ''}`}
          onClick={() => handleChange({ editorWordWrap: !settings.editorWordWrap })}
        />
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">拼写检查</div>
        </div>
        <button
          className={`toggle-switch ${settings.editorSpellCheck ? 'on' : ''}`}
          onClick={() => handleChange({ editorSpellCheck: !settings.editorSpellCheck })}
        />
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">浮条可见性</div>
          <div className="settings-help">开启后，选中文字会自动浮现工具条；右键菜单与 Ctrl+K 不受影响。浮条内可选择“本文档隐藏”或“全局隐藏”。</div>
        </div>
        <button
          className={`toggle-switch ${settings.selectionFloatingBarEnabled ? 'on' : ''}`}
          onClick={() => handleChange({ selectionFloatingBarEnabled: !settings.selectionFloatingBarEnabled })}
        />
      </div>
    </div>
  );
}
