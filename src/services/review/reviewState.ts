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
const REVIEW_METADATA_PATTERN = /<!--\s*typola-review:(v1|v2):([^\s]+)\s*-->/gu;

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
    return `### ${index + 1}. ${prefix}针对片段「${quote}」\n\n${reviewEscape(comment.text)}`;
  }).join('\n\n');
  const metadata = exportedComments.map(reviewMetadataMarker).join('\n');

  return `${result.replace(/\s+$/u, '')}\n\n${REVIEW_DOCUMENT_MARKER}\n\n---\n\n## 检视意见汇总\n\n${summary}\n\n${metadata}\n`;
}

export function parseReviewMarkdown(source: string, filePath: string): ReviewComment[] {
  if (!source.includes(REVIEW_DOCUMENT_MARKER)) return [];

  const comments: ReviewComment[] = [];
  const seen = new Set<string>();
  for (const match of source.matchAll(REVIEW_METADATA_PATTERN)) {
    try {
      const value: unknown = match[1] === 'v2'
        ? decodeCompactReviewComment(match[2])
        : JSON.parse(decodeURIComponent(match[2]));
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
  const compact: CompactReviewComment = {
    i: comment.id,
    a: {
      s: comment.anchor.from,
      e: comment.anchor.to,
      o: comment.anchor.originalText,
      ...(comment.anchor.prefixHint ? { p: comment.anchor.prefixHint } : {}),
      ...(comment.anchor.headingPath ? { h: comment.anchor.headingPath } : {}),
      ...(comment.anchor.block ? { b: [comment.anchor.block.kind, comment.anchor.block.from, comment.anchor.block.to] } : {}),
    },
    t: comment.text,
    c: comment.createdAt,
    s: comment.source,
    ...(comment.basis ? { r: [comment.basis.kind, comment.basis.label] } : {}),
  };
  return `<!-- typola-review:v2:${encodeBase64Url(JSON.stringify(compact))} -->`;
}

type SerializedReviewComment = Omit<ReviewComment, 'filePath'> & { version: 1 };
type CompactReviewComment = {
  i: string;
  a: {
    s: number;
    e: number;
    o: string;
    p?: string;
    h?: string[];
    b?: [NonNullable<SelectionAnchor['block']>['kind'], number, number];
  };
  t: string;
  c: number;
  s: ReviewSource;
  r?: [ReviewBasis['kind'], string];
};

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}

function decodeCompactReviewComment(value: string): unknown {
  const padded = value.replace(/-/gu, '+').replace(/_/gu, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const compact: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!isCompactReviewComment(compact)) return null;
  const basis = compact.r ? { kind: compact.r[0], label: compact.r[1] } : undefined;
  return {
    version: 1,
    id: compact.i,
    anchor: {
      filePath: '',
      from: compact.a.s,
      to: compact.a.e,
      originalText: compact.a.o,
      ...(compact.a.p ? { prefixHint: compact.a.p } : {}),
      ...(compact.a.h ? { headingPath: compact.a.h } : {}),
      ...(compact.a.b ? { block: { kind: compact.a.b[0], from: compact.a.b[1], to: compact.a.b[2] } } : {}),
    },
    text: compact.t,
    createdAt: compact.c,
    source: compact.s,
    status: 'active',
    ...(basis ? { basis } : {}),
  } satisfies SerializedReviewComment;
}

function isCompactReviewComment(value: unknown): value is CompactReviewComment {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CompactReviewComment>;
  const anchor = candidate.a;
  if (
    typeof candidate.i !== 'string'
    || typeof candidate.t !== 'string'
    || typeof candidate.c !== 'number'
    || (candidate.s !== 'human' && candidate.s !== 'ai')
    || !anchor
    || typeof anchor.s !== 'number'
    || typeof anchor.e !== 'number'
    || typeof anchor.o !== 'string'
  ) return false;
  if (anchor.p !== undefined && typeof anchor.p !== 'string') return false;
  if (anchor.h !== undefined && (!Array.isArray(anchor.h) || !anchor.h.every((part) => typeof part === 'string'))) return false;
  if (anchor.b !== undefined && (
    !Array.isArray(anchor.b)
    || anchor.b.length !== 3
    || !['code', 'table', 'math', 'mermaid', 'section', 'paragraph'].includes(anchor.b[0])
    || typeof anchor.b[1] !== 'number'
    || typeof anchor.b[2] !== 'number'
  )) return false;
  return candidate.r === undefined || (
    Array.isArray(candidate.r)
    && candidate.r.length === 2
    && ['style', 'skill', 'request'].includes(candidate.r[0])
    && typeof candidate.r[1] === 'string'
  );
}

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
