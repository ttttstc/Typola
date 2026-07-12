import { resolveLocalResourcePath } from './htmlPresentationService';

type ConvertFileSrcFn = (filePath: string, protocol?: string) => string;

const NOT_AVAILABLE = Symbol('not-available');
let convertFileSrcFn: ConvertFileSrcFn | typeof NOT_AVAILABLE | null = null;
const allowedAssetDirectories = new Set<string>();

async function ensureConvertFileSrc(): Promise<ConvertFileSrcFn | null> {
  if (convertFileSrcFn !== null) {
    return convertFileSrcFn === NOT_AVAILABLE ? null : convertFileSrcFn;
  }
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
    convertFileSrcFn = NOT_AVAILABLE;
    return null;
  }
  try {
    const { convertFileSrc } = await import('@tauri-apps/api/core');
    convertFileSrcFn = convertFileSrc;
    return convertFileSrcFn;
  } catch {
    convertFileSrcFn = NOT_AVAILABLE;
    return null;
  }
}

/**
 * Resolve local relative image `src` attributes inside a container element
 * so they can be loaded by the Tauri WebView.
 *
 * For each `<img>` whose `src` is a relative path (e.g. `./images/photo.webp`),
 * resolve it to an absolute filesystem path based on the currently-open file's
 * directory, then convert it to a Tauri asset URL via `convertFileSrc()`.
 *
 * This is intentionally idempotent: images whose `src` already starts with
 * `https://asset.localhost` (or any absolute URL) are left untouched.
 */
export async function resolveLocalImages(
  container: HTMLElement,
  filePath: string | undefined,
): Promise<void> {
  const images = container.querySelectorAll<HTMLImageElement>('img[src]');
  for (const img of images) {
    const rawSrc = img.getAttribute('src');
    if (!rawSrc) continue;

    if (isRemoteImageSrc(rawSrc)) {
      prepareRemoteImage(img, rawSrc);
      continue;
    }

    if (!filePath) continue;

    // 已是绝对/data/hash 等的 img 跳过,不重复处理。
    if (
      rawSrc.startsWith('data:') ||
      rawSrc.startsWith('asset:') ||
      rawSrc.startsWith('file://') ||
      rawSrc.startsWith('//') ||
      rawSrc.startsWith('#')
    ) {
      continue;
    }

    const convertFn = await ensureConvertFileSrc();
    if (!convertFn) return;

    const absolutePath = resolveLocalResourcePath(filePath, rawSrc) ?? absoluteLocalPath(rawSrc);
    if (!absolutePath) continue;

    await allowAssetDirectory(absolutePath);
    const assetUrl = convertFn(absolutePath);
    img.src = assetUrl;
  }
}

function absoluteLocalPath(src: string): string | undefined {
  const path = src.split(/[?#]/u, 1)[0];
  if (!/^(?:[A-Za-z]:[\\/]|[\\/]{2}|\/)/u.test(path)) return undefined;
  try {
    return decodeURIComponent(path).replaceAll('/', '\\');
  } catch {
    return path.replaceAll('/', '\\');
  }
}

async function allowAssetDirectory(filePath: string): Promise<void> {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return;
  const slash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  const directory = slash >= 0 ? filePath.slice(0, slash) : '';
  if (!directory || allowedAssetDirectories.has(directory)) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('allow_asset_directory', { dir: directory });
    allowedAssetDirectories.add(directory);
  } catch {
    // 已打开文档目录通常已在 scope 内；scope 扩展失败不阻断其它可显示图片。
  }
}

function isRemoteImageSrc(src: string): boolean {
  return /^https?:\/\//i.test(src);
}

// 部分 CDN(尤其微信 mmbiz.qpic.cn)对 app origin 的 referrer 拒绝。设置
// referrerPolicy=no-referrer + 重置 src 触发重发请求,模拟 Typora/Electron 行为。
function prepareRemoteImage(img: HTMLImageElement, src: string): void {
  img.referrerPolicy = 'no-referrer';
  if (img.dataset.typolaRemotePrepared === 'true') return;

  img.dataset.typolaRemotePrepared = 'true';
  img.removeAttribute('src');
  img.setAttribute('src', src);
}
