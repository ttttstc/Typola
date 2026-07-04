import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THEME_ID,
  deriveTokens,
  getMermaidTheme,
  getThemeDefinition,
  getVditorHighlightStyle,
  getVditorPreviewTheme,
  listThemeDefinitions,
  normalizeThemeId,
  resolveTerminalTheme,
} from './themeRegistry';

describe('themeRegistry', () => {
  it('ships the three complete built-in themes with Plain Paper as the default', () => {
    const themes = listThemeDefinitions();

    expect(DEFAULT_THEME_ID).toBe('plain-paper');
    expect(themes.map((theme) => theme.id)).toEqual([
      'plain-paper',
      'night-current',
      'ink-basin',
    ]);
    expect(themes.map((theme) => theme.scheme)).toEqual(['light', 'dark', 'light']);
  });

  it('falls back to the default theme for unknown persisted values', () => {
    expect(normalizeThemeId('ink-basin')).toBe('ink-basin');
    expect(normalizeThemeId('dark')).toBe('plain-paper');
    expect(normalizeThemeId(undefined)).toBe('plain-paper');
  });

  it('derives editor, markdown, terminal, and AI tokens from a core theme', () => {
    const theme = getThemeDefinition('night-current');
    const tokens = deriveTokens(theme.core, theme.overrides);

    expect(tokens.editor.caret).toBe(theme.core.accent);
    expect(tokens.markdown.link).toBe(theme.core.accent);
    expect(tokens.terminal.background).toBe(theme.overrides?.terminal?.background);
    expect(tokens.terminal.brightBlue).toBe('#91bef0');
    expect(tokens.ai.deletedBg).toContain(theme.core.aiDeleted);
    expect(tokens.ai.reviewMarkBgStrong).toBeDefined();
  });

  it('centralizes host integration themes derived from the selected theme id', () => {
    expect(getMermaidTheme('night-current')).toBe('dark');
    expect(getMermaidTheme('plain-paper')).toBe('default');
    expect(getVditorPreviewTheme('night-current')).toBe('dark');
    expect(getVditorHighlightStyle('night-current')).toBe('github-dark');
    expect(resolveTerminalTheme('night-current')).toMatchObject({
      background: '#101821',
      brightWhite: '#f2f6f8',
    });
  });
});
