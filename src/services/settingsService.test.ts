// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addCustomExportPreset,
  addCustomHtmlExportPreset,
  activateLicenseCode,
  clearLicense,
  canAddCustomExportPreset,
  canAddCustomHtmlExportPreset,
  CUSTOM_EXPORT_PRESET_LIMIT_MESSAGE,
  CUSTOM_HTML_EXPORT_PRESET_LIMIT_MESSAGE,
  getExportPreset,
  getExportPresetConfig,
  getCustomExportPresetLimit,
  getCustomHtmlExportPresetLimit,
  getHtmlExportPreset,
  getHtmlExportPresetConfig,
  getLastWorkspaceRoot,
  getSettings,
  listEnabledExportPresets,
  listEnabledHtmlExportPresets,
  removeExportPreset,
  removeCustomExportPreset,
  removeCustomHtmlExportPreset,
  resolvePreviewFontFamily,
  resolvePreviewHeadingFontFamily,
  resolvePreviewChineseFontFamily,
  resolvePreviewLatinFontFamily,
  setExportPreset,
  setExportPresetEnabled,
  setHtmlExportPreset,
  setHtmlExportPresetEnabled,
  setLastWorkspaceRoot,
  updateSettings,
} from './settingsService';
import type { CustomHtmlExportPresetId, HtmlExportPreset } from './htmlExportPresets';
import { importPresetFromJson, listPresets, type CustomPresetId, type PresetConfig } from './word';

function customPreset(id: string, name: string) {
  return importPresetFromJson(JSON.stringify({
    id,
    name,
    description: `${name}导出样式`,
    base: 'legal',
    config: {
      fonts: { default: { name: '宋体', ascii: 'Times New Roman', size: 11 } },
    },
  }));
}

function customHtmlPreset(id: string, name: string): { id: CustomHtmlExportPresetId; preset: HtmlExportPreset } {
  return {
    id: `html-custom:${id}` as CustomHtmlExportPresetId,
    preset: {
      id: `html-custom:${id}` as CustomHtmlExportPresetId,
      name,
      description: `${name} HTML 样式`,
      css: `.typola-html-article p { color: rgb(1, 2, 3); }`,
      source: 'user',
      kind: 'custom',
      base: 'html-wechat-style',
    },
  };
}

