import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

type MotionProviderProps = {
  children: ReactNode;
};

export const calmTransition = {
  duration: 0.22,
  ease: [0.2, 0, 0.1, 1] as const,
};

export const calmSpring = {
  type: 'spring',
  stiffness: 420,
  damping: 36,
  mass: 0.8,
} as const;

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
