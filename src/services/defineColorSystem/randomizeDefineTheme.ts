import { DEFINE_PATTERN_ORDER, DEFINE_SATURATION_LEVELS } from './constants';
import { DEFINE_PRESETS } from './presets';
import type { DefineColorSettings } from './types';

const randomInt = (min: number, max: number, random: () => number) => min + Math.floor((max - min + 1) * random());

export function randomizeDefineTheme(
  current: DefineColorSettings,
  random: () => number = Math.random,
): DefineColorSettings {
  let candidates = DEFINE_PRESETS.map((_, index) => index).filter((index) => (
    index !== current.currentPresetIndex
      && (current.currentPresetIndex === null || Math.abs(index - current.currentPresetIndex) > 5)
  ));
  if (candidates.length === 0) {
    candidates = DEFINE_PRESETS.map((_, index) => index).filter((index) => index !== current.currentPresetIndex);
  }
  const presetIndex = candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
  const preset = DEFINE_PRESETS[presetIndex];
  const isGradient = preset.colors.length > 1;
  const color = preset.colors[isGradient ? 1 : 0];
  return {
    ...current,
    ...color,
    isGradient,
    opacity: randomInt(80, 100, random),
    saturation: DEFINE_SATURATION_LEVELS[Math.min(DEFINE_SATURATION_LEVELS.length - 1, Math.floor(random() * DEFINE_SATURATION_LEVELS.length))],
    pattern: DEFINE_PATTERN_ORDER[Math.min(DEFINE_PATTERN_ORDER.length - 1, Math.floor(random() * DEFINE_PATTERN_ORDER.length))],
    patternOpacity: randomInt(20, 50, random),
    currentPresetIndex: presetIndex,
  };
}
