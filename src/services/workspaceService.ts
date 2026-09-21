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

/** Issue #283:工作区文件树右键删除 —— 永久删除文件或文件夹(后端校验必须位于工作区内)。 */
export function deleteWorkspaceEntry(path: string, workspaceRoot: string): Promise<void> {
  return invoke('delete_workspace_entry', {
    request: { path, workspace_root: workspaceRoot },
  });
}
