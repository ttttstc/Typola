// 文档检视状态层 —— per-document 的批注意见 + 脏标记 + 可往返检视版。

import type { SelectionAnchor } from '../agent/types';
import { recoverAnchorInBlock } from '../agent/selectionActions';

export type ReviewSource = 'human' | 'ai';
export type ReviewStatus = 'active' | 'ignored';
export type ReviewBasis = {
  kind: 'style' | 'skill' | 'request';
  label: string;
};

export type ReviewComment = {
  id: string;
  filePath: string;
  anchor: SelectionAnchor;
  text: string;
  createdAt: number;
  source: ReviewSource;
  status: ReviewStatus;
  basis?: ReviewBasis;
};

export type ReviewStateSnapshot = {
  comments: ReviewComment[];
  dirty: boolean;
};

export const EMPTY_REVIEW_STATE: ReviewStateSnapshot = {
  comments: [],
  dirty: false,
};

const REVIEW_DOCUMENT_MARKER = '<!-- typola-review-document:v1 -->';
const REVIEW_METADATA_PATTERN = /<!--\s*typola-review:v1:([^\s]+)\s*-->/gu;

let reviewIdCounter = 0;
function nextReviewId(): string {
  reviewIdCounter += 1;
  return `rv-${Date.now()}-${reviewIdCounter}-${Math.random().toString(36).slice(2, 6)}`;
}

function appendReviewComment(
  state: ReviewStateSnapshot,
  filePath: string,
  anchor: SelectionAnchor,
  text: string,
  source: ReviewSource,
  basis?: ReviewBasis,
): ReviewStateSnapshot {
  const trimmed = text.trim();
  if (!trimmed) return state;
  const comment: ReviewComment = {
    id: nextReviewId(),
    filePath,
    anchor,
    text: trimmed,
    createdAt: Date.now(),
    source,
    status: 'active',
    ...(basis ? { basis } : {}),
  };
  return { comments: [...state.comments, comment], dirty: true };
}

export function addReviewComment(
  state: ReviewStateSnapshot,
  filePath: string,
  anchor: SelectionAnchor,
  text: string,
): ReviewStateSnapshot {
  return appendReviewComment(state, filePath, anchor, text, 'human');
}

export function addAIReviewComment(
  state: ReviewStateSnapshot,
  filePath: string,
  anchor: SelectionAnchor,
  text: string,
  basis?: ReviewBasis,
): ReviewStateSnapshot {
  return appendReviewComment(state, filePath, anchor, text, 'ai', basis);
}

export function updateReviewComment(
  state: ReviewStateSnapshot,
  commentId: string,
  text: string,
): ReviewStateSnapshot {
  const trimmed = text.trim();
  if (!trimmed) return removeReviewComment(state, commentId);
  let changed = false;
  const comments = state.comments.map((comment) => {
    if (comment.id !== commentId || comment.text === trimmed) return comment;
    changed = true;
    return { ...comment, text: trimmed };
  });
  return changed ? { comments, dirty: true } : state;
}

export function setReviewCommentIgnored(
  state: ReviewStateSnapshot,
  commentId: string,
  ignored: boolean,
): ReviewStateSnapshot {
  const status: ReviewStatus = ignored ? 'ignored' : 'active';
  let changed = false;
  const comments = state.comments.map((comment) => {
    if (comment.id !== commentId || comment.status === status) return comment;
    changed = true;
    return { ...comment, status };
  });
  return changed ? { comments, dirty: true } : state;
}

export function getActiveReviewComments(comments: ReviewComment[]): ReviewComment[] {
  return comments.filter((comment) => comment.status !== 'ignored');
}

export function removeReviewComment(
  state: ReviewStateSnapshot,
  commentId: string,
): ReviewStateSnapshot {
  const filtered = state.comments.filter((comment) => comment.id !== commentId);
  if (filtered.length === state.comments.length) return state;
  return { comments: filtered, dirty: true };
}

export function clearReviewState(): ReviewStateSnapshot {
  return { comments: [], dirty: false };
}

export function markReviewClean(state: ReviewStateSnapshot): ReviewStateSnapshot {
  if (!state.dirty) return state;
  return { ...state, dirty: false };
}

