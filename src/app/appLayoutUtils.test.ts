import { describe, expect, it } from 'vitest';
import { extractToc, sameLocalPath } from './appLayoutUtils';

describe('extractToc', () => {
  it('ignores ATX-like headings inside fenced code blocks', () => {
    expect(extractToc([
      '# Title',
      '',
      '```ts',
      '# not a heading',
      '## also not a heading',
      '```',
      '',
      '## Real section',
      '',
      '~~~',
      '### ignored too',
      '~~~',
      '',
      '### Next section',
    ].join('\n'))).toEqual([
      { level: 1, text: 'Title', id: 'toc-0' },
      { level: 2, text: 'Real section', id: 'toc-1' },
      { level: 3, text: 'Next section', id: 'toc-2' },
    ]);
  });
});

describe('sameLocalPath', () => {
  it('统一 Windows 分隔符和大小写比较路径', () => {
    expect(sameLocalPath(String.raw`D:\Docs\Article.md`, 'd:/docs/article.md')).toBe(true);
    expect(sameLocalPath('D:/docs/article.md', 'D:/docs/review.md')).toBe(false);
  });
});
