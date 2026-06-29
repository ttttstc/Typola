// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import Vditor from 'vditor';
import { markdownToExportHtml } from './markdownExportRenderer';
import { renderMermaidIn } from './mermaidRenderer';
import { resolveLocalImages } from './localImageResolver';

vi.mock('vditor', () => ({
  default: {
    preview: vi.fn((element: HTMLElement, markdown: string, options: { after?: () => void }) => {
      element.innerHTML = markdown
        .replace(/^# (.+)$/m, '<h1>$1</h1>')
        .replace(/\n\n(.+)$/m, '<p>$1</p>');
      options.after?.();
    }),
  },
}));

vi.mock('vditor/dist/index.css', () => ({}));

vi.mock('./mermaidRenderer', () => ({
  renderMermaidIn: vi.fn(async () => undefined),
}));

vi.mock('./localImageResolver', () => ({
  resolveLocalImages: vi.fn(async () => undefined),
}));

describe('markdownToExportHtml', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders markdown source into export html and runs export postprocessors', async () => {
    const html = await markdownToExportHtml('# 标题\n\n正文', {
      filePath: 'D:\\docs\\a.md',
      theme: 'dark',
    });

    expect(html).toContain('<h1>标题</h1>');
    expect(html).toContain('<p>正文</p>');
    expect(Vditor.preview).toHaveBeenCalledWith(expect.any(HTMLDivElement), '# 标题\n\n正文', expect.objectContaining({
      mode: 'dark',
      hljs: expect.objectContaining({ style: 'github-dark' }),
    }));
    expect(renderMermaidIn).toHaveBeenCalledWith(expect.any(HTMLDivElement), { theme: 'dark' });
    expect(resolveLocalImages).toHaveBeenCalledWith(expect.any(HTMLDivElement), 'D:\\docs\\a.md');
  });

  it('can render into an existing target for the HTML preview pane', async () => {
    const target = document.createElement('div');

    const html = await markdownToExportHtml('# 预览', { target });

    expect(html).toContain('<h1>预览</h1>');
    expect(target.innerHTML).toBe(html);
    expect(target.classList.contains('vditor-reset')).toBe(true);
    expect(target.classList.contains('preview-content')).toBe(true);
  });
});
