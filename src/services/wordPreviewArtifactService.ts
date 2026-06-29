import { markdownToExportHtml } from './markdownExportRenderer';
import { sanitizeHtml } from './sanitizeService';

export interface MarkdownHtmlPreviewArtifact {
  source: 'markdown-html';
  html: string;
}

export type WordPreviewArtifact = MarkdownHtmlPreviewArtifact;

export async function createWordPreviewArtifact(
  markdown: string,
): Promise<WordPreviewArtifact> {
  const html = await markdownToExportHtml(markdown, { theme: 'light' });
  return { source: 'markdown-html', html: sanitizeHtml(html) };
}
