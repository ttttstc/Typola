import { useState, type CSSProperties, type KeyboardEvent } from 'react';
import { getSettings, updateSettings, type AppSettings } from '../../services/settingsService';
import { listThemeDefinitions, type ThemeDefinition, type ThemeId } from '../../services/themeRegistry';

const ZOOM_LEVELS = [80, 90, 100, 110, 120];
const THEMES = listThemeDefinitions();

function themePreviewStyle(theme: ThemeDefinition): CSSProperties {
  return {
    '--theme-preview-canvas': theme.preview.canvas,
    '--theme-preview-paper': theme.preview.paper,
    '--theme-preview-accent': theme.preview.accent,
  } as CSSProperties;
}

export function AppearanceSection() {
  const [settings, setSettings] = useState(() => getSettings());
  const [themeToast, setThemeToast] = useState<{ current: ThemeId; previous: ThemeId } | null>(null);
  const activeThemeIndex = Math.max(0, THEMES.findIndex((theme) => theme.id === settings.themeId));

  const handleChange = (patch: Partial<AppSettings>) => {
    updateSettings(patch);
    setSettings(getSettings());
  };

  const handleThemePick = (themeId: ThemeId) => {
    if (themeId === settings.themeId) return;
    const previous = settings.themeId;
    const nextSettings = updateSettings({ themeId });
    setSettings(nextSettings);
    setThemeToast({ current: themeId, previous });
  };

  const handleUndoTheme = () => {
    if (!themeToast) return;
    const nextSettings = updateSettings({ themeId: themeToast.previous });
    setSettings(nextSettings);
    setThemeToast(null);
  };

  const focusThemeCard = (themeId: ThemeId) => {
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(`[data-theme-card="${themeId}"]`)?.focus();
    });
  };

  const handleThemeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keyActions: Record<string, number> = {
      ArrowRight: activeThemeIndex + 1,
      ArrowDown: activeThemeIndex + 1,
      ArrowLeft: activeThemeIndex - 1,
      ArrowUp: activeThemeIndex - 1,
      Home: 0,
      End: THEMES.length - 1,
    };
    if (!(event.key in keyActions)) return;
    event.preventDefault();
    const nextIndex = (keyActions[event.key] + THEMES.length) % THEMES.length;
    const nextTheme = THEMES[nextIndex];
    handleThemePick(nextTheme.id);
    focusThemeCard(nextTheme.id);
  };

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">外观</h3>

      <div className="settings-block">
        <div className="settings-label">主题</div>
        <div className="theme-gallery" role="radiogroup" aria-label="主题" onKeyDown={handleThemeKeyDown}>
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              className={`theme-card ${settings.themeId === theme.id ? 'active' : ''}`}
              data-theme-card={theme.id}
              role="radio"
              aria-checked={settings.themeId === theme.id}
              tabIndex={settings.themeId === theme.id ? 0 : -1}
              onClick={() => handleThemePick(theme.id)}
              style={themePreviewStyle(theme)}
            >
              <span className="theme-card-preview" aria-hidden="true">
                <span className="theme-card-preview-toolbar" />
                <span className="theme-card-preview-body">
                  <span className="theme-card-preview-sidebar" />
                  <span className="theme-card-preview-paper">
                    <span />
                    <span />
                    <span />
                  </span>
                </span>
                <span className="theme-card-preview-ai" />
              </span>
              <span className="theme-card-copy">
                <strong>{theme.name}</strong>
                <span>{theme.meta}</span>
              </span>
            </button>
          ))}
        </div>
        {themeToast && (
          <div className="theme-toast" role="status">
            <span>已切换到 {THEMES.find((theme) => theme.id === themeToast.current)?.name}</span>
            <button type="button" onClick={handleUndoTheme}>撤销</button>
          </div>
        )}
      </div>

      <label className="settings-checkbox-row">
        <input
          type="checkbox"
          name="reviewEnhanceMarks"
          checked={settings.themeOptions.reviewEnhanceMarks}
          onChange={(e) => handleChange({
            themeOptions: {
              ...settings.themeOptions,
              reviewEnhanceMarks: e.target.checked,
            },
          })}
        />
        <span>检视模式增强 AI 改动与标注颜色</span>
      </label>

      <div className="settings-hint">
        主题会改变 Typola 的界面、编辑器、AI 浮层和检视标记，但不会改变 Markdown 文件内容。导出样式仍由 Word / HTML 导出预设控制。
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">界面缩放</div>
        </div>
        <select
          className="settings-select"
          value={settings.zoomLevel}
          onChange={(e) => handleChange({ zoomLevel: Number(e.target.value) })}
        >
          {ZOOM_LEVELS.map((z) => (
            <option key={z} value={z}>{z}%</option>
          ))}
        </select>
      </div>
    </div>
  );
}
