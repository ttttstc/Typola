// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { DEFAULT_DEFINE_COLOR_SETTINGS } from './defineColorSystem/constants';
import { applyAppearanceToDocument } from './appearanceDom';
import type { AppSettings } from './settingsService';

const baseSettings = {
  appearanceColorSystem: 'define-color',
  defineColorSettings: DEFAULT_DEFINE_COLOR_SETTINGS,
  themeId: 'plain-paper',
} as AppSettings;

describe('applyAppearanceToDocument', () => {
  it('uses Plain Paper until a custom color has been selected', () => {
    applyAppearanceToDocument(document, baseSettings);

    expect(document.documentElement.dataset.colorSystem).toBe('static-theme');
    expect(document.documentElement.dataset.themeId).toBe('plain-paper');
  });

  it('uses the define-color system after a color is selected', () => {
    applyAppearanceToDocument(document, {
      ...baseSettings,
      defineColorSettings: { ...DEFAULT_DEFINE_COLOR_SETTINGS, c: .075, h: 228 },
    });

    expect(document.documentElement.dataset.colorSystem).toBe('define-color');
    expect(document.documentElement.style.getPropertyValue('--dc-base-heavy')).not.toBe('');
  });
});
