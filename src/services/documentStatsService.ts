import { analyzeMarkdown, type MarkdownDocumentStats } from './markdownAnalysisService';

export type DocumentStats = MarkdownDocumentStats;

/** @deprecated Use analyzeMarkdown(source).stats for all new consumers. */
export function calculateDocumentStats(source: string): DocumentStats {
  return analyzeMarkdown(source).stats;
}
