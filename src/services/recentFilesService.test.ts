import { beforeEach, describe, expect, it } from 'vitest';
import { addRecentFile, filterRecentFiles, getRecentFiles, removeRecentFile } from './recentFilesService';

describe('recentFilesService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('deduplicates and keeps newest files first', () => {
    addRecentFile('D:/docs/a.md', 'a.md');
    addRecentFile('D:/docs/b.md', 'b.md');
    addRecentFile('D:/docs/a.md', 'a.md');
    expect(getRecentFiles().map((file) => file.name)).toEqual(['a.md', 'b.md']);
  });

  it('filters by file name or path', () => {
    const files = [
      { path: 'D:/docs/alpha.md', name: 'alpha.md', openedAt: 2 },
      { path: 'D:/notes/beta.md', name: 'beta.md', openedAt: 1 },
    ];
    expect(filterRecentFiles(files, 'notes').map((file) => file.name)).toEqual(['beta.md']);
  });

  it('removes missing files', () => {
    addRecentFile('D:/docs/a.md', 'a.md');
    removeRecentFile('D:/docs/a.md');
    expect(getRecentFiles()).toEqual([]);
  });
});
