import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THEME_ID,
  deriveTokens,
  getThemeDefinition,
  listThemeDefinitions,
  normalizeThemeId,
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
    expect(tokens.ai.deletedBg).toContain(theme.core.aiDeleted);
    expect(tokens.ai.reviewMarkBgStrong).toBeDefined();
  });
});