// 给其他 Markdown 阅读器保留可读批注，同时写入 Typola 可重新识别的不可见元数据。
export function buildReviewMarkdown(source: string, comments: ReviewComment[]): string {
  const activeComments = getActiveReviewComments(comments);
  if (activeComments.length === 0) return source;

  type Hit = { insertAt: number; text: string };
  const hits: Hit[] = [];
  const exportedComments: ReviewComment[] = [];

  activeComments.forEach((comment) => {
    const hit = recoverAnchorInBlock(source, comment.anchor, comment.anchor.block);
    const exportedComment = {
      ...comment,
      anchor: hit
        ? { ...comment.anchor, from: hit.start, to: hit.start + hit.length }
        : { ...comment.anchor, from: -1, to: -1 },
    };
    exportedComments.push(exportedComment);
    if (!hit) return;
    const segmentEnd = findSegmentEnd(source, hit.start + hit.length);
    hits.push({ insertAt: segmentEnd, text: comment.text });
  });

  hits.sort((a, b) => b.insertAt - a.insertAt);

  let result = source;
  for (const hit of hits) {
    const marker = `\n\n> **检视意见，请处理**：${hit.text}`;
    result = `${result.slice(0, hit.insertAt)}${marker}${result.slice(hit.insertAt)}`;
  }

  const summary = exportedComments.map((comment, index) => {
    const quote = reviewEscape(truncate(comment.anchor.originalText.replace(/\n+/g, ' '), 80));
    const line = lineNumberForAnchor(source, comment.anchor.from);
    const prefix = line === null ? '定位失效 · ' : `第 ${line} 行 · `;
    return `${reviewMetadataMarker(comment)}\n### ${index + 1}. ${prefix}针对片段「${quote}」\n\n${reviewEscape(comment.text)}`;
  }).join('\n\n');

  return `${result.replace(/\s+$/u, '')}\n\n${REVIEW_DOCUMENT_MARKER}\n\n---\n\n## 检视意见汇总\n\n${summary}\n`;
}

export function parseReviewMarkdown(source: string, filePath: string): ReviewComment[] {
  if (!source.includes(REVIEW_DOCUMENT_MARKER)) return [];

  const comments: ReviewComment[] = [];
  const seen = new Set<string>();
  for (const match of source.matchAll(REVIEW_METADATA_PATTERN)) {
    try {
      const value: unknown = JSON.parse(decodeURIComponent(match[1]));
      if (!isSerializedReviewComment(value) || seen.has(value.id)) continue;
      seen.add(value.id);
      comments.push({
        id: value.id,
        filePath,
        anchor: { ...value.anchor, filePath },
        text: value.text,
        createdAt: value.createdAt,
        source: value.source,
        status: value.status,
        ...(value.basis ? { basis: value.basis } : {}),
      });
    } catch {
      // 单条损坏不影响其余检视意见恢复。
    }
  }
  return comments;
}

function reviewMetadataMarker(comment: ReviewComment): string {
  const serialized = encodeURIComponent(JSON.stringify({
    version: 1,
    id: comment.id,
    anchor: comment.anchor,
    text: comment.text,
    createdAt: comment.createdAt,
    source: comment.source,
    status: comment.status,
    ...(comment.basis ? { basis: comment.basis } : {}),
  })).replace(/-/g, '%2D');
  return `<!-- typola-review:v1:${serialized} -->`;
}

type SerializedReviewComment = Omit<ReviewComment, 'filePath'> & { version: 1 };

function isSerializedReviewComment(value: unknown): value is SerializedReviewComment {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SerializedReviewComment>;
  if (
    candidate.version !== 1
    || typeof candidate.id !== 'string'
    || typeof candidate.text !== 'string'
    || typeof candidate.createdAt !== 'number'
    || (candidate.source !== 'human' && candidate.source !== 'ai')
    || (candidate.status !== 'active' && candidate.status !== 'ignored')
    || !candidate.anchor
    || typeof candidate.anchor !== 'object'
  ) return false;

  const anchor = candidate.anchor as Partial<SelectionAnchor>;
  if (
    typeof anchor.filePath !== 'string'
    || typeof anchor.from !== 'number'
    || typeof anchor.to !== 'number'
    || typeof anchor.originalText !== 'string'
  ) return false;

  if (candidate.basis) {
    const basis = candidate.basis as Partial<ReviewBasis>;
    if (
      (basis.kind !== 'style' && basis.kind !== 'skill' && basis.kind !== 'request')
      || typeof basis.label !== 'string'
    ) return false;
  }
  return true;
}

function findSegmentEnd(source: string, offset: number): number {
  const len = source.length;
  if (offset >= len) return len;
  const idx = source.indexOf('\n\n', offset);
  if (idx === -1) {
    let end = len;
    while (end > offset && (source[end - 1] === '\n' || source[end - 1] === '\r')) end -= 1;
    return end;
  }
  let end = idx;
  while (end > offset && (
    source[end - 1] === '\n'
    || source[end - 1] === '\r'
    || source[end - 1] === ' '
    || source[end - 1] === '\t'
  )) end -= 1;
  return end;
}

export function lineNumberForAnchor(source: string, offset: number): number | null {
  if (offset < 0 || offset > source.length) return null;
  let line = 1;
  for (let i = 0; i < offset; i += 1) {
    if (source.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function reviewEscape(text: string): string {
  return text.replace(/[`[\]#*]/g, '\\$&');
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}
