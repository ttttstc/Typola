// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  SELF_WRITE_GRACE_MS,
  matchesWatchedFile,
  rememberRecentWrite,
  shouldIgnoreWatchEvent,
} from '../electron/fileWatch';

describe('file watch helpers', () => {
  it('matches events for the watched file name', () => {
    expect(matchesWatchedFile('C:\\workspace\\note.md', 'note.md')).toBe(true);
    expect(matchesWatchedFile('C:\\workspace\\note.md', Buffer.from('note.md'))).toBe(true);
    expect(matchesWatchedFile('C:\\workspace\\note.md', 'other.md')).toBe(false);
    expect(matchesWatchedFile('C:\\workspace\\note.md')).toBe(true);
  });

  it('suppresses self-triggered writes only within the grace period', () => {
    const recentWrites = new Map<string, number>();

    rememberRecentWrite(recentWrites, 'C:\\workspace\\note.md', 100);

    expect(shouldIgnoreWatchEvent(recentWrites, 'C:\\workspace\\note.md', 100 + SELF_WRITE_GRACE_MS - 1)).toBe(true);
    expect(shouldIgnoreWatchEvent(recentWrites, 'C:\\workspace\\note.md', 100 + SELF_WRITE_GRACE_MS + 1)).toBe(false);
    expect(recentWrites.has('C:\\workspace\\note.md')).toBe(false);
  });
});
