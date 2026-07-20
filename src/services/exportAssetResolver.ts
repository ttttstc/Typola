import { isRemoteImageSrc, resolveCopyDestination } from './imageInsert';

type FileOps = { mkdir(path: string, options: { recursive: boolean }): Promise<void>; copyFile(from: string, to: string): Promise<void> };

export async function copyHtmlExportAssets(html: string, exportPath: string, documentPath: string, destination: string, ops: FileOps): Promise<string> {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const documentDir = dirname(documentPath); const exportDir = dirname(exportPath);
  const assetDir = resolveCopyDestination(documentPath, destination).replace(/\\/gu, '/').replace(/^\.\//u, '');
  for (const image of doc.images) {
    const src = image.getAttribute('src') ?? '';
    if (!src || isRemoteImageSrc(src) || /^[a-z]+:/iu.test(src) || src.startsWith('/')) continue;
    const name = basename(decodeURI(src)); if (!name) continue;
    const targetDir = join(exportDir, assetDir); const target = join(targetDir, name);
    try { await ops.mkdir(targetDir, { recursive: true }); await ops.copyFile(join(documentDir, src), target); image.setAttribute('src', `${assetDir}/${name}`); } catch { /* missing local files stay untouched */ }
  }
  return doc.body.innerHTML;
}

function dirname(path: string) { const value = path.replace(/\\/gu, '/'); return value.slice(0, Math.max(0, value.lastIndexOf('/'))); }
function basename(path: string) { return path.replace(/\\/gu, '/').split('/').pop() ?? ''; }
function join(left: string, right: string) { return `${left.replace(/[\\/]$/u, '')}/${right.replace(/^[\\/]/u, '')}`; }
