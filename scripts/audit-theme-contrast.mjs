#!/usr/bin/env node
import { loadThemeDefinitionsForChecks } from './theme-css-builder.mjs';

function parseHex(value) {
  const hex = value.replace(/^#/, '');
  if (!/^(?:[\da-f]{3}|[\da-f]{6})$/i.test(hex)) return null;
  const normalized = hex.length === 3 ? hex.replace(/./g, (char) => char + char) : hex;
  return [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255);
}

function relativeLuminance(color) {
  const rgb = parseHex(color);
  if (!rgb) return null;
  const linear = rgb.map((channel) => channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  if (foregroundLuminance === null || backgroundLuminance === null) return null;
  const [low, high] = [foregroundLuminance, backgroundLuminance].sort((a, b) => a - b);
  return (high + 0.05) / (low + 0.05);
}

const checks = [
  ['text-primary / paper', 'textPrimary', 7],
  ['text-primary / canvas', 'textPrimary', 7],
  ['text-secondary / paper', 'textSecondary', 4.5],
  ['text-secondary / canvas', 'textSecondary', 4.5],
  ['accent / paper', 'accent', 3],
  ['success / paper', 'success', 3],
  ['danger / paper', 'danger', 3],
  ['warning / paper', 'warning', 3],
];

const themes = await loadThemeDefinitionsForChecks();
const failures = [];
for (const theme of themes) {
  for (const [label, foregroundToken, minimum] of checks) {
    const backgroundToken = label.endsWith('/ canvas') ? 'canvas' : 'paper';
    const ratio = contrastRatio(theme.core[foregroundToken], theme.core[backgroundToken]);
    if (ratio === null) {
      failures.push(`${theme.id}: ${label} uses non-hex color`);
    } else if (ratio < minimum) {
      failures.push(`${theme.id}: ${label} ${ratio.toFixed(2)} < ${minimum}`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`Theme contrast audit passed (${themes.length} themes, ${themes.length * checks.length} checks).`);
