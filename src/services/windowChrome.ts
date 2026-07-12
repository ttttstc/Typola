import { oklchToRgb, type RgbColor } from './defineColorSystem/oklchToRgb';
import type { DefineColorSettings } from './defineColorSystem/types';

let pending: RgbColor | null = null;
let timer: number | null = null;

async function flushTitleBarColor() {
  timer = null;
  const color = pending;
  pending = null;
  if (!color) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('set_title_bar_color', color);
  } catch {
    // Browser preview and older desktop builds have no native title-bar command.
  }
  if (pending) scheduleTitleBarColor(pending);
}

export function scheduleTitleBarColor(color: RgbColor): void {
  const internals = typeof window === 'undefined'
    ? undefined
    : (window as Window & { __TAURI_INTERNALS__?: { invoke?: unknown } }).__TAURI_INTERNALS__;
  if (typeof internals?.invoke !== 'function') return;
  pending = color;
  if (timer !== null) return;
  timer = window.setTimeout(flushTitleBarColor, 32);
}

export function syncDefineTitleBarColor(settings: DefineColorSettings): void {
  scheduleTitleBarColor(oklchToRgb({
    l: settings.l,
    c: settings.c * settings.saturation / 100,
    h: settings.h,
  }));
}

export function syncThemeTitleBarColor(targetDocument: Document): void {
  const value = getComputedStyle(targetDocument.documentElement).getPropertyValue('--theme-canvas').trim();
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(value);
  if (!match) return;
  scheduleTitleBarColor({
    red: Number.parseInt(match[1], 16),
    green: Number.parseInt(match[2], 16),
    blue: Number.parseInt(match[3], 16),
  });
}
