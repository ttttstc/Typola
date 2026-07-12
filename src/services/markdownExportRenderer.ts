import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { resolveLocalImages } from './localImageResolver';
import { renderMermaidIn } from './mermaidRenderer';
import { stripFrontmatter } from './markdownAnalysisService';

export type MarkdownExportTheme = 'light' | 'dark';

export type MarkdownToExportHtmlOptions = {
  target?: HTMLDivElement;
  filePath?: string;
  theme?: MarkdownExportTheme;
  mermaidTheme?: 'default' | 'dark';
};

// 导出只接受 Markdown source；原始 HTML 先解析，再由 rehype-sanitize 清洗。
// 这使 PDF / HTML / 微信不再依赖 Vditor 的 preview DOM。
const exportMarkdownProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeSanitize)
  .use(rehypeHighlight)
  .use(rehypeKatex)
  .use(rehypeStringify);

/** Render Markdown source into sanitized export-ready HTML. */
export async function markdownToExportHtml(
  source: string,
  options: MarkdownToExportHtmlOptions = {},
): Promise<string> {
  const exportSource = stripFrontmatter(source);
  if (!exportSource.trim()) {
    options.target?.replaceChildren();
    return '';
  }

  const rendered = String(await exportMarkdownProcessor.process(exportSource));
  const target = options.target ?? document.createElement('div');
  target.classList.add('typola-export-content');
  target.innerHTML = rendered;

  await Promise.all([
    renderMermaidIn(target, {
      theme: options.mermaidTheme ?? (options.theme === 'dark' ? 'dark' : 'default'),
    }),
    resolveLocalImages(target, options.filePath),
  ]);
  return target.innerHTML;
}
