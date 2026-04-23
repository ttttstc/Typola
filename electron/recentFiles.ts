import * as fs from 'fs';
import * as path from 'path';

const MAX_RECENT = 10;
const FILE_NAME = 'recent-files.json';

export interface RecentEntry {
  path: string;
  addedAt: number;
}

function getStoragePath(userDataDir: string) {
  return path.join(userDataDir, FILE_NAME);
}

export function loadRecentFiles(userDataDir: string): RecentEntry[] {
  try {
    const raw = fs.readFileSync(getStoragePath(userDataDir), 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is RecentEntry =>
        !!item && typeof item.path === 'string' && typeof item.addedAt === 'number'
      )
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function saveRecentFiles(userDataDir: string, entries: RecentEntry[]) {
  try {
    fs.writeFileSync(
      getStoragePath(userDataDir),
      JSON.stringify(entries.slice(0, MAX_RECENT), null, 2),
      'utf-8'
    );
  } catch {
    // best-effort
  }
}

export function addRecentFile(entries: RecentEntry[], filePath: string): RecentEntry[] {
  const normalized = path.normalize(filePath);
  const filtered = entries.filter((entry) => path.normalize(entry.path) !== normalized);
  return [{ path: normalized, addedAt: Date.now() }, ...filtered].slice(0, MAX_RECENT);
}

export function pruneMissingRecentFiles(entries: RecentEntry[]): RecentEntry[] {
  return entries.filter((entry) => {
    try {
      return fs.existsSync(entry.path);
    } catch {
      return false;
    }
  });
}
