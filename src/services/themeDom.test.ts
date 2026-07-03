// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyThemeToDocument, THEME_TRANSITION_DURATION_MS } from './themeDom';

describe('themeDom', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.documentElement.removeAttribute('data-theme-id');
    document.documentElement.removeAttribute('data-color-scheme');
    document.documentElement.removeAttribute('data-theme-transition');
    document.documentElement.style.colorScheme = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('applies the selected theme id and color scheme to the document root', () => {
    applyThemeToDocument(document, 'night-current');

    expect(document.documentElement.dataset.themeId).toBe('night-current');
    expect(document.documentElement.dataset.colorScheme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(document.documentElement.dataset.themeTransition).toBeUndefined();
  });

  it('falls back to Plain Paper for unknown theme ids', () => {
    applyThemeToDocument(document, 'dark');

    expect(document.documentElement.dataset.themeId).toBe('plain-paper');
    expect(document.documentElement.dataset.colorScheme).toBe('light');
  });

  it('marks real theme switches as transitions and removes the marker after 260ms', () => {
    applyThemeToDocument(document, 'plain-paper');
    applyThemeToDocument(document, 'night-current');

    expect(document.documentElement.dataset.themeTransition).toBe('true');

    vi.advanceTimersByTime(THEME_TRANSITION_DURATION_MS - 1);
    expect(document.documentElement.dataset.themeTransition).toBe('true');

    vi.advanceTimersByTime(1);
    expect(document.documentElement.dataset.themeTransition).toBeUndefined();
  });
});
