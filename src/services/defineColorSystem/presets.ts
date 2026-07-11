import { HEAVY_SWATCHES, LIGHT_SWATCHES, WHEEL_SWATCHES } from './constants';
import type { OklchColor } from './types';

export type DefinePreset = { name: string; colors: readonly OklchColor[] };

export function normalizeHue(value: number): number {
  const result = value % 360;
  return result < 0 ? result + 360 : result;
}

export function pointAtAngle(angle: number, radius: number, cx: number, cy: number) {
  const rad = angle * Math.PI / 180;
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
}

export function colorAtHue(hue: number, colors: readonly OklchColor[] = WHEEL_SWATCHES): OklchColor {
  const position = normalizeHue(hue) / (360 / colors.length);
  const currentIndex = Math.floor(position) % colors.length;
  const nextIndex = (currentIndex + 1) % colors.length;
  const progress = position - Math.floor(position);
  const current = colors[currentIndex];
  const next = colors[nextIndex];
  let h = current.h + (next.h - current.h) * progress;
  if (Math.abs(next.h - current.h) > 180) {
    h = next.h > current.h
      ? current.h + (next.h - 360 - current.h) * progress
      : current.h + (next.h + 360 - current.h) * progress;
  }
  return {
    l: current.l + (next.l - current.l) * progress,
    c: current.c + (next.c - current.c) * progress,
    h: normalizeHue(h),
  };
}

export function gradientColors(hue: number): readonly OklchColor[] {
  return [colorAtHue(hue - 25), colorAtHue(hue), colorAtHue(hue + 25)];
}

function gradientPresets(colors: readonly OklchColor[], name: string): DefinePreset[] {
  return colors.map((color, index) => ({
    name: `${name}-${index + 1}-gradient`,
    colors: [colors[(index - 1 + colors.length) % colors.length], color, colors[(index + 1) % colors.length]],
  }));
}

export function buildDefinePresets(): DefinePreset[] {
  return [
    ...HEAVY_SWATCHES.map((color, index) => ({ name: `heavy-${index + 1}`, colors: [color] })),
    ...LIGHT_SWATCHES.map((color, index) => ({ name: `light-${index + 1}`, colors: [color] })),
    { name: 'gray-heavy', colors: [{ l: .88, c: 0, h: 0 }] },
    { name: 'gray-light', colors: [{ l: .94, c: 0, h: 0 }] },
    ...gradientPresets(HEAVY_SWATCHES, 'heavy'),
    ...gradientPresets(LIGHT_SWATCHES, 'light'),
  ];
}

export const DEFINE_PRESETS = buildDefinePresets();
