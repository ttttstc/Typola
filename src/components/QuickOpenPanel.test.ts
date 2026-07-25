import { describe, expect, it } from 'vitest';
import { quickOpenDisplay } from '../services/quickOpenDisplay';

describe('quickOpenDisplay', () => {
  it('does not expose internal untitled ids', () => {
    expect(quickOpenDisplay({
      name: '未命名.md',
      path: 'untitled-2-1720000000000-abc123',
      openedAt: 0,
    })).toEqual({ name: '未命名文档', path: '尚未保存' });
  });

  it('keeps saved file names and paths', () => {
    expect(quickOpenDisplay({
      name: 'notes.md',
      path: 'D:/docs/notes.md',
      openedAt: 0,
    })).toEqual({ name: 'notes.md', path: 'D:/docs/notes.md' });
  });

  it('does not hide real files whose names begin with untitled', () => {
    expect(quickOpenDisplay({
      name: 'untitled-draft.md',
      path: 'D:/docs/untitled-draft.md',
      openedAt: 0,
    })).toEqual({ name: 'untitled-draft.md', path: 'D:/docs/untitled-draft.md' });
  });
});