describe('settingsService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns defaults when persisted settings are missing or invalid', () => {
    expect(getSettings().exportPresetId).toBe('minimal');
    expect(getSettings().autoUpdateCheck).toBe(true);
    expect(getSettings().ignoredVersion).toBe('');
    expect(getSettings().wechatCustomCss).toBe('');
    expect(getSettings()).toMatchObject({
      appearanceColorSystem: 'define-color',
      defineColorSettings: { l: 1, c: 0, h: 0 },
      editorFontFamily: 'Source Han Serif SC VF',
      previewFontFamily: 'Default',
      previewChineseFontFamily: 'Default',
      previewLatinFontFamily: 'Default',
      previewHeadingFontFamily: 'Body',
      tocAlwaysPinned: false,
    });

    localStorage.setItem('typola-settings', '{invalid json');

    expect(getSettings().exportPresetId).toBe('minimal');
    expect(getSettings().autoUpdateCheck).toBe(true);
    expect(getSettings().wechatCustomCss).toBe('');
    expect(getSettings().previewFontFamily).toBe('Default');
    expect(getSettings().tocAlwaysPinned).toBe(false);
  });

  it('persists and normalizes ignored update version', () => {
    updateSettings({ ignoredVersion: ' 2.0.7 ' });
    expect(getSettings().ignoredVersion).toBe('2.0.7');
    expect(JSON.parse(localStorage.getItem('typola-settings') ?? '{}').ignoredVersion).toBe('2.0.7');

    updateSettings({ ignoredVersion: 42 as unknown as string });
    expect(getSettings().ignoredVersion).toBe('');
  });

  it('persists the selectable editor font and migrates the old default', () => {
    expect(getSettings().editorFontFamily).toBe('Source Han Serif SC VF');

    updateSettings({ editorFontFamily: 'JetBrains Mono' });
    expect(getSettings().editorFontFamily).toBe('JetBrains Mono');

    localStorage.setItem('typola-settings', JSON.stringify({
      fontDefaultsVersion: 3,
      editorFontFamily: 'IBM Plex Mono',
    }));
    expect(getSettings().editorFontFamily).toBe('Source Han Serif SC VF');
  });

  it('persists custom theme colors and restores them from localStorage', () => {
    const defineColorSettings = {
      ...getSettings().defineColorSettings,
      l: 0.72,
      c: 0.08,
      h: 224,
      isGradient: true,
      pattern: 'noise' as const,
    };

    updateSettings({ appearanceColorSystem: 'define-color', defineColorSettings });
    expect(getSettings()).toMatchObject({ appearanceColorSystem: 'define-color', defineColorSettings });

    localStorage.removeItem('typola-settings');
    localStorage.setItem('typola-settings', JSON.stringify({
      appearanceColorSystem: 'define-color',
      defineColorSettings,
    }));
    expect(getSettings()).toMatchObject({ appearanceColorSystem: 'define-color', defineColorSettings });
  });

  it('persists and normalizes the default pinned outline preference', () => {
    expect(getSettings().tocAlwaysPinned).toBe(false);

    updateSettings({ tocAlwaysPinned: true });
    expect(getSettings().tocAlwaysPinned).toBe(true);

    updateSettings({ locale: 'en-US' });
    expect(getSettings().tocAlwaysPinned).toBe(true);

    localStorage.setItem('typola-settings', JSON.stringify({ tocAlwaysPinned: 'yes' }));
    expect(getSettings().tocAlwaysPinned).toBe(false);
  });

  it('persists the selected Typola theme and falls back to Plain Paper for unknown theme ids', () => {
    expect(getSettings()).toMatchObject({
      themeId: 'plain-paper',
      themeOptions: {
        reviewEnhanceMarks: true,
      },
    });

    updateSettings({
      themeId: 'ink-basin',
      themeOptions: { reviewEnhanceMarks: false },
    });
    expect(getSettings()).toMatchObject({
      themeId: 'ink-basin',
      themeOptions: {
        reviewEnhanceMarks: false,
      },
    });

    localStorage.setItem('typola-settings', JSON.stringify({
      themeId: 'dark',
      themeOptions: { reviewEnhanceMarks: 'yes' },
    }));
    expect(getSettings()).toMatchObject({
      themeId: 'plain-paper',
      themeOptions: {
        reviewEnhanceMarks: true,
      },
    });
  });

  it('migrates the legacy dark appearance switch to the Night Current theme', () => {
    localStorage.setItem('typola-settings', JSON.stringify({ theme: 'dark' }));

    expect(getSettings().themeId).toBe('night-current');
    expect(JSON.parse(localStorage.getItem('typola-settings') || '{}')).toMatchObject({
      themeId: 'night-current',
    });
    expect(JSON.parse(localStorage.getItem('typola-settings') || '{}').theme).toBeUndefined();
  });

  it('migrates legacy export settings without recursive reads', () => {
    localStorage.setItem('typola-export-settings', JSON.stringify({ defaultPresetId: 'academic' }));

    expect(getExportPreset()).toBe('academic');
    expect(localStorage.getItem('typola-export-settings')).toBeNull();
    expect(JSON.parse(localStorage.getItem('typola-settings') || '{}')).toMatchObject({
      exportPresetId: 'academic',
    });
  });

  it('persists partial updates while preserving existing settings', () => {
    setExportPreset('report');
    updateSettings({
      editorFontSize: 16,
      locale: 'ja-JP',
      wechatCustomCss: '.typola-wechat-article p { color: red; }',
    });

    expect(getSettings()).toMatchObject({
      exportPresetId: 'report',
      editorFontSize: 16,
      locale: 'ja-JP',
      wechatCustomCss: '.typola-wechat-article p { color: red; }',
      previewWidth: 680,
    });
  });

  it('persists AI provider CLI settings and normalizes model strings as model strings', () => {
    const settings = updateSettings({
      aiClaudePath: ' claude.cmd ',
      aiClaudeModel: ' sonnet ',
      aiOpenCodePath: ' opencode.cmd ',
      aiOpenCodeModel: ' anthropic/claude-sonnet-4 ',
      aiCodexPath: ' codex.cmd ',
    });

    expect(settings).toMatchObject({
      aiClaudePath: 'claude.cmd',
      aiClaudeModel: 'sonnet',
      aiOpenCodePath: 'opencode.cmd',
      aiOpenCodeModel: 'anthropic/claude-sonnet-4',
      aiCodexPath: 'codex.cmd',
    });
    expect(getSettings().aiOpenCodePath).toBe('opencode.cmd');
    expect(getSettings().aiOpenCodeModel).toBe('anthropic/claude-sonnet-4');
  });

  it('persists the active AI Provider and falls back to Claude for invalid values', () => {
    expect(getSettings().aiActiveProvider).toBe('claude');

    updateSettings({ aiActiveProvider: 'opencode' });
    expect(getSettings().aiActiveProvider).toBe('opencode');

    localStorage.setItem('typola-settings', JSON.stringify({ aiActiveProvider: 'unknown' }));
    expect(getSettings().aiActiveProvider).toBe('claude');

    localStorage.setItem('typola-settings', JSON.stringify({ aiActiveProvider: 'codex' }));
    expect(getSettings().aiActiveProvider).toBe('claude');
  });

  it('serializes rapid partial settings updates against the latest in-memory snapshot', () => {
    updateSettings({ editorFontSize: 16 });
    updateSettings({ terminalFontSize: 15 });
    updateSettings({ locale: 'en-US' });

    expect(getSettings()).toMatchObject({
      editorFontSize: 16,
      terminalFontSize: 15,
      locale: 'en-US',
    });
  });

  it('normalizes unsupported locales back to Chinese while accepting English and Japanese', () => {
    updateSettings({ locale: 'en-US' });
    expect(getSettings().locale).toBe('en-US');

    updateSettings({ locale: 'ja-JP' });
    expect(getSettings().locale).toBe('ja-JP');

    localStorage.setItem('typola-settings', JSON.stringify({ locale: 'fr-FR' }));
    expect(getSettings().locale).toBe('zh-CN');
  });

  it('normalizes preview font choices and migrates legacy preview presets', () => {
    updateSettings({
      previewChineseFontFamily: 'Songti SC',
      previewLatinFontFamily: 'Georgia',
      previewHeadingFontFamily: 'Latin',
    });
    expect(getSettings()).toMatchObject({
      previewChineseFontFamily: 'Songti SC',
      previewLatinFontFamily: 'Georgia',
      previewHeadingFontFamily: 'Latin',
    });

    localStorage.setItem('typola-settings', JSON.stringify({
      previewFontFamily: 'Iowan Old Style',
      fontDefaultsVersion: 2,
    }));
    expect(getSettings()).toMatchObject({
      previewFontFamily: 'Default',
      previewChineseFontFamily: 'Songti SC',
      previewLatinFontFamily: 'Iowan Old Style',
      previewHeadingFontFamily: 'Latin',
      fontDefaultsVersion: 4,
    });

    localStorage.setItem('typola-settings', JSON.stringify({
      previewFontFamily: 'Chinese Serif',
      fontDefaultsVersion: 2,
    }));
    expect(getSettings()).toMatchObject({
      previewChineseFontFamily: 'Songti SC',
      previewLatinFontFamily: 'Georgia',
      previewHeadingFontFamily: 'Body',
    });

    localStorage.setItem('typola-settings', JSON.stringify({
      previewChineseFontFamily: 'Unsupported Font',
      previewLatinFontFamily: 'Unsupported Font',
      previewHeadingFontFamily: 'Unsupported Font',
      fontDefaultsVersion: 3,
    }));
    expect(getSettings()).toMatchObject({
      previewFontFamily: 'Default',
      previewChineseFontFamily: 'Default',
      previewLatinFontFamily: 'Default',
      previewHeadingFontFamily: 'Body',
    });
  });

  it('resolves combined Chinese, English, and heading font stacks', () => {
    const settings = updateSettings({
      previewChineseFontFamily: 'Songti SC',
      previewLatinFontFamily: 'Georgia',
      previewHeadingFontFamily: 'Body',
    });

    expect(resolvePreviewFontFamily(settings)).toContain('Georgia');
    expect(resolvePreviewFontFamily(settings)).toContain('"Songti SC"');
    expect(resolvePreviewHeadingFontFamily(settings)).toBe(
      'var(--preview-font-family, var(--reading-font-family, var(--font-reading)))',
    );

    const customSettings = updateSettings({
      previewChineseFontFamily: 'Custom',
      previewChineseCustomFont: '霞鹜文楷; bad',
      previewLatinFontFamily: 'Custom',
      previewLatinCustomFont: 'IBM Plex Serif',
      previewHeadingFontFamily: 'Custom',
      previewHeadingCustomFont: 'Source Han Serif SC',
    });

    expect(customSettings.previewChineseCustomFont).toBe('霞鹜文楷 bad');
    expect(resolvePreviewFontFamily(customSettings)).toContain('"IBM Plex Serif"');
    expect(resolvePreviewFontFamily(customSettings)).toContain('"霞鹜文楷 bad"');
    expect(resolvePreviewHeadingFontFamily(customSettings)).toContain('"Source Han Serif SC"');
    expect(resolvePreviewChineseFontFamily(customSettings)).toContain('"霞鹜文楷 bad"');
    expect(resolvePreviewLatinFontFamily(customSettings)).toContain('"IBM Plex Serif"');
  });

  it('exposes Chinese and Latin font stacks independent of the base preset', () => {
    const settings = getSettings();
    settings.previewChineseFontFamily = 'Songti SC';
    settings.previewLatinFontFamily = 'Iowan Old Style';
    settings.previewFontFamily = 'Default';

    const chinese = resolvePreviewChineseFontFamily(settings);
    const latin = resolvePreviewLatinFontFamily(settings);

    expect(chinese).toContain('Songti SC');
    expect(chinese).not.toContain('Iowan Old Style');
    expect(chinese).not.toContain('sans-serif');
    expect(latin).toContain('Iowan Old Style');
    expect(latin).not.toContain('Songti SC');
    expect(latin).not.toContain('sans-serif');
  });

  it('keeps old settings compatible with the default empty WeChat custom CSS', () => {
    localStorage.setItem('typola-settings', JSON.stringify({
      exportPresetId: 'report',
      editorFontSize: 15,
    }));

    expect(getSettings()).toMatchObject({
      exportPresetId: 'report',
      editorFontSize: 15,
      wechatCustomCss: '',
    });
  });

  it('defaults HTML export to the built-in WeChat style preset', () => {
    const settings = getSettings();

    expect(settings.htmlExportPresetId).toBe('html-wechat-style');
    expect(getHtmlExportPreset()).toBe('html-wechat-style');
    expect(getHtmlExportPresetConfig().name).toBe('简洁图文');
    expect(listEnabledHtmlExportPresets().map((preset) => preset.id)).toEqual([
      'html-wechat-style',
      'html-ai',
      'html-ip',
    ]);
  });

  it('migrates legacy WeChat custom CSS into a default custom HTML export preset', () => {
    localStorage.setItem('typola-settings', JSON.stringify({
      wechatCustomCss: '.typola-wechat-article p { color: red; }',
    }));

    const settings = getSettings();

    expect(settings.wechatCustomCss).toBe('.typola-wechat-article p { color: red; }');
    expect(settings.htmlExportPresetId).toBe('html-custom:wechat-custom');
    expect(settings.customHtmlExportPresets['html-custom:wechat-custom']).toMatchObject({
      name: '旧公众号自定义 CSS',
      base: 'html-wechat-style',
      css: '.typola-wechat-article p { color: red; }',
    });
    expect(JSON.parse(localStorage.getItem('typola-settings') || '{}')).toMatchObject({
      htmlExportPresetId: 'html-custom:wechat-custom',
    });
  });

  it('preserves hidden legacy HTML base presets on existing custom presets', () => {
    localStorage.setItem('typola-settings', JSON.stringify({
      customHtmlExportPresets: {
        'html-custom:legacy-base': {
          id: 'html-custom:legacy-base',
          name: '旧 base 样式',
          description: '旧 base 自定义 CSS',
          css: '.typola-html-article p { color: rgb(1, 2, 3); }',
          source: 'user',
          kind: 'custom',
          base: 'html-dacheng',
        },
      },
    }));

    expect(getSettings().customHtmlExportPresets['html-custom:legacy-base']?.base).toBe('html-dacheng');
  });

  it('filters disabled HTML export presets and falls back when the current preset is disabled', () => {
    setHtmlExportPreset('html-ai');

    setHtmlExportPresetEnabled('html-ai', false);

    expect(getHtmlExportPreset()).not.toBe('html-ai');
    expect(getSettings().disabledHtmlExportPresetIds).toContain('html-ai');
    expect(listEnabledHtmlExportPresets().map((preset) => preset.id)).not.toContain('html-ai');
  });

  it('keeps at least one enabled HTML export preset when all built-ins are disabled', () => {
    updateSettings({
      disabledHtmlExportPresetIds: [
        'html-wechat-style',
        'html-ai',
        'html-ip',
      ],
    });

    expect(getHtmlExportPreset()).toBe('html-wechat-style');
    expect(getSettings().disabledHtmlExportPresetIds).not.toContain('html-wechat-style');
    expect(listEnabledHtmlExportPresets()).toHaveLength(1);
  });

  it('limits users to eight custom HTML export preset slots', () => {
    const presets = Array.from({ length: 9 }, (_, index) => customHtmlPreset(`team-${index}`, `团队 HTML ${index}`));

    presets.slice(0, 8).forEach((preset) => addCustomHtmlExportPreset(preset.id, preset.preset));

    expect(() => addCustomHtmlExportPreset(presets[8].id, presets[8].preset)).toThrow(
      CUSTOM_HTML_EXPORT_PRESET_LIMIT_MESSAGE,
    );
    expect(Object.keys(getSettings().customHtmlExportPresets)).toHaveLength(8);
    expect(getHtmlExportPreset()).toBe('html-custom:team-7');
  });

  it('activates beta license codes and raises Word and HTML custom slot limits', () => {
    const firstWord = customPreset('licensed-word-a', '授权模板 A');
    const secondWord = customPreset('licensed-word-b', '授权模板 B');
    const thirdWord = customPreset('licensed-word-c', '授权模板 C');
    const firstHtml = customHtmlPreset('licensed-html-a', '授权 HTML A');
    const secondHtml = customHtmlPreset('licensed-html-b', '授权 HTML B');
    const thirdHtml = customHtmlPreset('licensed-html-c', '授权 HTML C');

    addCustomExportPreset(firstWord.id, firstWord.config);
    addCustomExportPreset(secondWord.id, secondWord.config);
    addCustomHtmlExportPreset(firstHtml.id, firstHtml.preset);
    addCustomHtmlExportPreset(secondHtml.id, secondHtml.preset);

    expect(getCustomExportPresetLimit()).toBe(8);
    expect(getCustomHtmlExportPresetLimit()).toBe(8);
    expect(canAddCustomExportPreset(thirdWord.id)).toBe(true);
    expect(canAddCustomHtmlExportPreset(thirdHtml.id)).toBe(true);

    const result = activateLicenseCode('TYPOLA-BETA-2026');

    expect(result.ok).toBe(true);
    expect(getSettings().license).toMatchObject({
      status: 'active',
      plan: 'beta',
      codeLabel: 'TYPOLA-BETA-2026',
      customExportPresetLimit: 8,
      customHtmlExportPresetLimit: 8,
    });
    expect(getCustomExportPresetLimit()).toBe(8);
    expect(getCustomHtmlExportPresetLimit()).toBe(8);
    expect(canAddCustomExportPreset(thirdWord.id)).toBe(true);
    expect(canAddCustomHtmlExportPreset(thirdHtml.id)).toBe(true);

    addCustomExportPreset(thirdWord.id, thirdWord.config);
    addCustomHtmlExportPreset(thirdHtml.id, thirdHtml.preset);

    expect(getSettings().customExportPresets[thirdWord.id]).toBeDefined();
    expect(getSettings().customHtmlExportPresets[thirdHtml.id]).toBeDefined();
  });

  it('rejects invalid beta license codes without changing slot limits', () => {
    const result = activateLicenseCode('bad-code');

    expect(result.ok).toBe(false);
    expect(result.message).toBe('扩展码无效，请检查后重新输入。');
    expect(getSettings().license.status).toBe('inactive');
    expect(getCustomExportPresetLimit()).toBe(8);
    expect(getCustomHtmlExportPresetLimit()).toBe(8);
  });

  it('clears beta license state and returns to standard slot limits', () => {
    activateLicenseCode('TYPOLA-BETA-2026');

    clearLicense();

    expect(getSettings().license.status).toBe('inactive');
    expect(getCustomExportPresetLimit()).toBe(8);
    expect(getCustomHtmlExportPresetLimit()).toBe(8);
  });

  it('normalizes tampered beta license state back to the known local beta limits', () => {
    localStorage.setItem('typola-settings', JSON.stringify({
      license: {
        status: 'active',
        plan: 'beta',
        codeLabel: 'TYPOLA-BETA-2026',
        customExportPresetLimit: 999,
        customHtmlExportPresetLimit: 999,
      },
    }));

    expect(getSettings().license).toMatchObject({
      status: 'active',
      customExportPresetLimit: 8,
      customHtmlExportPresetLimit: 8,
    });
    expect(getCustomExportPresetLimit()).toBe(8);
    expect(getCustomHtmlExportPresetLimit()).toBe(8);
  });

  it('rejects persisted active beta license states with unknown code labels', () => {
    localStorage.setItem('typola-settings', JSON.stringify({
      license: {
        status: 'active',
        plan: 'beta',
        codeLabel: 'UNKNOWN-BETA-CODE',
        customExportPresetLimit: 8,
        customHtmlExportPresetLimit: 8,
      },
    }));

    expect(getSettings().license.status).toBe('inactive');
    expect(getCustomExportPresetLimit()).toBe(8);
    expect(getCustomHtmlExportPresetLimit()).toBe(8);
  });

  it('removes custom HTML presets and falls back to the default built-in preset', () => {
    const imported = customHtmlPreset('brief', '团队 HTML');

    addCustomHtmlExportPreset(imported.id, imported.preset);
    removeCustomHtmlExportPreset(imported.id);

    expect(getHtmlExportPreset()).toBe('html-wechat-style');
    expect(getSettings().customHtmlExportPresets['html-custom:brief']).toBeUndefined();
  });

  it('normalizes non-string WeChat custom CSS from persisted settings', () => {
    localStorage.setItem('typola-settings', JSON.stringify({
      wechatCustomCss: { css: 'bad' },
    }));

    expect(getSettings().wechatCustomCss).toBe('');
  });

  it('persists automatic update check preference while defaulting to enabled', () => {
    expect(getSettings().autoUpdateCheck).toBe(true);

    localStorage.setItem('typola-settings', JSON.stringify({
      autoUpdateCheck: false,
      exportPresetId: 'report',
    }));

    expect(getSettings()).toMatchObject({
      autoUpdateCheck: false,
      exportPresetId: 'report',
    });

    updateSettings({ autoUpdateCheck: true });

    expect(getSettings().autoUpdateCheck).toBe(true);
  });

  it('does not include the service plan preset in the default built-in list', () => {
    const presets = listPresets();

    expect(presets.map((preset) => preset.id)).toEqual(['legal', 'academic', 'report', 'minimal']);
    expect(presets.map((preset) => preset.name)).not.toContain('法律服务方案');
    expect(getSettings().exportPresetId).toBe('minimal');
  });

  it('filters disabled presets and falls back when the current preset is disabled', () => {
    setExportPreset('academic');

    setExportPresetEnabled('academic', false);

    expect(getExportPreset()).not.toBe('academic');
    expect(getSettings().disabledExportPresetIds).toContain('academic');
    expect(listEnabledExportPresets().map((preset) => preset.id)).not.toContain('academic');
  });

  it('keeps at least one enabled preset when all presets are disabled', () => {
    updateSettings({
      disabledExportPresetIds: ['legal', 'academic', 'report', 'minimal'],
    });

    expect(getExportPreset()).toBe('minimal');
    expect(getSettings().disabledExportPresetIds).not.toContain('minimal');
    expect(listEnabledExportPresets()).toHaveLength(1);
  });

  it('stores custom export presets and falls back when one is removed', () => {
    const imported = importPresetFromJson(JSON.stringify({
      id: 'court-brief',
      name: '庭审提纲',
      description: '庭审提纲导出样式',
      base: 'legal',
      config: {
        fonts: { default: { name: '宋体', ascii: 'Times New Roman', size: 11 } },
      },
    }));

    addCustomExportPreset(imported.id, imported.config);

    expect(getExportPreset()).toBe('custom:court-brief');
    expect(getExportPresetConfig().name).toBe('庭审提纲');
    expect(getSettings().customExportPresets['custom:court-brief'].fonts.default.size).toBe(11);

    removeCustomExportPreset('custom:court-brief');

    expect(getExportPreset()).toBe('minimal');
    expect(getSettings().customExportPresets['custom:court-brief']).toBeUndefined();
  });

  it('limits users to eight custom export preset slots', () => {
    const presets = Array.from({ length: 9 }, (_, index) => customPreset(`team-${index}`, `团队模板 ${index}`));

    presets.slice(0, 8).forEach((preset) => addCustomExportPreset(preset.id, preset.config));

    expect(() => addCustomExportPreset(presets[8].id, presets[8].config)).toThrow(CUSTOM_EXPORT_PRESET_LIMIT_MESSAGE);
    expect(Object.keys(getSettings().customExportPresets)).toHaveLength(8);
    expect(getExportPreset()).toBe('custom:team-7');
  });

  it('keeps historical over-limit custom presets readable but blocks new slots', () => {
    const historical = Array.from({ length: 9 }, (_, index) => (
      customPreset(`history-${index}`, `历史模板 ${index}`)
    ));
    const next = customPreset('history-next', '历史模板 Next');
    const customExportPresets = Object.fromEntries(
      historical.map((preset) => [preset.id, preset.config]),
    ) as Record<CustomPresetId, PresetConfig>;

    localStorage.setItem('typola-settings', JSON.stringify({
      exportPresetId: historical[8].id,
      customExportPresets,
    }));

    expect(Object.keys(getSettings().customExportPresets)).toHaveLength(9);
    expect(getExportPreset()).toBe(historical[8].id);
    expect(listPresets(getSettings().customExportPresets).map((preset) => preset.id)).toContain(historical[8].id);

    expect(() => addCustomExportPreset(next.id, next.config)).toThrow(CUSTOM_EXPORT_PRESET_LIMIT_MESSAGE);
    expect(Object.keys(getSettings().customExportPresets)).toHaveLength(9);
  });

  it('removes custom presets and hides built-in presets through a unified remove action', () => {
    const imported = importPresetFromJson(JSON.stringify({
      id: 'team-brief',
      name: '团队模板',
      description: '团队统一导出样式',
      base: 'legal',
      config: {
        fonts: { default: { name: '宋体', ascii: 'Times New Roman', size: 11 } },
      },
    }));

    addCustomExportPreset(imported.id, imported.config);
    removeExportPreset('custom:team-brief');
    removeExportPreset('report');

    expect(getSettings().customExportPresets['custom:team-brief']).toBeUndefined();
    expect(getSettings().disabledExportPresetIds).toContain('report');
    expect(listEnabledExportPresets().map((preset) => preset.id)).not.toContain('report');
  });
});

describe('workspace root persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns an empty string when nothing is persisted', () => {
    expect(getLastWorkspaceRoot()).toBe('');
  });

  it('round-trips a workspace root through localStorage', () => {
    setLastWorkspaceRoot('D:/work/project');
    expect(getLastWorkspaceRoot()).toBe('D:/work/project');
  });

  it('clears the stored value when given an empty string', () => {
    setLastWorkspaceRoot('D:/work/project');
    setLastWorkspaceRoot('   ');
    expect(getLastWorkspaceRoot()).toBe('');
    expect(localStorage.getItem('typola-last-workspace-root')).toBeNull();
  });

  it('trims surrounding whitespace', () => {
    setLastWorkspaceRoot('  D:/work/project  ');
    expect(getLastWorkspaceRoot()).toBe('D:/work/project');
  });
});
