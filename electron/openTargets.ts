import * as path from 'path';

const OPENABLE_DOCUMENT_EXTENSIONS = new Set(['.md', '.markdown', '.mdx', '.txt']);

export function extractOpenDocumentPaths(argv: string[], cwd = process.cwd()) {
  const seen = new Set<string>();
  const paths: string[] = [];

  for (const rawArg of argv.slice(1)) {
    const value = rawArg.trim();
    if (!value || value === '.' || value.startsWith('-')) {
      continue;
    }

    const resolvedPath = path.resolve(cwd, value);
    if (!OPENABLE_DOCUMENT_EXTENSIONS.has(path.extname(resolvedPath).toLowerCase())) {
      continue;
    }

    const dedupeKey = process.platform === 'win32'
      ? resolvedPath.toLowerCase()
      : resolvedPath;

    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    paths.push(resolvedPath);
  }

  return paths;
}
