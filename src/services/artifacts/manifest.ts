import type { ArtifactCreateInput, ArtifactKind, ArtifactManifest } from './types';

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

export function artifactBasename(path: string): string {
  return normalizePath(path).split('/').filter(Boolean).pop() ?? path;
}

function artifactStem(path: string): string {
  return artifactBasename(path).replace(/\.[^.]+$/u, '');
}

export function artifactDir(path: string): string {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf('/');
  return index >= 0 ? normalized.slice(0, index) : '.';
}

export function joinArtifactPath(...parts: string[]): string {
  const [first, ...rest] = parts;
  return [first?.replace(/[\\/]+$/u, '') ?? '', ...rest.map((part) => part.replace(/^[\\/]+|[\\/]+$/gu, ''))]
    .filter(Boolean)
    .join('/');
}

export function inferArtifactKind(path: string): ArtifactKind {
  const name = artifactBasename(path).toLowerCase();
  if (/\.ai改\d+\.md$/u.test(name)) return 'revision';
  if (name === 'review.md' || name.endsWith('.review.md')) return 'review';
  if (name.includes('wechat') && name.endsWith('.html')) return 'wechat-html';
  if ((name.includes('ppt') || name.includes('slide')) && name.endsWith('.html')) return 'ppt-html';
  if (name.endsWith('.md') || name.endsWith('.markdown')) return 'markdown';
  if (name.endsWith('.html') || name.endsWith('.htm')) return 'html';
  if (/\.(json|csv|tsv)$/u.test(name)) return 'data';
  if (/\.(png|jpg|jpeg|gif|webp|svg)$/u.test(name)) return 'asset';
  return 'unknown';
}

export function defaultArtifactTitle(path: string, kind = inferArtifactKind(path)): string {
  const name = artifactBasename(path);
  if (kind === 'revision') return `AI 改稿 · ${name}`;
  if (kind === 'review') return `检视版 · ${name}`;
  if (kind === 'wechat-html') return `公众号 HTML · ${name}`;
  if (kind === 'ppt-html') return `演示 HTML · ${name}`;
  return name;
}

export function createArtifactManifest(input: ArtifactCreateInput): ArtifactManifest {
  const kind = inferArtifactKind(input.primaryFile);
  const now = new Date().toISOString();
  const id = `${Date.now().toString(36)}-${artifactStem(input.primaryFile).replace(/[^a-z0-9_-]+/giu, '-').slice(0, 40) || 'artifact'}`;
  return {
    id,
    title: input.title || defaultArtifactTitle(input.primaryFile, kind),
    kind,
    status: input.status ?? 'done',
    primaryFile: input.primaryFile,
    createdAt: now,
    updatedAt: now,
    source: {
      type: input.sourceType ?? 'unknown',
      documentPath: input.documentPath,
      documentName: input.documentName ?? (input.documentPath ? artifactBasename(input.documentPath) : undefined),
      conversationId: input.conversationId,
    },
    agent: input.agentId ? {
      id: input.agentId,
      label: input.agentLabel,
      model: input.model,
    } : undefined,
    workspace: {
      root: input.workspaceRoot,
      outputRoot: input.outputRoot,
    },
    files: [{ path: input.primaryFile, role: 'primary' }],
    actions: {
      openAsTab: true,
      preview: kind === 'html' || kind === 'wechat-html' || kind === 'ppt-html',
      insertToEditor: kind === 'markdown' || kind === 'revision' || kind === 'review',
      compareWithCurrent: kind === 'markdown' || kind === 'revision' || kind === 'review',
      overwriteDocument: kind === 'markdown' || kind === 'revision',
      archive: true,
      delete: true,
    },
  };
}

export async function writeArtifactManifest(manifest: ArtifactManifest, manifestPath?: string): Promise<string> {
  const path = manifestPath ?? joinArtifactPath(artifactDir(manifest.primaryFile), 'artifact.json');
  const [{ writeTextFile }, { mkdir }] = await Promise.all([
    import('@tauri-apps/plugin-fs'),
    import('@tauri-apps/plugin-fs'),
  ]);
  try {
    await mkdir(artifactDir(path), { recursive: true });
  } catch {
    // The directory can already exist or be managed by the AI process.
  }
  await writeTextFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
  return path;
}

export async function ensureArtifactManifest(input: ArtifactCreateInput): Promise<ArtifactManifest> {
  const manifestPath = joinArtifactPath(artifactDir(input.primaryFile), 'artifact.json');
  const { readTextFile } = await import('@tauri-apps/plugin-fs');
  try {
    const existing = JSON.parse(await readTextFile(manifestPath)) as ArtifactManifest;
    if (existing && typeof existing.primaryFile === 'string') return existing;
  } catch {
    // Missing or malformed metadata is repaired below.
  }
  const manifest = createArtifactManifest(input);
  await writeArtifactManifest(manifest, manifestPath);
  return manifest;
}
