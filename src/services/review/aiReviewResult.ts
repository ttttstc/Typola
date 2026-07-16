import { findUniqueAnchor } from '../agent/selectionActions';
import type { SelectionAnchor } from '../agent/types';

export type AIReviewFinding = {
  originalText: string;
  prefixHint?: string;
  text: string;
};

export function parseAIReviewFindings(raw: string): AIReviewFinding[] {
  let value: unknown;
  try {
    const trimmed = raw.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/iu);
    value = JSON.parse(fenced?.[1] ?? trimmed);
  } catch {
    throw new Error('AI 检视结果不是合法 JSON。');
  }
  const comments = value && typeof value === 'object'
    ? (value as { comments?: unknown }).comments
    : undefined;
  if (!Array.isArray(comments)) throw new Error('AI 检视结果缺少 comments 列表。');
  return comments.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const finding = entry as Record<string, unknown>;
    if (typeof finding.originalText !== 'string' || !finding.originalText.trim()) return [];
    if (typeof finding.text !== 'string' || !finding.text.trim()) return [];
    return [{
      originalText: finding.originalText,
      text: finding.text.trim(),
      ...(typeof finding.prefixHint === 'string' && finding.prefixHint ? { prefixHint: finding.prefixHint } : {}),
    }];
  });
}

export function resolveAIReviewAnchor(
  source: string,
  filePath: string,
  finding: AIReviewFinding,
): SelectionAnchor | null {
  const hit = findUniqueAnchor(source, finding.originalText, finding.prefixHint);
  if (!hit) return null;
  return {
    filePath,
    from: hit.start,
    to: hit.start + hit.length,
    originalText: source.slice(hit.start, hit.start + hit.length),
    ...(finding.prefixHint ? { prefixHint: finding.prefixHint } : {}),
  };
}

export function resolveStoredReviewAnchor(
  source: string,
  filePath: string,
  anchor: SelectionAnchor,
): SelectionAnchor | null {
  if (
    anchor.from >= 0
    && anchor.to >= anchor.from
    && anchor.to <= source.length
    && source.slice(anchor.from, anchor.to) === anchor.originalText
  ) {
    return {
      ...anchor,
      filePath,
      originalText: source.slice(anchor.from, anchor.to),
    };
  }
  return resolveAIReviewAnchor(source, filePath, {
    originalText: anchor.originalText,
    prefixHint: anchor.prefixHint,
    text: '',
  });
}
