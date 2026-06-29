import { readDir, readTextFile, stat } from '@tauri-apps/plugin-fs';
import { inferArtifactKind, isArtifactManifestPath, manifestPathForArtifact, parseArtifactManifest } from './manifest';
import type { ArtifactFilterMode, ArtifactRecord, ArtifactStatus } from './types';

function normalize(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/u, '').toLowerCase();
}

function joinPath(root: string, child: string): string {
  const separator = root.includes('\\') ? '\\' : '/';
  return `${root.replace(/[\\/]+$/u, '')}${separator}${child}`;
}

function basename(path: string): string {
  return path.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? path;
}

async function walkFiles(root: string, depth = 0): Promise<string[]> {
  if (depth > 4) return [];
  const entries = await readDir(root);
  const files: string[] = [];
  for (const entry of entries as Array<{ name: string; isFile?: boolean; isDirectory?: boolean }>) {
    const path = joinPath(root, entry.name);
    if (entry.isDirectory) {
      files.push(...await walkFiles(path, depth + 1));
    } else if (entry.isFile) {
      files.push(path);
    }
  }
  return files;
}

async function readManifestFor(path: string) {
  try {
    return parseArtifactManifest(await readTextFile(manifestPathForArtifact(path)));
  } catch {
    return null;
  }
}

async function mtime(path: string): Promise<number> {
  try {
    const info = await stat(path);
    const value = info.mtime ?? info.birthtime;
    if (value instanceof Date) return value.getTime();
  } catch {
    // Ignore stat failure and keep artifact visible.
  }
  return Date.now();
}

export async function scanArtifacts(outputRoot: string): Promise<ArtifactRecord[]> {
  try {
    const files = await walkFiles(outputRoot);
    const records = await Promise.all(files
      .filter((path) => !isArtifactManifestPath(path))
      .map(async (path): Promise<ArtifactRecord> => {
        const manifest = await readManifestFor(path);
        return {
          path,
          name: manifest?.title ?? basename(path),
          ts: await mtime(path),
          kind: manifest?.kind ?? inferArtifactKind(path),
          status: manifest?.status ?? 'ready',
          manifest: manifest ?? undefined,
          manifestPath: manifest ? manifestPathForArtifact(path) : undefined,
          legacy: !manifest,
        };
      }));
    return records.sort((a, b) => b.ts - a.ts);
  } catch {
    return [];
  }
}

export function filterArtifactRecords(
  records: ArtifactRecord[],
  mode: ArtifactFilterMode,
  options: {
    conversationId?: string;
    documentPath?: string;
    query?: string;
    kind?: string;
    status?: ArtifactStatus | 'all';
  },
): ArtifactRecord[] {
  const query = options.query?.trim().toLowerCase();
  const documentPath = options.documentPath ? normalize(options.documentPath) : undefined;
  return records.filter((record) => {
    if (mode === 'session' && options.conversationId) {
      if (record.manifest?.source.conversationId !== options.conversationId && !normalize(record.path).includes(`/.typola-output/${options.conversationId.toLowerCase()}/`)) {
        return false;
      }
    }
    if (mode === 'document') {
      if (!documentPath || normalize(record.manifest?.source.documentPath ?? '') !== documentPath) return false;
    }
    if (options.kind && options.kind !== 'all' && record.kind !== options.kind) return false;
    if (options.status && options.status !== 'all' && record.status !== options.status) return false;
    if (query && !`${record.name} ${record.path}`.toLowerCase().includes(query)) return false;
    return record.status !== 'deleted';
  });
}
