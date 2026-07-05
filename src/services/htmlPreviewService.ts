// Issue #156 §8.3:把 HTML 通用能力从 htmlPresentationService 抽出来,
// 让 HtmlPreviewPane(只读预览)与 HtmlPresentationPane(演示桥)共用一套资源内联。
//
// 这层只关心:把任意 HTML 源(完整 HTML / 片段)构造成一个可在 iframe srcDoc 中安全渲染的
// 完整 HTML 文档,内联本地 CSS / JS / 图片 / 媒体资源。不引入任何 Tauri API。

type ReadPreviewFile = (path: string) => Promise<Uint8Array | ArrayBuffer>;

export type HtmlPreviewReadFile = ReadPreviewFile;

export type HtmlPreviewBuildOptions = {
  filePath?: string;
};

export type HtmlPreviewInlineOptions = {
  filePath?: string;
  readFile: ReadPreviewFile;
};

function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;');
}

function encodePathForFileUrl(pathname: string): string {
  return pathname
    .split('/')
    .map((part) => {
      if (part === '' || /^[A-Za-z]:$/.test(part)) return part;
      return encodeURIComponent(part);
    })
    .join('/');
}

function stripUrlSuffix(url: string): string {
  return url.split(/[?#]/, 1)[0];
}

function isRelativeLocalUrl(url: string): boolean {
  const value = url.trim();
  if (!value || value.startsWith('#') || value.startsWith('//')) return false;
  if (/^[A-Za-z][A-Za-z\d+.-]*:/.test(value)) return false;
  return true;
}

function decodeResourcePath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function normalizePathParts(parts: string[]): string[] {
  const normalized: string[] = [];
  parts.forEach((part) => {
    if (!part || part === '.') return;
    if (part === '..') {
      normalized.pop();
      return;
    }
    normalized.push(part);
  });
  return normalized;
}

export function resolveLocalResourcePath(filePath: string | undefined, resourceUrl: string): string | undefined {
  if (!filePath || !isRelativeLocalUrl(resourceUrl)) return undefined;

  const usesWindowsSeparators = filePath.includes('\\');
  const normalizedFilePath = filePath.replaceAll('\\', '/');
  const lastSlash = normalizedFilePath.lastIndexOf('/');
  if (lastSlash < 0) return undefined;

  const directory = normalizedFilePath.slice(0, lastSlash + 1);
  const resourcePath = decodeResourcePath(stripUrlSuffix(resourceUrl)).replaceAll('\\', '/');
  const joined = `${directory}${resourcePath}`;
  const hasLeadingSlash = joined.startsWith('/');
  const parts = normalizePathParts(joined.split('/'));
  const normalized = `${hasLeadingSlash ? '/' : ''}${parts.join('/')}`;

  return usesWindowsSeparators ? normalized.replaceAll('/', '\\') : normalized;
}

export function createFileBaseHref(filePath?: string): string | undefined {
  if (!filePath) return undefined;

  const normalized = filePath.replaceAll('\\', '/');
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash < 0) return undefined;

  const directory = normalized.slice(0, lastSlash + 1);
  if (!directory || directory === './' || directory === '../') return undefined;

  const encoded = encodePathForFileUrl(directory);
  return encoded.startsWith('/') ? `file://${encoded}` : `file:///${encoded}`;
}

function bytesToText(data: Uint8Array | ArrayBuffer): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  return new TextDecoder('utf-8').decode(bytes);
}

function bytesToBase64(data: Uint8Array | ArrayBuffer): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = '';
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function mimeTypeForPath(path: string): string {
  const ext = stripUrlSuffix(path).split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'css':
      return 'text/css';
    case 'js':
    case 'mjs':
      return 'text/javascript';
    case 'svg':
      return 'image/svg+xml';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'avif':
      return 'image/avif';
    case 'mp4':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'woff':
      return 'font/woff';
    case 'woff2':
      return 'font/woff2';
    default:
      return 'application/octet-stream';
  }
}

async function readLocalResource(
  filePath: string | undefined,
  resourceUrl: string,
  readFile: ReadPreviewFile,
): Promise<{ path: string; data: Uint8Array | ArrayBuffer } | null> {
  const path = resolveLocalResourcePath(filePath, resourceUrl);
  if (!path) return null;

  try {
    return { path, data: await readFile(path) };
  } catch {
    return null;
  }
}

function parseHtmlDocument(source: string): Document {
  const parser = new DOMParser();
  const hasDocumentShell = /<html\b/i.test(source);
  const html = hasDocumentShell
    ? source
    : `<!doctype html><html><head></head><body>${source}</body></html>`;
  return parser.parseFromString(html, 'text/html');
}

