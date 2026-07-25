export type ShortcutPlatform = 'macos' | 'windows' | 'linux';

function currentPlatform(): ShortcutPlatform {
  if (typeof document !== 'undefined') {
    const platform = document.documentElement.dataset.platform;
    if (platform === 'macos' || platform === 'windows' || platform === 'linux') return platform;
  }
  if (typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)) return 'macos';
  return 'windows';
}

const MAC_KEYS: Record<string, string> = {
  Mod: '⌘',
  Alt: '⌥',
  Shift: '⇧',
  Enter: '↵',
};

export function formatShortcut(shortcut: string, platform = currentPlatform()): string {
  const keys = shortcut.split('+');
  if (platform === 'macos') {
    return keys.map((key) => MAC_KEYS[key] ?? key.toUpperCase()).join('');
  }
  return keys.map((key) => key === 'Mod' ? 'Ctrl' : key).join('+');
}
