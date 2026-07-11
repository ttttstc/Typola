import { describe, expect, it, vi } from 'vitest';
import {
  analyzeMarkdown,
  clearMarkdownAnalysisCache,
  findMarkdownLinkAt,
  findMarkdownTaskAt,
  headingPathAt,
  isRangeWithinSingleMarkdownBlock,
  markdownBlockAt,
  scheduleMarkdownAnalysis,
} from './markdownAnalysisService';

const fixture = [
  '# 总览',
  '',
  '- [ ] 待办',
  '  - [x] 已完成',
  '',
  '[官网](https://typola.dev "主页")',
  '![封面](./cover.png "图片")',
  '',
  '```mermaid',
  'graph TD',
  '```',
  '',
  '```math',
  'x^2',
  '```',
  '',
  '$$',
  'E = mc^2',
  '$$',
  '',
  '| 名称 | 值 |',
  '| --- | --- |',
  '| A | B |',
  '',
  '## 子节',
  '',
  '```md',
  '# 不是标题',
  '- [ ] 不是任务',
  '[不是链接](https://example.com)',
  '```',
].join('\n');

describe('markdownAnalysisService', () => {
  it('collects Markdown structure from one source of truth', () => {
    const result = analyzeMarkdown(fixture);

    expect(result.headings.map(({ text, level }) => [text, level])).toEqual([['总览', 1], ['子节', 2]]);
    expect(result.foldSections).toHaveLength(2);
    expect(result.foldSections[0]).toMatchObject({ title: '总览', level: 1 });
    expect(result.tasks.map(({ checked, text, depth }) => [checked, text, depth])).toEqual([
      [false, '待办', 0],
      [true, '已完成', 1],
    ]);
    expect(result.links).toEqual([expect.objectContaining({ label: '官网', url: 'https://typola.dev', title: '主页' })]);
    expect(result.images).toEqual([expect.objectContaining({ alt: '封面', src: './cover.png', title: '图片' })]);
    expect(result.codeBlocks.map(({ language }) => language)).toEqual(['mermaid', 'math', 'md']);
    expect(result.mermaidBlocks).toHaveLength(1);
    expect(result.mathBlocks).toHaveLength(2);
    expect(result.tables).toHaveLength(1);
    expect(result.stats.words).toBeGreaterThan(0);
    expect(result.stats.cjkCharacters).toBeGreaterThan(0);
  });

  it('caches identical source hashes and invalidates changed source', () => {
    clearMarkdownAnalysisCache();
    const first = analyzeMarkdown('# A');
    expect(analyzeMarkdown('# A')).toBe(first);
    expect(analyzeMarkdown('# B')).not.toBe(first);
  });

  it('publishes analysis after the requested debounce delay', () => {
    vi.useFakeTimers();
    const onResult = vi.fn();
    scheduleMarkdownAnalysis('# 延迟标题', onResult, 180);

    vi.advanceTimersByTime(179);
    expect(onResult).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({
      headings: [expect.objectContaining({ text: '延迟标题' })],
    }));
    vi.useRealTimers();
  });

  it('keeps a 10k-line document within the synchronous analysis budget', () => {
    const source = Array.from({ length: 10_000 }, (_, index) => (
      index % 100 === 0 ? `## 第 ${index} 节` : `第 ${index} 行正文 with words`
    )).join('\n');
    const startedAt = performance.now();
    const result = analyzeMarkdown(source);

    expect(result.headings).toHaveLength(100);
    expect(performance.now() - startedAt).toBeLessThan(1_500);
  });
});

describe('markdownAnalysisService structure helpers', () => {
  clearMarkdownAnalysisCache();

  it('finds task and link by offset and ignores fenced pseudo ones', () => {
    const analysis = analyzeMarkdown(fixture);
    const firstTask = analysis.tasks[0];
    expect(firstTask).toBeDefined();
    const inFirstTask = findMarkdownTaskAt(fixture, firstTask.from + 2);
    expect(inFirstTask?.text).toBe(firstTask.text);

    // fenced code 内伪 task 不应命中
    const fencedTask = fixture.indexOf('- [ ] 不是任务');
    expect(fencedTask).toBeGreaterThan(-1);
    expect(findMarkdownTaskAt(fixture, fencedTask + 3)).toBeNull();

    const firstLink = analysis.links[0];
    expect(firstLink).toBeDefined();
    expect(findMarkdownLinkAt(fixture, firstLink.from + 1)?.url).toBe(firstLink.url);

    // fenced code 内伪 link 不应命中
    const fencedLink = fixture.indexOf('[不是链接](https://example.com)');
    expect(fencedLink).toBeGreaterThan(-1);
    expect(findMarkdownLinkAt(fixture, fencedLink + 1)).toBeNull();
  });

  it('returns nested heading path at the given offset', () => {
    // 子节 heading 的 from 即光标所在标题行
    const analysis = analyzeMarkdown(fixture);
    const child = analysis.headings.find((h) => h.text === '子节');
    expect(child).toBeDefined();
    expect(headingPathAt(fixture, child!.from + 1)).toEqual(['总览', '子节']);

    // 文档开头属于根标题作用域
    expect(headingPathAt(fixture, 0)).toEqual(['总览']);
  });

  it('identifies special block kinds with correct heading path', () => {
    const analysis = analyzeMarkdown(fixture);
    const code = analysis.codeBlocks.find((b) => b.language === 'math');
    expect(code).toBeDefined();
    const block = markdownBlockAt(fixture, code!.from + 2, code!.from + 3);
    expect(block.kind).toBe('math');
    expect(block.headingPath).toEqual(['总览']);

    const mermaid = analysis.mermaidBlocks[0];
    expect(mermaid).toBeDefined();
    expect(markdownBlockAt(fixture, mermaid.from + 1).kind).toBe('mermaid');

    const table = analysis.tables[0];
    expect(table).toBeDefined();
    expect(markdownBlockAt(fixture, table.from + 1).kind).toBe('table');

    const normal = fixture.indexOf('- [ ] 待办');
    expect(normal).toBeGreaterThan(-1);
    const blockAtNormal = markdownBlockAt(fixture, normal);
    expect(['section', 'paragraph']).toContain(blockAtNormal.kind);
    expect(blockAtNormal.headingPath).toEqual(['总览']);
  });

  it('rejects range crossing code/table/math/mermaid boundaries', () => {
    const analysis = analyzeMarkdown(fixture);
    const code = analysis.codeBlocks[0];
    const outside = code!.from - 2;
    expect(isRangeWithinSingleMarkdownBlock(fixture, outside, code!.to)).toBe(false);

    // 普通段落内
    const todo = fixture.indexOf('- [ ] 待办');
    const lineEnd = fixture.indexOf('\n', todo);
    expect(isRangeWithinSingleMarkdownBlock(fixture, todo, lineEnd)).toBe(true);
  });
});
