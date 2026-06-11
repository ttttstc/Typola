import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, readFile, writeTextFile } from '@tauri-apps/plugin-fs';
import type { OpenedFile } from '../types/document';
import type { DefaultEncoding } from './settingsService';

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() || '未命名';
}

function bytesToUint8Array(data: number[] | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

async function readDocumentBytes(path: string): Promise<Uint8Array> {
  if (isTauriRuntime()) {
    const { invoke } = await import('@tauri-apps/api/core');
    const data = await invoke<number[] | Uint8Array>('read_opened_document', { path });
    return bytesToUint8Array(data);
  }

  return readFile(path);
}

function decodeText(data: Uint8Array, encoding: DefaultEncoding): string {
  const label = encoding === 'UTF-8' ? 'utf-8' : encoding.toLowerCase();
  return new TextDecoder(label).decode(data);
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return copy.buffer;
}

export async function readTextWithEncoding(path: string, encoding: DefaultEncoding): Promise<string> {
  if (isTauriRuntime()) {
    return decodeText(await readDocumentBytes(path), encoding);
  }

  if (encoding === 'UTF-8') {
    return readTextFile(path);
  }

  const data = await readFile(path);
  return decodeText(data, encoding);
}

export async function openFile(encoding: DefaultEncoding = 'UTF-8'): Promise<OpenedFile | null> {
  const selected = await open({
    multiple: false,
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown'] },
      { name: 'HTML', extensions: ['html', 'htm'] },
      { name: 'Word 文档', extensions: ['docx'] },
      { name: 'All', extensions: ['*'] },
    ],
  });

  if (!selected) return null;

  const path = selected as string;
  return openPath(path, encoding);
}

export async function openPath(path: string, encoding: DefaultEncoding = 'UTF-8'): Promise<OpenedFile> {
  const name = fileNameFromPath(path);
  const ext = path.split('.').pop()?.toLowerCase();

  if (ext === 'docx') {
    const data = await readDocumentBytes(path);
    const { convertDocxToHtml } = await import('./docxPreviewService');
    const docxHtml = await convertDocxToHtml(toArrayBuffer(data));
    return { path, name, content: '', dirty: false, lastSavedContent: '', fileType: 'docx', docxHtml };
  }

  const content = await readTextWithEncoding(path, encoding);
  const fileType = ext === 'html' || ext === 'htm' ? 'html' as const : 'markdown' as const;

  return { path, name, content, dirty: false, lastSavedContent: content, fileType };
}

export async function saveFile(file: OpenedFile): Promise<OpenedFile> {
  if (!file.path) return saveFileAs(file);

  if (isTauriRuntime()) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('write_opened_document', { path: file.path, content: file.content });
  } else {
    await writeTextFile(file.path, file.content);
  }
  return { ...file, dirty: false, lastSavedContent: file.content };
}

export async function saveFileAs(file: OpenedFile): Promise<OpenedFile> {
  const path = await save({
    defaultPath: file.name || 'untitled.md',
    filters: [
      { name: 'Markdown', extensions: ['md'] },
      { name: 'HTML', extensions: ['html', 'htm'] },
    ],
  });

  if (!path) return file;

  if (isTauriRuntime()) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('write_opened_document', { path, content: file.content });
  } else {
    await writeTextFile(path, file.content);
  }
  const name = fileNameFromPath(path);

  return { ...file, path, name, dirty: false, lastSavedContent: file.content };
}
