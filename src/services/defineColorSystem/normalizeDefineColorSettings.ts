import { DEFAULT_DEFINE_COLOR_SETTINGS, DEFINE_PATTERN_ORDER } from './constants';
import type { DefineColorSettings, DefinePattern } from './types';

const clamp = (value: unknown, min: number, max: number, fallback: number) => (
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
);

export function normalizeDefineColorSettings(value: unknown): DefineColorSettings {
  const input = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<DefineColorSettings>
    : {};
  const pattern = DEFINE_PATTERN_ORDER.includes(input.pattern as DefinePattern)
    ? input.pattern as DefinePattern
    : DEFAULT_DEFINE_COLOR_SETTINGS.pattern;
  const preset = typeof input.currentPresetIndex === 'number'
    && Number.isInteger(input.currentPresetIndex)
    && input.currentPresetIndex >= 0
    && input.currentPresetIndex < 50
    ? input.currentPresetIndex
    : null;
  const rawSaturation = clamp(input.saturation, 0, 100, DEFAULT_DEFINE_COLOR_SETTINGS.saturation);
  const saturation = input.version === 1
    ? rawSaturation < 53 ? 24 : rawSaturation < 85 ? 48 : 72
    : rawSaturation;
  return {
    version: 2,
    l: clamp(input.l, 0, 1, DEFAULT_DEFINE_COLOR_SETTINGS.l),
    c: clamp(input.c, 0, 1, DEFAULT_DEFINE_COLOR_SETTINGS.c),
    h: clamp(input.h, 0, 360, DEFAULT_DEFINE_COLOR_SETTINGS.h),
    isGradient: input.isGradient === true,
    opacity: clamp(input.opacity, 0, 100, DEFAULT_DEFINE_COLOR_SETTINGS.opacity),
    saturation,
    pattern,
    patternOpacity: clamp(input.patternOpacity, 0, 100, DEFAULT_DEFINE_COLOR_SETTINGS.patternOpacity),
    currentPresetIndex: preset,
  };
}
