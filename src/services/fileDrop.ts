const OPENABLE_EXTENSIONS = new Set(['md', 'markdown', 'html', 'htm', 'docx']);

export function isOpenableDocumentPath(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase();
  return ext ? OPENABLE_EXTENSIONS.has(ext) : false;
}

export function firstOpenableDocumentPath(paths: string[]): string | null {
  return paths.find(isOpenableDocumentPath) ?? null;
}