async function inlineScriptResources(
  doc: Document,
  filePath: string | undefined,
  readFile: ReadPreviewFile,
) {
  const scripts = Array.from(doc.querySelectorAll<HTMLScriptElement>('script[src]'));
  await Promise.all(scripts.map(async (script) => {
    const src = script.getAttribute('src');
    if (!src) return;

    const resource = await readLocalResource(filePath, src, readFile);
    if (!resource) return;

    script.removeAttribute('src');
    script.textContent = bytesToText(resource.data);
  }));
}

async function inlineStylesheetResources(
  doc: Document,
  filePath: string | undefined,
  readFile: ReadPreviewFile,
) {
  const links = Array.from(doc.querySelectorAll<HTMLLinkElement>('link[href]'));
  await Promise.all(links.map(async (link) => {
    const rel = link.getAttribute('rel') ?? '';
    const href = link.getAttribute('href');
    if (!href || !rel.split(/\s+/).some((item) => item.toLowerCase() === 'stylesheet')) return;

    const resource = await readLocalResource(filePath, href, readFile);
    if (!resource) return;

    const style = doc.createElement('style');
    const media = link.getAttribute('media');
    if (media) style.setAttribute('media', media);
    style.textContent = bytesToText(resource.data);
    link.replaceWith(style);
  }));
}

async function inlineBinaryElementAttribute(
  elements: Element[],
  attributeName: string,
  filePath: string | undefined,
  readFile: ReadPreviewFile,
) {
  await Promise.all(elements.map(async (element) => {
    const value = element.getAttribute(attributeName);
    if (!value) return;

    const resource = await readLocalResource(filePath, value, readFile);
    if (!resource) return;

    const mimeType = mimeTypeForPath(resource.path);
    element.setAttribute(attributeName, `data:${mimeType};base64,${bytesToBase64(resource.data)}`);
  }));
}

async function inlineBinaryResources(
  doc: Document,
  filePath: string | undefined,
  readFile: ReadPreviewFile,
) {
  await Promise.all([
    inlineBinaryElementAttribute(Array.from(doc.querySelectorAll('img[src], source[src], video[src], audio[src]')), 'src', filePath, readFile),
    inlineBinaryElementAttribute(Array.from(doc.querySelectorAll('video[poster]')), 'poster', filePath, readFile),
  ]);
}

async function inlineLocalResources(
  source: string,
  filePath: string | undefined,
  readFile: ReadPreviewFile,
): Promise<string> {
  if (!filePath) return source;

  const doc = parseHtmlDocument(source);
  await Promise.all([
    inlineScriptResources(doc, filePath, readFile),
    inlineStylesheetResources(doc, filePath, readFile),
    inlineBinaryResources(doc, filePath, readFile),
  ]);

  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}

function injectBaseTag(html: string, baseHref?: string): string {
  if (!baseHref) return html;
  if (/<base\b[^>]*href\s*=/i.test(html)) return html;

  const baseTag = `<base href="${escapeAttribute(baseHref)}">`;
  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/<head\b[^>]*>/i, (match) => `${match}\n${baseTag}`);
  }

  if (/<html\b[^>]*>/i.test(html)) {
    return html.replace(/<html\b[^>]*>/i, (match) => `${match}\n<head>${baseTag}</head>`);
  }

  return `<!doctype html><html><head>${baseTag}</head><body>${html}</body></html>`;
}

// 给一段 HTML 源(完整 HTML 或片段)注入 base href 并补齐文档骨架。
// 不读任何外部资源,适合在 Tauri 之外的纯前端/jsdom 环境跑测试。
export function buildHtmlPreviewDocument(source: string, options: HtmlPreviewBuildOptions = {}): string {
  const hasDocumentShell = /<html\b/i.test(source);
  const baseHref = createFileBaseHref(options.filePath);
  const shell = hasDocumentShell
    ? source
    : `<!doctype html><html><head></head><body>${source}</body></html>`;

  return injectBaseTag(shell, baseHref);
}

// 在 buildHtmlPreviewDocument 基础上,额外把本地 CSS / JS / 图片 / 媒体资源
// 内联进文档,让产物在 sandbox iframe 里"打开就能看"。资源读取失败时跳过,
// 不会阻断整个预览。
export async function buildHtmlPreviewDocumentWithLocalResources(
  source: string,
  options: HtmlPreviewInlineOptions,
): Promise<string> {
  const inlinedSource = await inlineLocalResources(source, options.filePath, options.readFile);
  return buildHtmlPreviewDocument(inlinedSource, { filePath: options.filePath });
}