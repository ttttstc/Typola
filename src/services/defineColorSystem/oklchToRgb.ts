import type { OklchColor } from './types';

export type RgbColor = { red: number; green: number; blue: number };

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const gamma = (value: number) => value <= .0031308
  ? 12.92 * value
  : 1.055 * Math.pow(value, 1 / 2.4) - .055;

export function oklchToRgb(color: OklchColor): RgbColor {
  const radians = color.h * Math.PI / 180;
  const a = color.c * Math.cos(radians);
  const b = color.c * Math.sin(radians);
  const l = Math.pow(color.l + .3963377774 * a + .2158037573 * b, 3);
  const m = Math.pow(color.l - .1055613458 * a - .0638541728 * b, 3);
  const s = Math.pow(color.l - .0894841775 * a - 1.291485548 * b, 3);

  return {
    red: Math.round(255 * clamp(gamma(4.0767416621 * l - 3.3077115913 * m + .2309699292 * s))),
    green: Math.round(255 * clamp(gamma(-1.2684380046 * l + 2.6097574011 * m - .3413193965 * s))),
    blue: Math.round(255 * clamp(gamma(-.0041960863 * l - .7034186147 * m + 1.707614701 * s))),
  };
}
