import { mkdir, readDir, stat, writeTextFile } from '@tauri-apps/plugin-fs';
import { joinLocalPath, pathBasename } from '../../app/appLayoutUtils';

export type DocumentHistoryEntry = {
  name: string;
  path: string;
  mtime: number;
};

function safeSegment(value: string): string {
  return value.replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/gu, '') || 'document';
}

function pathHash(path: string): string {
  let hash = 0x811c9dc5;
  for (const char of path.replace(/\\/gu, '/').toLowerCase()) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function documentHistoryDirectory(
  outputBaseDir: string,
  conversationId: string,
  documentPath: string,
): string {
  const fileName = pathBasename(documentPath);
  const stem = fileName.replace(/\.[^.]+$/u, '') || 'document';
  const documentKey = `${safeSegment(stem)}-${pathHash(documentPath)}`;
  return joinLocalPath(outputBaseDir, safeSegment(conversationId), 'history', documentKey);
}

function historyFileName(documentPath: string, now: Date): string {
  const fileName = pathBasename(documentPath);
  const stem = fileName.replace(/\.[^.]+$/u, '') || 'document';
  const stamp = now.toISOString().replace(/[-:.]/gu, '');
  return `${safeSegment(stem)}.历史版本.${stamp}.md`;
}

export async function createDocumentHistoryVersion(options: {
  outputBaseDir: string;
  conversationId: string;
  documentPath: string;
  content: string;
  now?: Date;
}): Promise<DocumentHistoryEntry> {
  const now = options.now ?? new Date();
  const directory = documentHistoryDirectory(
    options.outputBaseDir,
    options.conversationId,
    options.documentPath,
  );
  await mkdir(directory, { recursive: true });
  const name = historyFileName(options.documentPath, now);
  const path = joinLocalPath(directory, name);
  await writeTextFile(path, options.content);
  return { name, path, mtime: now.getTime() };
}

export async function listDocumentHistory(options: {
  outputBaseDir?: string;
  conversationId?: string;
  documentPath?: string;
}): Promise<DocumentHistoryEntry[]> {
  if (!options.outputBaseDir || !options.conversationId || !options.documentPath) return [];
  const directory = documentHistoryDirectory(
    options.outputBaseDir,
    options.conversationId,
    options.documentPath,
  );
  try {
    const entries = await readDir(directory);
    const histories = await Promise.all(entries
      .filter((entry) => entry.isFile && /\.历史版本\..+\.md$/u.test(entry.name))
      .map(async (entry) => {
        const path = joinLocalPath(directory, entry.name);
        const info = await stat(path).catch(() => null);
        return {
          name: entry.name,
          path,
          mtime: info?.mtime instanceof Date ? info.mtime.getTime() : 0,
        };
      }));
    return histories.sort((a, b) => b.mtime - a.mtime);
  } catch {
    return [];
  }
}
