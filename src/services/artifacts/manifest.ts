import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import type { ArtifactAction, ArtifactKind, ArtifactManifest, ArtifactStatus } from './types';

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

function basename(path: string): string {
  return normalizePath(path).split('/').filter(Boolean).pop() ?? path;
}

function stableId(input: string): string {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash + input.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

export function isArtifactManifestPath(path: string): boolean {
  return /\.artifact\.json$/iu.test(path) || /(^|[\\/])artifact\.json$/iu.test(path);
}

export function manifestPathForArtifact(artifactPath: string): string {
  return `${artifactPath}.artifact.json`;
}

export function inferArtifactKind(artifactPath: string): ArtifactKind {
  const name = basename(artifactPath).toLowerCase();
  if (/(^|[.-])review\.md$|检视版\d+\.md$/iu.test(name)) return 'review';
  if (/\.ai改\d+\.md$/iu.test(name)) return 'revision';
  if (/\.(md|markdown)$/iu.test(name)) return 'markdown';
  if (/\.(html?|xhtml)$/iu.test(name)) return 'html';
  if (/\.(txt|json|css|js|ts|tsx|jsx)$/iu.test(name)) return 'text';
  return 'other';
}

export function inferConversationId(artifactPath: string): string | undefined {
  const parts = normalizePath(artifactPath).split('/');
  const outputIndex = parts.findIndex((part) => part === '.typola-output');
  const candidate = outputIndex >= 0 ? parts[outputIndex + 1] : undefined;
  return candidate && !candidate.includes('.') ? candidate : undefined;
}

export function defaultArtifactActions(kind: ArtifactKind): ArtifactAction[] {
  const base: ArtifactAction[] = ['openAsTab', 'archiveToWorkspace', 'deleteArtifact', 'copyPath'];
  if (kind === 'markdown' || kind === 'review' || kind === 'revision' || kind === 'text') {
    base.splice(1, 0, 'insertToEditor');
  }
  if (kind === 'markdown' || kind === 'review' || kind === 'revision') {
    base.splice(1, 0, 'compareWithCurrent');
  }
  if (kind === 'html') {
    base.splice(1, 0, 'preview');
  }
  return base;
}

export function createArtifactManifest(input: {
  artifactPath: string;
  status?: ArtifactStatus;
  documentPath?: string;
  provider?: string;
  model?: string;
  toolName?: string;
  rawOutput?: string;
  error?: string;
  now?: Date;
}): ArtifactManifest {
  const now = (input.now ?? new Date()).toISOString();
  const kind = inferArtifactKind(input.artifactPath);
  const name = basename(input.artifactPath);
  return {
    version: 1,
    id: `artifact-${stableId(normalizePath(input.artifactPath))}`,
    title: name,
    kind,
    status: input.status ?? 'ready',
    createdAt: now,
    updatedAt: now,
    source: {
      conversationId: inferConversationId(input.artifactPath),
      documentPath: input.documentPath,
    },
    agent: {
      provider: input.provider,
      model: input.model,
      toolName: input.toolName,
    },
    files: [{ path: input.artifactPath, name, role: 'primary' }],
    actions: defaultArtifactActions(kind),
    error: input.error,
    rawOutput: input.rawOutput,
  };
}

export function parseArtifactManifest(raw: string): ArtifactManifest | null {
  try {
    const parsed = JSON.parse(raw) as ArtifactManifest;
    if (parsed && parsed.version === 1 && typeof parsed.id === 'string' && Array.isArray(parsed.files)) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

export async function ensureArtifactManifest(input: Parameters<typeof createArtifactManifest>[0]): Promise<ArtifactManifest> {
  const manifestPath = manifestPathForArtifact(input.artifactPath);
  try {
    const existing = parseArtifactManifest(await readTextFile(manifestPath));
    if (existing) return existing;
  } catch {
    // Sidecar does not exist yet.
  }
  const manifest = createArtifactManifest(input);
  await writeTextFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}
