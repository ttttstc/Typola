import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export type WorkspaceChangedKind = 'create' | 'modify' | 'remove' | 'rename' | 'other';

export type WorkspaceChangedPayload = {
  kind: WorkspaceChangedKind;
  paths: string[];
};

export async function watchWorkspace(path: string): Promise<void> {
  await invoke('watch_workspace', { path });
}

export async function unwatchWorkspace(path: string): Promise<void> {
  await invoke('unwatch_workspace', { path });
}

export async function onWorkspaceChanged(
  handler: (payload: WorkspaceChangedPayload) => void,
): Promise<UnlistenFn> {
  return listen<WorkspaceChangedPayload>('workspace-changed', (event) => handler(event.payload));
}
