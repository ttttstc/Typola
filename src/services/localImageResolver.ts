import { resolveLocalResourcePath } from './htmlPresentationService';

type ConvertFileSrcFn = (filePath: string, protocol?: string) => string;

const NOT_AVAILABLE = Symbol('not-available');
let convertFileSrcFn: ConvertFileSrcFn | typeof NOT_AVAILABLE | null = null;

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

    const absolutePath = resolveLocalResourcePath(filePath, rawSrc);
    if (!absolutePath) continue;

    const assetUrl = convertFn(absolutePath);
    img.src = assetUrl;
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
