import { describe, expect, it, vi } from 'vitest';
import { analyzeMarkdown, clearMarkdownAnalysisCache, scheduleMarkdownAnalysis } from './markdownAnalysisService';

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
