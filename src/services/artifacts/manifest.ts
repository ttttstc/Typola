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

const HTML_TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/iu;
const HTML_H1_RE = /<h1[^>]*>([\s\S]*?)<\/h1>/iu;
const MD_HEADING_RE = /^#\s+(.+?)\s*#*\s*$/mu;
const ARTIFACT_TITLE_MAX = 40;

function cleanTitleText(raw: string): string {
  return raw
    .replace(/<[^>]+>/gu, '')
    .replace(/&[a-z#0-9]+;/giu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

/**
 * 从制品内容推导语义标题:HTML 取 <title> → 首个 <h1>;Markdown 取首个一级标题。
 * 取不到返回 undefined,调用方回落 defaultArtifactTitle。只对新制品生效,存量 manifest 不回填。
 */
export function deriveArtifactTitle(path: string, content: string): string | undefined {
  const kind = inferArtifactKind(path);
  let candidate: string | undefined;
  if (kind === 'html' || kind === 'wechat-html' || kind === 'ppt-html') {
    candidate = content.match(HTML_TITLE_RE)?.[1] ?? content.match(HTML_H1_RE)?.[1];
  } else if (kind === 'markdown' || kind === 'revision' || kind === 'review') {
    candidate = content.match(MD_HEADING_RE)?.[1];
  }
  if (!candidate) return undefined;
  const clean = cleanTitleText(candidate);
  if (!clean) return undefined;
  return clean.length > ARTIFACT_TITLE_MAX ? `${clean.slice(0, ARTIFACT_TITLE_MAX)}…` : clean;
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

/**
 * 归档成功后写回 manifest:状态置 archived、主文件指向工作区新路径、标题更新为用户命名。
 * manifest 留在 conv-N 目录作升格留痕;扫描端(Rust collect_archived_manifests)按 archived 状态补回卡片。
 * 读不到 manifest(legacy 制品)时静默跳过。
 */
export async function markArtifactArchived(
  originalPrimaryFile: string,
  archivedPath: string,
  title?: string,
): Promise<void> {
  const manifestPath = joinArtifactPath(artifactDir(originalPrimaryFile), 'artifact.json');
  try {
    const { readTextFile } = await import('@tauri-apps/plugin-fs');
    const manifest = JSON.parse(await readTextFile(manifestPath)) as ArtifactManifest;
    if (!manifest || typeof manifest.primaryFile !== 'string') return;
    manifest.status = 'archived';
    manifest.primaryFile = archivedPath;
    if (title) manifest.title = title;
    manifest.updatedAt = new Date().toISOString();
    manifest.files = manifest.files?.map((file) => (
      file.role === 'primary' ? { ...file, path: archivedPath } : file
    ));
    await writeArtifactManifest(manifest, manifestPath);
  } catch {
    // legacy 制品无 manifest 或写回失败,不影响归档本身。
  }
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
  // 创建分支:未显式给标题时,读制品内容(前 16KB)推导语义标题,取不到回落默认「kind 前缀+文件名」。
  let title = input.title;
  if (!title) {
    try {
      const head = (await readTextFile(input.primaryFile)).slice(0, 16384);
      title = deriveArtifactTitle(input.primaryFile, head);
    } catch {
      // 文件暂不可读(生成中/权限),回落默认标题。
    }
  }
  const manifest = createArtifactManifest({ ...input, title });
  await writeArtifactManifest(manifest, manifestPath);
  return manifest;
}
