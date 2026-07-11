import type { TocItem } from '../types/document';
import { analyzeMarkdown } from './markdownAnalysisService';

export type MarkdownHeading = TocItem & { from: number };

/** @deprecated Use analyzeMarkdown(source).headings for all new consumers. */
export function collectMarkdownHeadings(content: string): MarkdownHeading[] {
  return analyzeMarkdown(content).headings.map((heading, index) => ({
    level: heading.level,
    text: heading.text,
    id: `toc-${index}`,
    from: heading.from,
  }));
}
