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

  // P0-6:markdown 结构化块要整块切段,不被空行或内部内容切开
  it('YAML frontmatter 整块作为独立段', () => {
    const text = '---\ntitle: 周报\ndate: 2026-06-24\n---\n\n第一段正文';
    expect(splitParagraphs(text)).toEqual([
      '---\ntitle: 周报\ndate: 2026-06-24\n---',
      '第一段正文',
    ]);
  });

  it('围栏代码块 ``` 整块作为独立段,不被内部空行切开', () => {
    const text = '前文\n\n```ts\nconst a = 1;\n\nconst b = 2;\n```\n\n后文';
    expect(splitParagraphs(text)).toEqual([
      '前文',
      '```ts\nconst a = 1;\n\nconst b = 2;\n```',
      '后文',
    ]);
  });

  it('围栏代码块 ~~~ 同样整块识别', () => {
    const text = '前\n\n~~~py\nprint(1)\n~~~\n\n后';
    expect(splitParagraphs(text)).toEqual([
      '前',
      '~~~py\nprint(1)\n~~~',
      '后',
    ]);
  });

  it('缩进代码块(4 空格)整块作为独立段', () => {
    const text = '    line1\n    line2\n\n普通段落';
    expect(splitParagraphs(text)).toEqual([
      '    line1\n    line2',
      '普通段落',
    ]);
  });

  it('表格(连续 | 行,至少 2 行)整块识别', () => {
    const text = '段落\n\n| 列1 | 列2 |\n|---|---|\n| a | b |\n\n后段';
    expect(splitParagraphs(text)).toEqual([
      '段落',
      '| 列1 | 列2 |\n|---|---|\n| a | b |',
      '后段',
    ]);
  });

  it('引用块(连续 > 行)整块识别', () => {
    const text = '正文\n\n> 引用一\n> 引用二\n\n后段';
    expect(splitParagraphs(text)).toEqual([
      '正文',
      '> 引用一\n> 引用二',
      '后段',
    ]);
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

// P0-6 集成测试:diff 含 frontmatter 的文档,frontmatter 改了不应连带正文报 modified
describe('diffMarkdown 结构化块切段(P0-6)', () => {
  it('frontmatter 改了 → 正文段保持 unchanged', () => {
    const orig = '---\ntitle: 周报\n---\n\n第一段正文';
    const prop = '---\ntitle: 周报 2026\n---\n\n第一段正文';
    const hunks = diffMarkdown(orig, prop);
    // frontmatter 应被识别为单独的 modified,正文应是 unchanged
    expect(hunks.some((h) => h.kind === 'unchanged' && h.content === '第一段正文')).toBe(true);
    expect(hunks.some((h) => h.kind === 'modified' && (h as { before: string }).before.includes('title:'))).toBe(true);
  });

  it('代码块内容改了 → 其他段保持 unchanged', () => {
    const orig = '前\n\n```ts\nconst a = 1;\n```\n\n后';
    const prop = '前\n\n```ts\nconst a = 2;\n```\n\n后';
    const hunks = diffMarkdown(orig, prop);
    expect(hunks.some((h) => h.kind === 'unchanged' && h.content === '前')).toBe(true);
    expect(hunks.some((h) => h.kind === 'unchanged' && h.content === '后')).toBe(true);
  });
});

// P0-7:N:M(M>1) 修改应被当一组连续 modified,不被拆成 modified + 独立 added/removed
describe('diffMarkdown N:M block 合并(P0-7)', () => {
  it('1 段被替换成 2 段 → 1 modified + 1 added(同一组)', () => {
    const orig = 'p1\n\np2\n\np3\n\np4';
    const prop = 'p1\n\nN2a\n\nN2b\n\np3\n\np4';
    const hunks = diffMarkdown(orig, prop);
    // 期望:p1 unchanged, p2→N2a modified, N2b added, p3 p4 unchanged
    // 关键:N2b 不应该被孤立成「位置错乱的 added」,应紧跟 modified
    const p1Idx = hunks.findIndex((h) => h.kind === 'unchanged' && h.content === 'p1');
    const p3Idx = hunks.findIndex((h) => h.kind === 'unchanged' && h.content === 'p3');
    expect(p1Idx).toBeLessThan(p3Idx);
    // p1 跟 p3 之间应该是 1 modified + 1 added,共 2 个 decidable
    const between = hunks.slice(p1Idx + 1, p3Idx);
    expect(between.length).toBe(2);
    expect(between.some((h) => h.kind === 'modified')).toBe(true);
    expect(between.some((h) => h.kind === 'added')).toBe(true);
  });

  it('2 段被替换成 2 段(2:2)→ 2 modified 配对', () => {
    const orig = 'head\n\nold1\n\nold2\n\ntail';
    const prop = 'head\n\nnew1\n\nnew2\n\ntail';
    const hunks = diffMarkdown(orig, prop);
    const headIdx = hunks.findIndex((h) => h.kind === 'unchanged' && h.content === 'head');
    const tailIdx = hunks.findIndex((h) => h.kind === 'unchanged' && h.content === 'tail');
    const between = hunks.slice(headIdx + 1, tailIdx);
    expect(between.length).toBe(2);
    expect(between.every((h) => h.kind === 'modified')).toBe(true);
  });

  it('3 段被替换成 1 段(3:1)→ 1 modified + 2 removed(剩余成组)', () => {
    const orig = 'head\n\no1\n\no2\n\no3\n\ntail';
    const prop = 'head\n\nN1\n\ntail';
    const hunks = diffMarkdown(orig, prop);
    const headIdx = hunks.findIndex((h) => h.kind === 'unchanged' && h.content === 'head');
    const tailIdx = hunks.findIndex((h) => h.kind === 'unchanged' && h.content === 'tail');
    const between = hunks.slice(headIdx + 1, tailIdx);
    // 1 modified + 2 removed,总共 3 个 decidable
    expect(between.length).toBe(3);
    expect(between.filter((h) => h.kind === 'modified').length).toBe(1);
    expect(between.filter((h) => h.kind === 'removed').length).toBe(2);
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
