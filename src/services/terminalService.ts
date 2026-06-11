import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export type TerminalCursorStyle = 'block' | 'bar' | 'underline';
export type TerminalShortcutPreset = 'default' | 'windows';

export type TerminalSettings = {
  shellPath: string;
  fontFamily: string;
  fontSize: number;
  cursorStyle: TerminalCursorStyle;
  cursorBlink: boolean;
  shortcutPreset: TerminalShortcutPreset;
  confirmMultilinePaste: boolean;
};

export type TerminalCreateRequest = {
  cwd?: string;
  shell?: string;
  cols?: number;
  rows?: number;
};

export type TerminalCreateResult = {
  termId: number;
  cwd: string;
  shellPath: string;
  processName: string;
};

export type TerminalDataPayload = {
  termId: number;
  data: number[] | Uint8Array;
};

export type TerminalExitPayload = {
  termId: number;
  exitCode?: number | null;
  signal?: string | null;
};

export async function createTerminal(request: TerminalCreateRequest): Promise<TerminalCreateResult> {
  return invoke<TerminalCreateResult>('terminal_create', { request });
}

export async function writeTerminal(termId: number, data: string): Promise<void> {
  await invoke('terminal_write', { request: { termId, data } });
}

export async function resizeTerminal(termId: number, cols: number, rows: number): Promise<void> {
  await invoke('terminal_resize', { request: { termId, cols, rows } });
}

export async function killTerminal(termId: number): Promise<void> {
  await invoke('terminal_kill', { termId });
}

export async function clearTerminal(termId: number): Promise<void> {
  await invoke('terminal_clear', { termId });
}

export async function onTerminalData(
  handler: (payload: TerminalDataPayload) => void,
): Promise<UnlistenFn> {
  return listen<TerminalDataPayload>('terminal_data', (event) => handler(event.payload));
}

export async function onTerminalExit(
  handler: (payload: TerminalExitPayload) => void,
): Promise<UnlistenFn> {
  return listen<TerminalExitPayload>('terminal_exit', (event) => handler(event.payload));
}

export function directoryFromPath(path?: string): string | undefined {
  if (!path) return undefined;
  const normalized = path.replace(/\\/g, '/');
  const slashIndex = normalized.lastIndexOf('/');
  if (slashIndex <= 0) return undefined;
  return path.slice(0, slashIndex);
}
