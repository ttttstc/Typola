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
  if (!filePath) return;

  const convertFn = await ensureConvertFileSrc();
  if (!convertFn) return;

  const images = container.querySelectorAll<HTMLImageElement>('img[src]');
  for (const img of images) {
    const rawSrc = img.getAttribute('src');
    if (!rawSrc) continue;

    // Skip URLs that are already absolute / data URIs / hash-only.
    if (
      rawSrc.startsWith('data:') ||
      rawSrc.startsWith('http://') ||
      rawSrc.startsWith('https://') ||
      rawSrc.startsWith('file://') ||
      rawSrc.startsWith('//') ||
      rawSrc.startsWith('#')
    ) {
      continue;
    }

    const absolutePath = resolveLocalResourcePath(filePath, rawSrc);
    if (!absolutePath) continue;

    const assetUrl = convertFn(absolutePath);
    img.src = assetUrl;
  }
}
