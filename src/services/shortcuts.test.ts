import { describe, expect, it } from 'vitest';
import { formatShortcut } from './shortcuts';

describe('formatShortcut', () => {
  it('uses Ctrl notation on Windows', () => {
    expect(formatShortcut('Mod+Shift+S', 'windows')).toBe('Ctrl+Shift+S');
  });

  it('uses compact symbols on macOS', () => {
    expect(formatShortcut('Mod+Alt+P', 'macos')).toBe('⌘⌥P');
  });
});
