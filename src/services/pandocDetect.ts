import { invoke } from '@tauri-apps/api/core';

let cachedPandocPath: string | null | undefined;

export async function detectPandocPath(): Promise<string> {
  if (cachedPandocPath !== undefined) return cachedPandocPath ?? '';
  try {
    const result = await invoke<string | null>('detect_pandoc_path');
    cachedPandocPath = result ?? '';
  } catch {
    cachedPandocPath = '';
  }
  return cachedPandocPath;
}
