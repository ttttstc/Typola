import type { AppSettings, ImageInsertAction } from './settingsService';

export type ImagePathFormatOptions = Pick<
  AppSettings,
  'imagePreferRelative' | 'imageEnsureDotPrefix' | 'imageEscapeUrl'
>;

export type ImageInsertSettings = Pick<
  AppSettings,
  | 'imageInsertAction'
  | 'imageCopyDestination'
  | 'imageAllowYamlUpload'
  | 'imagePreferRelative'
  | 'imageEnsureDotPrefix'
  | 'imageEscapeUrl'
>;

export function isImagePath(path: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(path.split(/[?#]/u)[0] ?? path);
}

export function isRemoteImageSrc(src: string): boolean {
  return /^https?:\/\//i.test(src) || /^data:image\//i.test(src);
}

export function pathBasenameWithoutExtension(path: string): string {
  const base = path.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? '';
  return base.replace(/\.[^.]+$/u, '');
}

export function normalizeLocalPath(path: string): string {
  return path.replace(/\\/g, '/');
}

export function resolveCopyDestination(
  documentPath: string | null | undefined,
  destination: string,
): string {
  const safeDestination = (destination || 'assets').trim() || 'assets';
  const fileName = documentPath ? pathBasenameWithoutExtension(documentPath) : '';
  const now = new Date();
  return safeDestination
    .replace(/\$?\{filename\}/g, fileName)
    .replace(/\{year\}/g, String(now.getFullYear()))
    .replace(/\{month\}/g, String(now.getMonth() + 1).padStart(2, '0'));
}

export function parseTyporaCopyImagesTo(markdown: string): string | null {
  const match = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u);
  if (!match) return null;
  const lines = match[1].split(/\r?\n/u);
  for (const line of lines) {
    const valueMatch = line.match(/^\s*typora-copy-images-to\s*:\s*(.*?)\s*$/u);
    if (!valueMatch) continue;
    const raw = valueMatch[1].trim();
    return raw.replace(/^['"]|['"]$/gu, '').trim() || null;
  }
  return null;
}

export function resolveImageInsertAction(
  settings: ImageInsertSettings,
  markdown: string,
): { action: ImageInsertAction; copyDestination: string } {
  const yamlValue = parseTyporaCopyImagesTo(markdown);
  if (yamlValue === 'upload' && settings.imageAllowYamlUpload) {
    return { action: 'upload', copyDestination: settings.imageCopyDestination };
  }
  if (yamlValue && yamlValue !== 'upload') {
    return { action: 'copy', copyDestination: yamlValue };
  }
  return {
    action: settings.imageInsertAction,
    copyDestination: settings.imageCopyDestination,
  };
}

export function formatImageSrc(
  absImagePath: string,
  documentPath: string | null | undefined,
  options: ImagePathFormatOptions,
): string {
  const normalizedImagePath = normalizeLocalPath(absImagePath);
  let src = normalizedImagePath;
  if (options.imagePreferRelative && documentPath) {
    src = relativePath(dirname(normalizeLocalPath(documentPath)), normalizedImagePath);
  }
  if (options.imageEnsureDotPrefix && isPlainRelativePath(src) && !src.startsWith('./')) {
    src = `./${src}`;
  }
  return options.imageEscapeUrl ? encodeURI(src) : src;
}

export function parseUploadUrls(stdout: string, imageCount: number): string[] {
  if (imageCount <= 0) return [];
  const lines = stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const urls = lines.slice(-imageCount);
  if (urls.length !== imageCount || urls.some((url) => !isValidUploadUrl(url))) {
    throw new Error('上传命令输出中没有足够的 URL。');
  }
  return urls;
}

function isPlainRelativePath(path: string): boolean {
  return !path.startsWith('../')
    && !path.startsWith('/')
    && !/^[a-z]:\//i.test(path)
    && !/^[a-z][a-z0-9+.-]*:/i.test(path);
}

function dirname(path: string): string {
  const normalized = path.replace(/\/+$/u, '');
  const index = normalized.lastIndexOf('/');
  return index >= 0 ? normalized.slice(0, index) : '';
}

function relativePath(fromDir: string, toPath: string): string {
  const fromParts = splitPath(fromDir);
  const toParts = splitPath(toPath);
  if (getRoot(fromDir) !== getRoot(toPath)) return toPath;
  let shared = 0;
  while (shared < fromParts.length && shared < toParts.length && fromParts[shared] === toParts[shared]) {
    shared += 1;
  }
  const up = fromParts.slice(shared).map(() => '..');
  const down = toParts.slice(shared);
  const result = [...up, ...down].join('/');
  return result || toParts[toParts.length - 1] || toPath;
}

function splitPath(path: string): string[] {
  return path
    .replace(/^[a-z]:/iu, '')
    .replace(/^\/+/u, '')
    .split('/')
    .filter(Boolean);
}

function getRoot(path: string): string {
  const drive = path.match(/^[a-z]:/iu)?.[0]?.toLowerCase();
  if (drive) return drive;
  return path.startsWith('/') ? '/' : '';
}

function isValidUploadUrl(value: string): boolean {
  return /^https?:\/\/\S+/i.test(value) || /^data:image\/\S+/i.test(value);
}
