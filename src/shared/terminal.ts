export type TerminalCursorStyle = 'block' | 'bar' | 'underline';
export type TerminalShortcutPreset = 'windows' | 'linux';

export interface TerminalSettings {
  shellPath: string;
  fontFamily: string;
  fontSize: number;
  cursorStyle: TerminalCursorStyle;
  cursorBlink: boolean;
  shortcutPreset: TerminalShortcutPreset;
  confirmMultilinePaste: boolean;
}

export interface TerminalCreateRequest {
  cwd?: string | null;
  shell?: string | null;
  cols?: number;
  rows?: number;
}

export interface TerminalCreateResult {
  termId: number;
  cwd: string;
  shellPath: string;
  processName: string;
}

export interface TerminalWriteRequest {
  termId: number;
  data: string;
}

export interface TerminalResizeRequest {
  termId: number;
  cols: number;
  rows: number;
}

export interface TerminalExitPayload {
  exitCode: number;
  signal?: number;
}

export const DEFAULT_TERMINAL_HEIGHT = 300;
export const MIN_TERMINAL_HEIGHT = 160;
export const MAX_TERMINAL_FONT_SIZE = 20;
export const MIN_TERMINAL_FONT_SIZE = 11;

export const DEFAULT_TERMINAL_SETTINGS: TerminalSettings = {
  shellPath: '',
  fontFamily: 'Consolas, "Cascadia Mono", "SFMono-Regular", Menlo, monospace',
  fontSize: 13,
  cursorStyle: 'block',
  cursorBlink: true,
  shortcutPreset: 'windows',
  confirmMultilinePaste: true,
};

function basename(input: string) {
  const normalized = input.replace(/[\\/]+$/, '');
  const parts = normalized.split(/[\\/]/);
  return parts[parts.length - 1] || normalized;
}

export function getShellDisplayName(shellPath: string | null | undefined) {
  if (!shellPath) {
    return 'Terminal';
  }

  return basename(shellPath);
}

export function getTerminalTabTitle(cwd: string | null | undefined, shellPath: string | null | undefined) {
  if (cwd) {
    const cwdName = basename(cwd);
    if (cwdName) {
      return cwdName;
    }
  }

  return getShellDisplayName(shellPath);
}

export function clampTerminalHeight(height: number, viewportHeight: number) {
  return Math.max(MIN_TERMINAL_HEIGHT, Math.min(height, viewportHeight - 200));
}

export function clampTerminalFontSize(fontSize: number) {
  return Math.max(MIN_TERMINAL_FONT_SIZE, Math.min(MAX_TERMINAL_FONT_SIZE, fontSize));
}

export function isTerminalCopyShortcut(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey'>, preset: TerminalShortcutPreset) {
  const hasModifier = event.ctrlKey || event.metaKey;
  if (!hasModifier) {
    return false;
  }

  const key = event.key.toLowerCase();
  if (preset === 'linux') {
    return event.shiftKey && key === 'c';
  }

  return !event.shiftKey && key === 'c';
}

export function isTerminalPasteShortcut(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey'>, preset: TerminalShortcutPreset) {
  const hasModifier = event.ctrlKey || event.metaKey;
  if (!hasModifier) {
    return false;
  }

  const key = event.key.toLowerCase();
  if (preset === 'linux') {
    return event.shiftKey && key === 'v';
  }

  return !event.shiftKey && key === 'v';
}
