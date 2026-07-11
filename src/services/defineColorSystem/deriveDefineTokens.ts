import { DEFINE_PATTERN_URLS } from './patterns';
import { gradientColors, normalizeHue } from './presets';
import type { DefineColorSettings, OklchColor } from './types';

const CHROMA_OFFSETS = [[16.06, .001], [44.64, -.005], [136.69, -.008], [228.22, -.025], [290.02, .047]] as const;
const DARK_HUE_OFFSETS = [[16.06, -.48], [44.64, -.51], [136.69, -.5], [228.22, .83], [290.02, 5.63]] as const;
const LIGHT_HUE_OFFSETS = [[16.06, -3.27], [44.64, 1.76], [136.69, .1], [228.22, -.64], [290.02, -.23]] as const;
const NEUTRAL_HUE_OFFSETS = [[16.06, 1.26], [44.64, -5.2], [136.69, -.37], [228.22, .7], [290.02, 1.94]] as const;
const ALPHAS = [1, 2, 4, 6, 8, 10, 16, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const;

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const toLightness = (value: number, offset: number) => clamp(clamp(value + offset, 0, 100) / 100);

function interpolate(points: readonly (readonly [number, number])[], hue: number): number {
  const normalized = normalizeHue(hue);
  for (let index = 0; index < points.length - 1; index += 1) {
    const [startHue, startValue] = points[index];
    const [endHue, endValue] = points[index + 1];
    if (normalized >= startHue && normalized <= endHue) {
      return startValue + ((normalized - startHue) / (endHue - startHue || 1)) * (endValue - startValue);
    }
  }
  const [lastHue, lastValue] = points[points.length - 1];
  const [firstHue, firstValue] = points[0];
  const distance = firstHue + 360 - lastHue || 1;
  return normalized >= lastHue
    ? lastValue + ((normalized - lastHue) / distance) * (firstValue - lastValue)
    : lastValue + ((normalized + 360 - lastHue) / distance) * (firstValue - lastValue);
}

function format(color: OklchColor, alpha?: number): string {
  const body = `${(100 * color.l).toFixed(2)}% ${color.c.toFixed(3)} ${normalizeHue(color.h).toFixed(2)}`;
  return alpha === undefined ? `oklch(${body})` : `oklch(${body} / ${alpha})`;
}

function derivePalette(base: OklchColor) {
  const l = 100 * clamp(base.l);
  const c = Math.max(0, base.c);
  const h = normalizeHue(base.h);
  return {
    baseHeavy: { l: clamp(base.l), c, h },
    neutralDark: { l: toLightness(l, -62.5), c: Math.max(0, c + interpolate(CHROMA_OFFSETS, h)), h: normalizeHue(h + interpolate(DARK_HUE_OFFSETS, h)) },
    baseLight: { l: toLightness(l, 6), c: Math.max(0, c * .485), h: normalizeHue(h + interpolate(LIGHT_HUE_OFFSETS, h)) },
    neutralLight: { l: toLightness(l, 10), c: Math.max(0, c * .17), h: normalizeHue(h + interpolate(NEUTRAL_HUE_OFFSETS, h)) },
  };
}

export function deriveDefineTokens(settings: DefineColorSettings): Record<string, string> {
  const saturated = { l: settings.l, c: settings.c * settings.saturation / 100, h: settings.h };
  const palette = derivePalette(saturated);
  const loudAlpha = (50 + .46 * settings.opacity) / 100;
  const semanticChroma = clamp(Math.max(.11, saturated.c * 1.2), 0, .18);
  const semantic = (hueOffset: number) => format({ l: .55, c: semanticChroma, h: normalizeHue(saturated.h + hueOffset) });
  const tokens: Record<string, string> = {
    '--dc-base-heavy': format(palette.baseHeavy),
    '--dc-base-heavy-loud': format(palette.baseHeavy, loudAlpha),
    '--dc-base-heavy-strong': format(palette.baseHeavy, .72),
    '--dc-base-heavy-default': format(palette.baseHeavy, .56),
    '--dc-base-heavy-muted': format(palette.baseHeavy, .4),
    '--dc-base-light': format(palette.baseLight),
    '--dc-base-light-loud': format(palette.baseLight, .96),
    '--dc-base-light-strong': format(palette.baseLight, .8),
    '--dc-base-light-default': format(palette.baseLight, .7),
    '--dc-base-light-muted': format(palette.baseLight, .6),
    '--dc-neutral-dark-1000': '#000000', '--dc-neutral-light-1000': '#ffffff',
    '--dc-pattern-image': DEFINE_PATTERN_URLS[settings.pattern],
    '--dc-pattern-opacity': String(settings.patternOpacity / 100),
    '--dc-semantic-danger': semantic(-18),
    '--dc-semantic-warning': semantic(54),
    '--dc-semantic-success': semantic(126),
    '--dc-semantic-info': semantic(210),
  };
  for (const alpha of ALPHAS) {
    tokens[`--dc-neutral-dark-${alpha}`] = format(palette.neutralDark, alpha === 100 ? undefined : alpha / 100);
    tokens[`--dc-neutral-light-${alpha}`] = format(palette.neutralLight, alpha === 100 ? undefined : alpha / 100);
  }
  Object.assign(tokens, {
    '--dc-background-light-shout': 'var(--dc-neutral-light-1000)', '--dc-background-light-loud': 'var(--dc-neutral-light-90)',
    '--dc-background-light-strong': 'var(--dc-neutral-light-80)', '--dc-background-light-default': 'var(--dc-neutral-light-40)',
    '--dc-background-light-muted': 'var(--dc-neutral-light-20)', '--dc-background-light-faint': 'var(--dc-neutral-light-2)',
    '--dc-background-dark-shout': 'var(--dc-neutral-dark-1000)', '--dc-background-dark-loud': 'var(--dc-neutral-dark-20)',
    '--dc-background-dark-strong': 'var(--dc-neutral-dark-8)', '--dc-background-dark-default': 'var(--dc-neutral-dark-6)',
    '--dc-background-dark-muted': 'var(--dc-neutral-dark-4)', '--dc-background-dark-faint': 'var(--dc-neutral-dark-2)',
    '--dc-text-shout': 'var(--dc-neutral-dark-100)', '--dc-text-loud': 'var(--dc-neutral-dark-90)',
    '--dc-text-strong': 'var(--dc-neutral-dark-70)', '--dc-text-default': 'var(--dc-neutral-dark-60)',
    '--dc-text-muted': 'var(--dc-neutral-dark-40)', '--dc-text-faint': 'var(--dc-neutral-dark-30)',
    '--dc-icon-shout': 'var(--dc-neutral-dark-100)', '--dc-icon-loud': 'var(--dc-neutral-dark-80)',
    '--dc-icon-strong': 'var(--dc-neutral-dark-60)', '--dc-icon-default': 'var(--dc-neutral-dark-50)',
    '--dc-icon-muted': 'var(--dc-neutral-dark-30)', '--dc-icon-faint': 'var(--dc-neutral-dark-20)',
    '--dc-border-shout': 'var(--dc-neutral-dark-80)', '--dc-border-loud': 'var(--dc-neutral-dark-10)',
    '--dc-border-strong': 'var(--dc-neutral-dark-8)', '--dc-border-default': 'var(--dc-neutral-dark-6)',
    '--dc-border-muted': 'var(--dc-neutral-dark-4)',
  });
  if (settings.isGradient) {
    const [left, , right] = gradientColors(settings.h).map((color) => ({ ...color, c: color.c * settings.saturation / 100 }));
    tokens['--dc-gradient-stop-1'] = format(left, loudAlpha);
    tokens['--dc-gradient-stop-2'] = format(right, loudAlpha);
  }
  return tokens;
}
