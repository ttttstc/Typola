import { open, save } from '@tauri-apps/plugin-dialog';
import { readFile, writeTextFile } from '@tauri-apps/plugin-fs';
import type { DocumentFingerprint, LineEnding, OpenedFile } from '../types/document';
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

function hasUtf8Bom(data: Uint8Array): boolean {
  return data.length >= 3 && data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf;
}

function hashBytes(data: Uint8Array): string {
  let hash = 2166136261;
  for (const byte of data) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function fingerprintFromBytes(data: Uint8Array): DocumentFingerprint {
  return { size: data.byteLength, modifiedAt: null, hash: hashBytes(data) };
}

function isDocumentFingerprint(value: unknown): value is DocumentFingerprint {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DocumentFingerprint>;
  return typeof candidate.size === 'number'
    && (candidate.modifiedAt === null || typeof candidate.modifiedAt === 'number')
    && typeof candidate.hash === 'string';
}

function lineEndingOf(content: string): LineEnding {
  return content.includes('\r\n') ? 'CRLF' : 'LF';
}

function stripBom(data: Uint8Array, hasBom: boolean): Uint8Array {
  return hasBom ? data.subarray(3) : data;
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return copy.buffer;
}

export async function readTextWithEncoding(path: string, encoding: DefaultEncoding): Promise<string> {
  const data = isTauriRuntime() ? await readDocumentBytes(path) : await readFile(path);
  return decodeText(stripBom(data, hasUtf8Bom(data)), encoding);
}

async function readDocument(path: string, encoding: DefaultEncoding): Promise<{
  content: string;
  encoding: DefaultEncoding;
  hasBom: boolean;
  lineEnding: LineEnding;
  fingerprint: DocumentFingerprint;
}> {
  const data = isTauriRuntime() ? await readDocumentBytes(path) : await readFile(path);
  const hasBom = hasUtf8Bom(data);
  const content = decodeText(stripBom(data, hasBom), encoding);
  let fingerprint = fingerprintFromBytes(data);
  if (isTauriRuntime()) {
    try {
      const candidate = await getDocumentFingerprint(path);
      if (isDocumentFingerprint(candidate)) fingerprint = candidate;
    } catch {
      // Reading succeeded; a missing stat only removes the optimization.
    }
  }
  return { content, encoding, hasBom, lineEnding: lineEndingOf(content), fingerprint };
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

  const document = await readDocument(path, encoding);
  const fileType = ext === 'html' || ext === 'htm' ? 'html' as const : 'markdown' as const;

  return {
    path,
    name,
    content: document.content,
    dirty: false,
    lastSavedContent: document.content,
    fileType,
    encoding: document.encoding,
    hasBom: document.hasBom,
    lineEnding: document.lineEnding,
    fingerprint: document.fingerprint,
  };
}

// 选一个或多个文件夹,仅取每目录下一层的 Markdown/HTML/Word 文档(flat first-level,不递归)。
// 跳过当前不属于 openable 的,单个文件打开失败不阻塞其他。
export async function openFolder(encoding: DefaultEncoding = 'UTF-8'): Promise<OpenedFile[]> {
  if (!isTauriRuntime()) return [];
  const { invoke } = await import('@tauri-apps/api/core');
  const { open } = await import('@tauri-apps/plugin-dialog');
  const selected = await open({ directory: true, multiple: true });
  if (!selected) return [];
  const dirs = (Array.isArray(selected) ? selected : [selected]) as string[];
  const result: OpenedFile[] = [];
  for (const dir of dirs) {
    try {
      const entries = await invoke<string[]>('read_first_level_openable', { dir });
      for (const p of entries) {
        try {
          result.push(await openPath(p, encoding));
        } catch (error) {
          console.warn('跳过无法打开的文件:', p, error);
        }
      }
    } catch (error) {
      console.warn('read_first_level_openable failed:', dir, error);
    }
  }
  return result;
}

// @ts-expect-eslint: no-useless-assignment —— init 为下次 try 赋值占位,实际读取在 try 内,请保留占位类型声明
export const _lintSentinel = null;

function normalizedContent(file: OpenedFile): string {
  const content = file.content.replace(/\r\n/g, '\n');
  return file.lineEnding === 'CRLF' ? content.replace(/\n/g, '\r\n') : content;
}

async function writeDocument(
  path: string,
  file: OpenedFile,
  encoding: DefaultEncoding,
): Promise<DocumentFingerprint | undefined> {
  if (isTauriRuntime()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<DocumentFingerprint>('write_opened_document', {
      request: {
        path,
        content: normalizedContent(file),
        encoding,
        hasBom: encoding === 'UTF-8' && file.hasBom === true,
        lineEnding: file.lineEnding ?? 'LF',
      },
    });
  }
  if (encoding !== 'UTF-8') {
    throw new Error(`${encoding} 编码写入仅支持桌面运行时。`);
  }
  const data = new TextEncoder().encode(normalizedContent(file));
  await writeTextFile(path, normalizedContent(file));
  return { size: data.byteLength, modifiedAt: null, hash: hashBytes(data) };
}

export async function getDocumentFingerprint(path: string): Promise<DocumentFingerprint> {
  if (isTauriRuntime()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<DocumentFingerprint>('stat_opened_document', { path });
  }
  return fingerprintFromBytes(await readFile(path));
}

export async function saveFile(file: OpenedFile, saveAsEncoding: DefaultEncoding = file.encoding ?? 'UTF-8'): Promise<OpenedFile> {
  if (!file.path) return saveFileAs(file, saveAsEncoding);

  const fingerprint = await writeDocument(file.path, file, file.encoding ?? 'UTF-8');
  return { ...file, dirty: false, lastSavedContent: file.content, fingerprint };
}

export async function saveFileAs(file: OpenedFile, encoding: DefaultEncoding = 'UTF-8'): Promise<OpenedFile> {
  const path = await save({
    defaultPath: file.name || 'untitled.md',
    filters: [
      { name: 'Markdown', extensions: ['md'] },
      { name: 'HTML', extensions: ['html', 'htm'] },
    ],
  });

  if (!path) return file;

  const fingerprint = await writeDocument(path, file, encoding);
  const name = fileNameFromPath(path);

  return {
    ...file,
    path,
    name,
    dirty: false,
    lastSavedContent: file.content,
    encoding,
    hasBom: encoding === 'UTF-8' && file.hasBom === true,
    fingerprint,
  };
}
