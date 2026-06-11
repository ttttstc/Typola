import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export type FileChangedPayload = {
  path: string;
};

export async function watchOpenedDocument(path: string): Promise<void> {
  await invoke('watch_opened_document', { path });
}

export async function unwatchOpenedDocument(path: string): Promise<void> {
  await invoke('unwatch_opened_document', { path });
}

export async function onFileChanged(
  handler: (payload: FileChangedPayload) => void,
): Promise<UnlistenFn> {
  return listen<FileChangedPayload>('file-changed', (event) => handler(event.payload));
}
