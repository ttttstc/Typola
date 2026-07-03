// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { applyThemeToDocument } from './themeDom';

describe('themeDom', () => {
  it('applies the selected theme id and color scheme to the document root', () => {
    applyThemeToDocument(document, 'night-current');

    expect(document.documentElement.dataset.themeId).toBe('night-current');
    expect(document.documentElement.dataset.colorScheme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('falls back to Plain Paper for unknown theme ids', () => {
    applyThemeToDocument(document, 'dark');

    expect(document.documentElement.dataset.themeId).toBe('plain-paper');
    expect(document.documentElement.dataset.colorScheme).toBe('light');
  });
});
