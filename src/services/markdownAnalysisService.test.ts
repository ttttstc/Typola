import { describe, expect, it } from 'vitest';
import {
  analyzeMarkdown,
  _clearMarkdownAnalysisCacheForTests,
  clearMarkdownAnalysisCache,
  findMarkdownLinkAt,
  findMarkdownTaskAt,
  headingPathAt,
  isRangeWithinSingleMarkdownBlock,
  listMarkdownTasks,
  markdownBlockAt,
  detectFrontmatter,
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
  it('detects only leading YAML frontmatter and excludes it from headings', () => {
    const source = '---\ntitle: 草稿\n---\n# 正文';
    expect(detectFrontmatter(source)).toMatchObject({ from: 0, to: 17 });
    expect(analyzeMarkdown(source).headings.map((heading) => heading.text)).toEqual(['正文']);
  });

  it('handles BOM and CRLF frontmatter fences', () => {
    const source = '\uFEFF---\r\ntitle: 草稿\r\n---\r\n# 正文';
    expect(detectFrontmatter(source)).not.toBeNull();
    expect(analyzeMarkdown(source).headings.map((heading) => heading.text)).toEqual(['正文']);
  });

  it('replaces same-level headings in the active heading path', () => {
    const source = '# A\n\n## B\n\n### C\n\n## D\n\n# E';
    expect(headingPathAt(source, source.indexOf('D'))).toEqual(['A', 'D']);
    expect(headingPathAt(source, source.indexOf('E'))).toEqual(['E']);
  });

  it('isolates raw HTML blocks from Markdown scanners', () => {
    const source = '<details><summary>x</summary>![not-image](x.png)</details>\n![real](a.png)';
    const result = analyzeMarkdown(source);
    expect(result.htmlBlocks).toHaveLength(1);
    expect(result.images.map((image) => image.url)).toEqual(['a.png']);
  });
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

  it('refreshes cache recency on hit before evicting the least recently used entry', () => {
    _clearMarkdownAnalysisCacheForTests();
    const sources = Array.from({ length: 24 }, (_, index) => `# 第 ${index} 篇`);
    const first = analyzeMarkdown(sources[0]!);
    const second = analyzeMarkdown(sources[1]!);
    for (const source of sources.slice(2)) analyzeMarkdown(source);

    expect(analyzeMarkdown(sources[0]!)).toBe(first);
    analyzeMarkdown('# 新增缓存项');

    expect(analyzeMarkdown(sources[0]!)).toBe(first);
    expect(analyzeMarkdown(sources[1]!)).not.toBe(second);
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

  it('filters task navigation results by checked state', () => {
    expect(listMarkdownTasks(fixture, { checked: false }).map((task) => task.text)).toEqual(['待办']);
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
