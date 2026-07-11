import { describe, expect, it } from 'vitest';
import { _clearMarkdownAnalysisCacheForTests, analyzeMarkdown } from './markdownAnalysisService';

describe('markdownAnalysisService', () => {
  it('collects ATX and Setext headings while ignoring fenced examples', () => {
    const result = analyzeMarkdown([
      '# 总览',
      '',
      '子节',
      '=====',
      '',
      '```md',
      '# 不是标题',
      '```',
      '',
      '### 收尾 ###',
    ].join('\r\n'));

    expect(result.headings.map(({ text, level }) => [text, level])).toEqual([
      ['总览', 1],
      ['子节', 1],
      ['收尾', 3],
    ]);
    expect(result.foldSections).toHaveLength(3);
    expect(result.foldSections[0]).toMatchObject({ title: '总览', level: 1, lineFrom: 1 });
  });

  it('keeps document statistics compatible and reports zero minutes for empty text', () => {
    expect(analyzeMarkdown('').stats).toEqual({ characters: 0, words: 0, paragraphs: 0, readingMinutes: 0 });
    expect(analyzeMarkdown('# 标题\n\nHello world，这是正文。').stats).toMatchObject({
      words: 8,
      paragraphs: 2,
      readingMinutes: 1,
    });
  });

  it('caches identical source hashes and invalidates changed source', () => {
    _clearMarkdownAnalysisCacheForTests();
    const first = analyzeMarkdown('# A');
    expect(analyzeMarkdown('# A')).toBe(first);
    expect(analyzeMarkdown('# B')).not.toBe(first);
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
