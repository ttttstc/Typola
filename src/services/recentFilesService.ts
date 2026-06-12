export type RecentFile = {
  path: string;
  name: string;
  openedAt: number;
};

const RECENT_FILES_KEY = 'typola-recent-files';
const RECENT_FILES_LIMIT = 20;

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase();
}

function parseRecentFiles(raw: string | null): RecentFile[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): RecentFile[] => {
      if (!item || typeof item !== 'object') return [];
      const path = typeof item.path === 'string' ? item.path : '';
      if (!path) return [];
      return [{
        path,
        name: typeof item.name === 'string' && item.name ? item.name : fileNameFromPath(path),
        openedAt: typeof item.openedAt === 'number' ? item.openedAt : 0,
      }];
    });
  } catch {
    return [];
  }
}

function saveRecentFiles(files: readonly RecentFile[]): void {
  localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(files.slice(0, RECENT_FILES_LIMIT)));
  window.dispatchEvent(new CustomEvent('typola-recent-files-changed'));
}

export function getRecentFiles(): RecentFile[] {
  return parseRecentFiles(localStorage.getItem(RECENT_FILES_KEY));
}

export function addRecentFile(path: string, name = fileNameFromPath(path)): RecentFile[] {
  const normalized = normalizePath(path);
  const next = [
    { path, name, openedAt: Date.now() },
    ...getRecentFiles().filter((file) => normalizePath(file.path) !== normalized),
  ].slice(0, RECENT_FILES_LIMIT);
  saveRecentFiles(next);
  return next;
}

export function removeRecentFile(path: string): RecentFile[] {
  const normalized = normalizePath(path);
  const next = getRecentFiles().filter((file) => normalizePath(file.path) !== normalized);
  saveRecentFiles(next);
  return next;
}

export function filterRecentFiles(files: readonly RecentFile[], query: string): RecentFile[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...files];
  return files.filter((file) => {
    const haystack = `${file.name}\n${file.path}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}
