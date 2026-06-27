import type { ArtifactManifest, ArtifactRecord, ArtifactViewMode } from './types';
import { artifactBasename, artifactDir, createArtifactManifest, inferArtifactKind, joinArtifactPath } from './manifest';

type FsEntry = {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
};

type ScannedArtifactFile = {
  path: string;
  manifestPath: string;
  manifestJson?: string | null;
  modifiedAt?: number | null;
};

function isArtifactCandidate(path: string): boolean {
  const name = artifactBasename(path).toLowerCase();
  if (name === 'artifact.json') return false;
  if (name.includes('/backups/')) return false;
  return /\.(md|markdown|html|htm|txt|json|csv|tsv|png|jpg|jpeg|gif|webp|svg)$/u.test(name);
}

async function readDirSafe(path: string): Promise<FsEntry[]> {
  try {
    const { readDir } = await import('@tauri-apps/plugin-fs');
    const entries = await readDir(path);
    return entries.map((entry) => ({
      name: entry.name,
      isDirectory: Boolean(entry.isDirectory),
      isFile: Boolean(entry.isFile),
    }));
  } catch {
    return [];
  }
}

async function statMtime(path: string): Promise<string | undefined> {
  try {
    const { stat } = await import('@tauri-apps/plugin-fs');
    const info = await stat(path);
    const mtime = info.mtime instanceof Date ? info.mtime : undefined;
    return mtime?.toISOString();
  } catch {
    return undefined;
  }
}

async function readManifest(path: string): Promise<ArtifactManifest | null> {
  try {
    const { readTextFile } = await import('@tauri-apps/plugin-fs');
    const parsed = JSON.parse(await readTextFile(path)) as ArtifactManifest;
    return parsed && typeof parsed.primaryFile === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function parseManifestJson(content?: string | null): ArtifactManifest | null {
  if (!content) return null;
  try {
    const parsed = JSON.parse(content) as ArtifactManifest;
    return parsed && typeof parsed.primaryFile === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function isAbsolutePath(path: string): boolean {
  return /^[a-z]:[\\/]/iu.test(path) || path.startsWith('/') || path.startsWith('\\\\');
}

function withScannedPrimaryFile(manifest: ArtifactManifest, filePath: string): ArtifactManifest {
  if (isAbsolutePath(manifest.primaryFile)) return manifest;
  return {
    ...manifest,
    primaryFile: filePath,
    files: manifest.files?.map((file) => (
      file.role === 'primary' && !isAbsolutePath(file.path)
        ? { ...file, path: filePath }
        : file
    )),
  };
}

async function scanFiles(root: string, depth = 0): Promise<string[]> {
  if (depth > 5) return [];
  const entries = await readDirSafe(root);
  const files: string[] = [];
  for (const entry of entries) {
    const path = joinArtifactPath(root, entry.name);
    if (entry.isDirectory) {
      if (entry.name === 'backups') continue;
      files.push(...await scanFiles(path, depth + 1));
    } else if (entry.isFile && isArtifactCandidate(path)) {
      files.push(path);
    }
  }
  return files;
}

export function parseArtifactTime(value?: string): number {
  if (!value) return 0;
  const parsed = /^\d+$/u.test(value) ? Number(value) : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareRecords(a: ArtifactRecord, b: ArtifactRecord): number {
  return parseArtifactTime(b.manifest.updatedAt ?? b.manifest.createdAt) - parseArtifactTime(a.manifest.updatedAt ?? a.manifest.createdAt);
}

export async function scanArtifacts(outputRoot?: string): Promise<ArtifactRecord[]> {
  if (!outputRoot) return [];
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const files = await invoke<ScannedArtifactFile[]>('scan_artifacts', {
      request: { outputRoot },
    });
    return recordsFromScannedFiles(files, outputRoot);
  } catch (error) {
    console.warn('Rust artifact scan failed, falling back to plugin-fs:', error);
  }
  const files = await scanFiles(outputRoot);
  return recordsFromPaths(files, outputRoot);
}

function createLegacyRecord(file: string, outputRoot: string, updatedAt?: string): ArtifactRecord {
  const manifest = createArtifactManifest({
    primaryFile: file,
    outputRoot,
    status: 'done',
    sourceType: 'unknown',
    title: artifactBasename(file),
  });
  manifest.kind = inferArtifactKind(file);
  manifest.createdAt = updatedAt ?? manifest.createdAt;
  manifest.updatedAt = updatedAt ?? manifest.updatedAt;
  return { manifest, legacy: true };
}

function recordsFromScannedFiles(files: ScannedArtifactFile[], outputRoot: string): ArtifactRecord[] {
  const records: ArtifactRecord[] = [];
  const seenManifestPaths = new Set<string>();
  for (const file of files) {
    const manifestPath = file.manifestPath || joinArtifactPath(artifactDir(file.path), 'artifact.json');
    if (seenManifestPaths.has(manifestPath)) continue;
    const parsedManifest = parseManifestJson(file.manifestJson);
    const manifest = parsedManifest ? withScannedPrimaryFile(parsedManifest, file.path) : null;
    if (manifest?.status === 'deleted') continue;
    if (manifest) {
      seenManifestPaths.add(manifestPath);
      records.push({ manifest, manifestPath, legacy: false });
      continue;
    }
    const updatedAt = typeof file.modifiedAt === 'number' ? new Date(file.modifiedAt).toISOString() : undefined;
    records.push(createLegacyRecord(file.path, outputRoot, updatedAt));
  }
  return records.sort(compareRecords);
}

async function recordsFromPaths(files: string[], outputRoot: string): Promise<ArtifactRecord[]> {
  const records: ArtifactRecord[] = [];
  const seenManifestPaths = new Set<string>();
  for (const file of files) {
    const manifestPath = joinArtifactPath(artifactDir(file), 'artifact.json');
    if (seenManifestPaths.has(manifestPath)) continue;
    const manifest = await readManifest(manifestPath);
    if (manifest?.status === 'deleted') continue;
    if (manifest) {
      seenManifestPaths.add(manifestPath);
      records.push({ manifest, manifestPath, legacy: false });
      continue;
    }
    const updatedAt = await statMtime(file);
    records.push(createLegacyRecord(file, outputRoot, updatedAt));
  }
  return records.sort(compareRecords);
}

export function filterArtifacts(
  records: ArtifactRecord[],
  mode: ArtifactViewMode,
  options: { conversationId?: string; documentPath?: string; query?: string; kind?: string; status?: string },
): ArtifactRecord[] {
  const query = options.query?.trim().toLowerCase();
  return records.filter((record) => {
    const manifest = record.manifest;
    if (mode === 'session' && options.conversationId && manifest.source.conversationId !== options.conversationId) return false;
    if (options.kind && options.kind !== 'all' && manifest.kind !== options.kind) return false;
    if (options.status && options.status !== 'all' && manifest.status !== options.status) return false;
    if (query) {
      const haystack = [
        manifest.title,
        manifest.primaryFile,
        manifest.source.documentName,
        manifest.source.conversationId,
        manifest.agent?.label,
        manifest.agent?.model,
      ].filter(Boolean).join('\n').toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  }).sort(compareRecords);
}

export function isOverwritableArtifact(record: ArtifactRecord): boolean {
  return record.manifest.kind === 'markdown' || record.manifest.kind === 'revision';
}
