import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

export type WorkspaceEntry = {
  name: string;
  path: string;
  isDir: boolean;
  isSupported: boolean;
};

export async function pickWorkspaceDirectory(): Promise<string | null> {
  const selected = await open({ directory: true, multiple: false });
  return typeof selected === 'string' ? selected : null;
}

export function listWorkspaceEntries(path: string): Promise<WorkspaceEntry[]> {
  return invoke<WorkspaceEntry[]>('list_directory_entries', {
    request: { path },
  });
}

export function workspaceNameFromPath(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}
