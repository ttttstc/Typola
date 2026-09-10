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
  /** AI 改稿应用成功的时间戳;设置后意见保留历史但不再计入待处理(active)集合。 */
  appliedAt?: number;
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
  return comments.filter((comment) => comment.status !== 'ignored' && comment.appliedAt === undefined);
}

// 导出检视版用的集合:只排除忽略,已应用(appliedAt)的意见保留并标注「已应用」。
export function getExportableReviewComments(comments: ReviewComment[]): ReviewComment[] {
  return comments.filter((comment) => comment.status !== 'ignored');
}

// AI 改稿应用成功后,把本次发送的意见标记为已应用:保留历史供追溯,但不再计入待处理集合,
// 避免用户再次「AI 改稿」时把已处理(锚点已 stale)的意见重复塞进 prompt 空转。
export function markReviewCommentsApplied(
  state: ReviewStateSnapshot,
  commentIds: readonly string[],
  appliedAt = Date.now(),
): ReviewStateSnapshot {
  if (commentIds.length === 0) return state;
  const ids = new Set(commentIds);
  let changed = false;
  const comments = state.comments.map((comment) => {
    if (!ids.has(comment.id) || comment.appliedAt !== undefined) return comment;
    changed = true;
    return { ...comment, appliedAt };
  });
  return changed ? { comments, dirty: true } : state;
}

// AI 改稿应用后的逐意见确认:改稿 prompt 允许 AI 在锚点无法唯一定位时跳过该条意见,
// 候选稿整体 apply 成功 ≠ 每条意见都落实。只有锚点原文在候选稿(应用后的完整
// markdown)中不再原样出现(= 该段确被改动)的意见才算已落实;锚点仍原样保留、
// 或空锚点无法验证的意见视为被 AI 跳过,保持待处理,避免批量关闭形成假闭环。
export function resolveAppliedCommentIds(
  merged: string,
  comments: readonly ReviewComment[],
  candidateIds: readonly string[],
): string[] {
  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  const appliedIds: string[] = [];
  for (const id of candidateIds) {
    const comment = byId.get(id);
    if (!comment || !comment.anchor.originalText || merged.includes(comment.anchor.originalText)) continue;
    appliedIds.push(id);
  }
  return appliedIds;
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
// 已应用(appliedAt)的意见保留在导出中并标注「已应用」,不丢处理历史。
export function buildReviewMarkdown(source: string, comments: ReviewComment[]): string {
  const exportableComments = getExportableReviewComments(comments);
  if (exportableComments.length === 0) return source;

  type Hit = { insertAt: number; text: string; order: number; applied: boolean };
  const hits: Hit[] = [];
  const exportedComments: ReviewComment[] = [];

  exportableComments.forEach((comment) => {
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
    hits.push({ insertAt: segmentEnd, text: comment.text, order: hits.length, applied: comment.appliedAt !== undefined });
  });

  // 从文末往前插入,避免前面的插入使后面的 insertAt 偏移。
  // 同 insertAt(同段多意见)时按 order 降序:后插入的落在更靠前位置,
  // 最终文中顺序与意见列表顺序一致(修复同段多意见导出后顺序反转)。
  hits.sort((a, b) => b.insertAt - a.insertAt || b.order - a.order);

  let result = source;
  for (const hit of hits) {
    const label = hit.applied ? '检视意见（已应用）' : '检视意见，请处理';
    const marker = `\n\n> **${label}**：${hit.text}`;
    result = `${result.slice(0, hit.insertAt)}${marker}${result.slice(hit.insertAt)}`;
  }

  const summary = exportedComments.map((comment, index) => {
    const quote = reviewEscape(truncate(comment.anchor.originalText.replace(/\n+/g, ' '), 80));
    const line = lineNumberForAnchor(source, comment.anchor.from);
    const appliedSuffix = comment.appliedAt ? '（已应用）' : '';
    const prefix = line === null ? '定位失效 · ' : `第 ${line} 行 · `;
    return `### ${index + 1}. ${prefix}针对片段「${quote}」${appliedSuffix}\n\n${reviewEscape(comment.text)}`;
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
        ...(value.appliedAt ? { appliedAt: value.appliedAt } : {}),
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
    ...(comment.appliedAt !== undefined ? { d: comment.appliedAt } : {}),
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
  /** appliedAt 时间戳(已应用);缺省表示待处理。 */
  d?: number;
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
    ...(compact.d !== undefined ? { appliedAt: compact.d } : {}),
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
  if (candidate.d !== undefined && typeof candidate.d !== 'number') return false;
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
  if (candidate.appliedAt !== undefined && typeof candidate.appliedAt !== 'number') return false;
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
  // 转义文末汇总 markdown 特殊字符,避免含 `#*[] 的意见把 ### 标题行渲染异常。
  return text.replace(/[`[\]#*]/g, '\\$&');
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}
