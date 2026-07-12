import type { DefineColorSettings, DefinePattern, OklchColor } from './types';

export const DEFAULT_DEFINE_COLOR_SETTINGS: DefineColorSettings = {
  version: 2,
  l: 1,
  c: 0,
  h: 0,
  isGradient: false,
  opacity: 100,
  saturation: 48,
  pattern: 'none',
  patternOpacity: 100,
  currentPresetIndex: null,
};

export function hasDefineColorSelection(settings: DefineColorSettings): boolean {
  return settings.currentPresetIndex !== null || settings.c > 0;
}

export const HEAVY_SWATCHES = [
  { l: .8798, c: .064, h: 16.06 }, { l: .8799, c: .068, h: 44.64 },
  { l: .8799, c: .080, h: 76.32 }, { l: .8806, c: .085, h: 106.56 },
  { l: .8800, c: .084, h: 136.69 }, { l: .8801, c: .085, h: 167.17 },
  { l: .8788, c: .090, h: 196.51 }, { l: .8802, c: .075, h: 228.22 },
  { l: .8793, c: .059, h: 258.66 }, { l: .8795, c: .063, h: 290.02 },
  { l: .8809, c: .075, h: 319.96 }, { l: .8803, c: .075, h: 350.54 },
] as const satisfies readonly OklchColor[];

export const LIGHT_SWATCHES = [
  { l: .9392, c: .0310, h: 12.79 }, { l: .9398, c: .0330, h: 46.40 },
  { l: .9393, c: .0495, h: 75.02 }, { l: .9397, c: .0750, h: 106.10 },
  { l: .9385, c: .0740, h: 136.79 }, { l: .9400, c: .0700, h: 167.73 },
  { l: .9391, c: .0550, h: 198.23 }, { l: .9408, c: .0350, h: 227.58 },
  { l: .9398, c: .0290, h: 259.59 }, { l: .9394, c: .0310, h: 289.79 },
  { l: .9399, c: .0460, h: 319.22 }, { l: .9399, c: .0350, h: 350.86 },
] as const satisfies readonly OklchColor[];

export const WHEEL_SWATCHES = [
  { l: .88, c: .075, h: 15.66 }, { l: .88, c: .08, h: 44.41 },
  { l: .88, c: .08, h: 76.39 }, { l: .88, c: .085, h: 106.53 },
  { l: .88, c: .085, h: 136.51 }, { l: .88, c: .085, h: 167.48 },
  { l: .88, c: .09, h: 196.52 }, { l: .88, c: .075, h: 228.06 },
  { l: .88, c: .065, h: 258.69 }, { l: .88, c: .065, h: 289.54 },
  { l: .88, c: .095, h: 319.88 }, { l: .88, c: .09, h: 350.12 },
] as const satisfies readonly OklchColor[];

export const DEFINE_PATTERN_ORDER = [
  'none', 'stripe', 'liquid', 'warp', 'noise', 'starlight', 'dots', 'dots-2', 'define',
] as const satisfies readonly DefinePattern[];

export const GRADIENT_OFFSET_DEG = 25;
export const WHEEL_RADIUS = 110;

export const DEFINE_SATURATION_LEVELS = [24, 48, 72] as const;
export type DefineSaturationLevel = 'soft' | 'balanced' | 'vivid';

export function getSaturationLevel(value: number): DefineSaturationLevel {
  if (value < 36) return 'soft';
  if (value < 60) return 'balanced';
  return 'vivid';
}

export function nextSaturation(value: number): number {
  const current = getSaturationLevel(value);
  return current === 'soft' ? 48 : current === 'balanced' ? 72 : 24;
}

export function previousSaturation(value: number): number {
  const current = getSaturationLevel(value);
  return current === 'soft' ? 72 : current === 'balanced' ? 24 : 48;
}
