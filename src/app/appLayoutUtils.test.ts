import { describe, expect, it } from 'vitest';
import { extractToc } from './appLayoutUtils';

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
