// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { markdownToExportHtml } from './markdownExportRenderer';
import { renderMermaidIn } from './mermaidRenderer';
import { resolveLocalImages } from './localImageResolver';

vi.mock('./mermaidRenderer', () => ({ renderMermaidIn: vi.fn(async () => undefined) }));
vi.mock('./localImageResolver', () => ({ resolveLocalImages: vi.fn(async () => undefined) }));

describe('markdownToExportHtml', () => {
  afterEach(() => vi.clearAllMocks());

  it('renders GFM, highlighted code, KaTeX and sanitizes raw HTML without Vditor', async () => {
    const html = await markdownToExportHtml(
      '# 标题\n\n- [x] 完成\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n```ts\nconst value = 1\n```\n\n$E=mc^2$\n\n<script>alert(1)</script>',
      { filePath: 'D:\\docs\\a.md', theme: 'dark' },
    );

    expect(html).toContain('<h1>标题</h1>');
    expect(html).toContain('<input type="checkbox" checked="" disabled="">');
    expect(html).toContain('<table>');
    expect(html).toContain('hljs');
    expect(html).toContain('katex');
    expect(html).not.toContain('<script>');
    expect(renderMermaidIn).toHaveBeenCalledWith(expect.any(HTMLDivElement), { theme: 'dark' });
    expect(resolveLocalImages).toHaveBeenCalledWith(expect.any(HTMLDivElement), 'D:\\docs\\a.md');
  });

  it('renders into an existing target and clears it for empty source', async () => {
    const target = document.createElement('div');
    const html = await markdownToExportHtml('# 预览', { target });
    expect(html).toContain('<h1>预览</h1>');
    expect(target.innerHTML).toBe(html);
    await expect(markdownToExportHtml('', { target })).resolves.toBe('');
    expect(target.innerHTML).toBe('');
  });

  it('strips leading frontmatter before export', async () => {
    await expect(markdownToExportHtml('---\ntitle: 草稿\n---\n# 正文')).resolves.not.toContain('title: 草稿');
  });
});
