import * as path from 'path';

export const SELF_WRITE_GRACE_MS = 1500;

export function rememberRecentWrite(recentWrites: Map<string, number>, filePath: string, now = Date.now()) {
  recentWrites.set(filePath, now);
}

export function shouldIgnoreWatchEvent(
  recentWrites: Map<string, number>,
  filePath: string,
  now = Date.now(),
  graceMs = SELF_WRITE_GRACE_MS
) {
  const lastWrittenAt = recentWrites.get(filePath);
  if (lastWrittenAt === undefined) return false;

  if (now - lastWrittenAt <= graceMs) {
    return true;
  }

  recentWrites.delete(filePath);
  return false;
}

export function matchesWatchedFile(filePath: string, filename?: string | Buffer | null) {
  if (!filename) return true;

  return filename.toString() === path.basename(filePath);
}
