import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

type MotionProviderProps = {
  children: ReactNode;
};

/**
 * Reads a duration CSS custom property once at module load so the JS-side motion
 * timing and the CSS-side `--motion-*` tokens never drift. Falls back to the
 * hardcoded baseline when no DOM / stylesheet is available (Vitest, SSR).
 *
 * Single source of truth: `src/styles/app.css` `--motion-duration-base`.
 * Update the hardcoded fallback if you change the CSS variable.
 */
function readMotionDurationMs(name: string, fallbackMs: number): number {
  if (typeof document === 'undefined') return fallbackMs;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const match = raw.match(/^(\d+(?:\.\d+)?)(ms|s)?$/);
  if (!match) return fallbackMs;
  const value = parseFloat(match[1]);
  return match[2] === 's' ? value * 1000 : value;
}

const baseDurationSec = readMotionDurationMs('--motion-duration-base', 180) / 1000;

export const calmTransition = {
  duration: baseDurationSec,
  ease: [0.2, 0, 0.1, 1] as const,
};

/**
 * Centralizes Typola's motion defaults so future animated surfaces share the
 * same calm timing and automatically respect the user's reduced-motion setting.
 */
export function MotionProvider({ children }: MotionProviderProps) {
  return (
    <MotionConfig reducedMotion="user" transition={calmTransition}>
      {children}
    </MotionConfig>
  );
}