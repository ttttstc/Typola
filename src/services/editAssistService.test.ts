import { describe, expect, it } from 'vitest';
import { createImageMarkdown, createLinkMarkdown, createTableMarkdown } from './editAssistService';

describe('editAssistService', () => {
  it('creates common markdown snippets', () => {
    expect(createLinkMarkdown('Typola', 'https://example.com')).toBe('[Typola](https://example.com)');
    expect(createImageMarkdown('图', './assets/a.png')).toBe('![图](./assets/a.png)');
    expect(createTableMarkdown(3, 2)).toContain('| 列 1 | 列 2 |');
  });
});
