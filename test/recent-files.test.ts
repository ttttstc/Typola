import { describe, expect, it } from 'vitest';
import * as path from 'path';
import { addRecentFile, type RecentEntry } from '../electron/recentFiles';

describe('addRecentFile', () => {
  it('prepends a new file to the list', () => {
    const result = addRecentFile([], '/foo/bar.md');
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe(path.normalize('/foo/bar.md'));
  });

  it('deduplicates by normalized path', () => {
    const initial: RecentEntry[] = [
      { path: path.normalize('/foo/bar.md'), addedAt: 1 },
      { path: path.normalize('/foo/baz.md'), addedAt: 2 },
    ];
    const result = addRecentFile(initial, '/foo/bar.md');
    expect(result).toHaveLength(2);
    expect(result[0].path).toBe(path.normalize('/foo/bar.md'));
    expect(result[1].path).toBe(path.normalize('/foo/baz.md'));
  });

  it('caps the list at 10 entries', () => {
    let entries: RecentEntry[] = [];
    for (let i = 0; i < 15; i += 1) {
      entries = addRecentFile(entries, `/file-${i}.md`);
    }
    expect(entries).toHaveLength(10);
    expect(entries[0].path).toBe(path.normalize('/file-14.md'));
  });
});
