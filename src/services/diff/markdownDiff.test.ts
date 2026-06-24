import { describe, expect, it } from 'vitest';
import {
  countDecidableHunks,
  diffMarkdown,
  isDecidableHunk,
  mergeDecisions,
  splitParagraphs,
} from './markdownDiff';

describe('splitParagraphs', () => {
  it('按空行分段,过滤空段', () => {
    expect(splitParagraphs('a\n\nb\n\n\nc')).toEqual(['a', 'b', 'c']);
  });

  it('保留段内单个换行(如列表)', () => {
    expect(splitParagraphs('- 一\n- 二\n\n下一段')).toEqual(['- 一\n- 二', '下一段']);
  });

  it('空字符串 → 空数组', () => {
    expect(splitParagraphs('')).toEqual([]);
    expect(splitParagraphs('   \n\n   ')).toEqual([]);
  });
});

describe('diffMarkdown', () => {
  it('完全相同 → 全 unchanged', () => {
    const hunks = diffMarkdown('a\n\nb\n\nc', 'a\n\nb\n\nc');
    expect(hunks).toEqual([
      { kind: 'unchanged', content: 'a' },
      { kind: 'unchanged', content: 'b' },
      { kind: 'unchanged', content: 'c' },
    ]);
  });

  it('中间一段被改 → 标 modified', () => {
    const hunks = diffMarkdown('a\n\nb\n\nc', 'a\n\nB!\n\nc');
    expect(hunks).toEqual([
      { kind: 'unchanged', content: 'a' },
      { kind: 'modified', before: 'b', after: 'B!' },
      { kind: 'unchanged', content: 'c' },
    ]);
  });

  it('proposed 多一段 → added', () => {
    const hunks = diffMarkdown('a\n\nc', 'a\n\nb\n\nc');
    expect(hunks).toEqual([
      { kind: 'unchanged', content: 'a' },
      { kind: 'added', content: 'b' },
      { kind: 'unchanged', content: 'c' },
    ]);
  });

  it('original 多一段 → removed', () => {
    const hunks = diffMarkdown('a\n\nb\n\nc', 'a\n\nc');
    expect(hunks).toEqual([
      { kind: 'unchanged', content: 'a' },
      { kind: 'removed', content: 'b' },
      { kind: 'unchanged', content: 'c' },
    ]);
  });

  it('整篇被重写(全无公共段) → 全部采纳得 proposed、全部拒绝得 original', () => {
    const hunks = diffMarkdown('原 1\n\n原 2', '新 1\n\n新 2');
    const decisions = new Array(countDecidableHunks(hunks)).fill('accept' as const);
    expect(mergeDecisions(hunks, decisions)).toBe('新 1\n\n新 2');
    const rejects = new Array(countDecidableHunks(hunks)).fill('reject' as const);
    expect(mergeDecisions(hunks, rejects)).toBe('原 1\n\n原 2');
  });

  it('空 original → 全 added', () => {
    const hunks = diffMarkdown('', 'a\n\nb');
    expect(hunks).toEqual([
      { kind: 'added', content: 'a' },
      { kind: 'added', content: 'b' },
    ]);
  });

  it('空 proposed → 全 removed', () => {
    const hunks = diffMarkdown('a\n\nb', '');
    expect(hunks).toEqual([
      { kind: 'removed', content: 'a' },
      { kind: 'removed', content: 'b' },
    ]);
  });
});

describe('mergeDecisions', () => {
  it('全部采纳 → 等同 proposed', () => {
    const hunks = diffMarkdown('a\n\nb\n\nc', 'a\n\nB!\n\nc\n\nD');
    // hunks: unchanged 'a', modified b→B!, unchanged 'c', added 'D'
    expect(countDecidableHunks(hunks)).toBe(2);
    const merged = mergeDecisions(hunks, ['accept', 'accept']);
    expect(merged).toBe('a\n\nB!\n\nc\n\nD');
  });

  it('全部拒绝 → 等同 original', () => {
    const hunks = diffMarkdown('a\n\nb\n\nc', 'a\n\nB!\n\nc\n\nD');
    const merged = mergeDecisions(hunks, ['reject', 'reject']);
    expect(merged).toBe('a\n\nb\n\nc');
  });

  it('部分采纳 modified、拒绝 added', () => {
    const hunks = diffMarkdown('a\n\nb\n\nc', 'a\n\nB!\n\nc\n\nD');
    const merged = mergeDecisions(hunks, ['accept', 'reject']);
    expect(merged).toBe('a\n\nB!\n\nc');
  });

  it('removed:reject 表示「保留原段」', () => {
    const hunks = diffMarkdown('a\n\nb\n\nc', 'a\n\nc');
    // hunks: unchanged a, removed b, unchanged c
    expect(countDecidableHunks(hunks)).toBe(1);
    const keepOriginal = mergeDecisions(hunks, ['reject']);
    expect(keepOriginal).toBe('a\n\nb\n\nc');
    const acceptDelete = mergeDecisions(hunks, ['accept']);
    expect(acceptDelete).toBe('a\n\nc');
  });

  it('decisions 不足时 → 缺省采纳', () => {
    const hunks = diffMarkdown('a\n\nb', 'A!\n\nB!');
    const merged = mergeDecisions(hunks, []);
    expect(merged).toBe('A!\n\nB!');
  });
});

describe('isDecidableHunk', () => {
  it('unchanged 不可决策,其他都可', () => {
    expect(isDecidableHunk({ kind: 'unchanged', content: 'a' })).toBe(false);
    expect(isDecidableHunk({ kind: 'modified', before: 'a', after: 'b' })).toBe(true);
    expect(isDecidableHunk({ kind: 'added', content: 'a' })).toBe(true);
    expect(isDecidableHunk({ kind: 'removed', content: 'a' })).toBe(true);
  });
});
