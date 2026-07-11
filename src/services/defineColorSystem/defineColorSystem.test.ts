// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_DEFINE_COLOR_SETTINGS, getSaturationLevel, HEAVY_SWATCHES, nextSaturation } from './constants';
import { applyDefineColorToDocument, clearDefineColorFromDocument } from './applyDefineColorToDocument';
import { deriveDefineTokens } from './deriveDefineTokens';
import { normalizeDefineColorSettings } from './normalizeDefineColorSettings';
import { oklchToRgb } from './oklchToRgb';
import { nextPattern } from './patterns';
import { buildDefinePresets, normalizeHue, pointAtAngle } from './presets';
import { randomizeDefineTheme } from './randomizeDefineTheme';

describe('Define color system', () => {
  beforeEach(() => {
    clearDefineColorFromDocument(document);
    document.documentElement.removeAttribute('style');
    delete document.documentElement.dataset.colorSystem;
  });

  it('normalizes hue and projects fixed-radius points', () => {
    expect(normalizeHue(-25)).toBe(335);
    expect(normalizeHue(385)).toBe(25);
    expect(pointAtAngle(0, 110, 156, 156)).toEqual({ x: 266, y: 156 });
    expect(pointAtAngle(90, 110, 156, 156).y).toBeCloseTo(266);
  });

  it('builds 50 presets in the required order with wrapped gradient neighbors', () => {
    const presets = buildDefinePresets();
    expect(presets).toHaveLength(50);
    expect(presets[0].colors).toEqual([HEAVY_SWATCHES[0]]);
    expect(presets[24].colors[0].c).toBe(0);
    expect(presets[26].colors).toEqual([HEAVY_SWATCHES[11], HEAVY_SWATCHES[0], HEAVY_SWATCHES[1]]);
    expect(presets[49].colors).toHaveLength(3);
  });

  it('cycles through every pattern', () => {
    let pattern = DEFAULT_DEFINE_COLOR_SETTINGS.pattern;
    const sequence = [];
    for (let index = 0; index < 9; index += 1) {
      sequence.push(pattern);
      pattern = nextPattern(pattern);
    }
    expect(sequence).toEqual(['none', 'stripe', 'liquid', 'warp', 'noise', 'starlight', 'dots', 'dots-2', 'define']);
    expect(pattern).toBe('none');
  });

  it('uses balanced saturation by default and cycles the three explicit levels', () => {
    expect(DEFAULT_DEFINE_COLOR_SETTINGS.saturation).toBe(48);
    expect(getSaturationLevel(24)).toBe('soft');
    expect(getSaturationLevel(48)).toBe('balanced');
    expect(getSaturationLevel(72)).toBe('vivid');
    expect([nextSaturation(24), nextSaturation(48), nextSaturation(72)]).toEqual([48, 72, 24]);
  });

  it('randomizes all fields within range and avoids nearby presets', () => {
    const randomized = randomizeDefineTheme({ ...DEFAULT_DEFINE_COLOR_SETTINGS, currentPresetIndex: 20 }, () => .5);
    expect(Math.abs((randomized.currentPresetIndex ?? 20) - 20)).toBeGreaterThan(5);
    expect(randomized.opacity).toBeGreaterThanOrEqual(80);
    expect(randomized.opacity).toBeLessThanOrEqual(100);
    expect([24, 48, 72]).toContain(randomized.saturation);
    expect(randomized.patternOpacity).toBeGreaterThanOrEqual(20);
    expect(randomized.patternOpacity).toBeLessThanOrEqual(50);
  });

  it('derives namespaced Define tokens from the reverse-engineered formula', () => {
    const tokens = deriveDefineTokens(DEFAULT_DEFINE_COLOR_SETTINGS);
    expect(tokens['--dc-base-heavy']).toBe('oklch(100.00% 0.000 0.00)');
    expect(tokens['--dc-neutral-dark-100']).toContain('oklch(');
    expect(tokens['--dc-background-light-default']).toBe('var(--dc-neutral-light-40)');
    expect(Object.keys(tokens).every((token) => token.startsWith('--dc-'))).toBe(true);
  });

  it('starts from white and converts OKLCH colors for the native title bar', () => {
    expect(DEFAULT_DEFINE_COLOR_SETTINGS).toMatchObject({ l: 1, c: 0, h: 0 });
    expect(oklchToRgb(DEFAULT_DEFINE_COLOR_SETTINGS)).toEqual({ red: 255, green: 255, blue: 255 });
    expect(oklchToRgb({ l: 0, c: 0, h: 0 })).toEqual({ red: 0, green: 0, blue: 0 });
  });

  it('writes gradient tokens and removes them after switching to solid', () => {
    applyDefineColorToDocument(document, { ...DEFAULT_DEFINE_COLOR_SETTINGS, isGradient: true });
    expect(document.documentElement.style.getPropertyValue('--dc-gradient-stop-1')).toContain('oklch(');
    applyDefineColorToDocument(document, DEFAULT_DEFINE_COLOR_SETTINGS);
    expect(document.documentElement.style.getPropertyValue('--dc-gradient-stop-1')).toBe('');
    expect(document.documentElement.dataset.colorSystem).toBe('define-color');
  });

  it('defensively normalizes dirty persisted settings', () => {
    expect(normalizeDefineColorSettings({
      l: 4,
      c: -2,
      h: 900,
      opacity: -1,
      saturation: 120,
      pattern: 'invalid',
      patternOpacity: Number.NaN,
      currentPresetIndex: 99,
    })).toEqual({
      ...DEFAULT_DEFINE_COLOR_SETTINGS,
      l: 1,
      c: 0,
      h: 360,
      opacity: 0,
      saturation: 100,
    });
  });

  it('migrates the previous three saturation levels to the softer scale', () => {
    expect(normalizeDefineColorSettings({ version: 1, saturation: 35 }).saturation).toBe(24);
    expect(normalizeDefineColorSettings({ version: 1, saturation: 70 }).saturation).toBe(48);
    expect(normalizeDefineColorSettings({ version: 1, saturation: 100 }).saturation).toBe(72);
  });
});
