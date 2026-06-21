// 文档检视状态层 —— per-document 的批注意见 + 脏标记 + 导出 review md。
//
// in-memory(本期不持久化到 sidecar),文档切换时由 useReviewState 切 store。
// 一条意见 = anchor(prefixHint + originalText 唯一定位) + 意见正文 + 时间戳。
//
// 「脏」语义:任何 add/update/remove 后 dirty = true。导出/discard 后 dirty = false。
// AppLayout 关闭/切文档时观察 dirty 走 confirmUnsavedChoice(任务 #14)。

import type { SelectionAnchor } from '../agent/types';
import { findUniqueAnchor } from '../agent/selectionActions';

export type ReviewComment = {
  id: string;
  filePath: string;
  anchor: SelectionAnchor;
  text: string;
  createdAt: number;
};

export type ReviewStateSnapshot = {
  comments: ReviewComment[];
  dirty: boolean;
};

export const EMPTY_REVIEW_STATE: ReviewStateSnapshot = {
  comments: [],
  dirty: false,
};

let reviewIdCounter = 0;
function nextReviewId(): string {
  reviewIdCounter += 1;
  return `rv-${Date.now()}-${reviewIdCounter}-${Math.random().toString(36).slice(2, 6)}`;
}

export function addReviewComment(
  state: ReviewStateSnapshot,
  filePath: string,
  anchor: SelectionAnchor,
  text: string,
): ReviewStateSnapshot {
  const trimmed = text.trim();
  if (!trimmed) return state;
  const comment: ReviewComment = {
    id: nextReviewId(),
    filePath,
    anchor,
    text: trimmed,
    createdAt: Date.now(),
  };
  return { comments: [...state.comments, comment], dirty: true };
}

export function updateReviewComment(
  state: ReviewStateSnapshot,
  commentId: string,
  text: string,
): ReviewStateSnapshot {
  const trimmed = text.trim();
  if (!trimmed) return removeReviewComment(state, commentId);
  let changed = false;
  const comments = state.comments.map((c) => {
    if (c.id !== commentId) return c;
    if (c.text === trimmed) return c;
    changed = true;
    return { ...c, text: trimmed };
  });
  if (!changed) return state;
  return { comments, dirty: true };
}

export function removeReviewComment(
  state: ReviewStateSnapshot,
  commentId: string,
): ReviewStateSnapshot {
  const filtered = state.comments.filter((c) => c.id !== commentId);
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

// 把检视意见按段后注入 markdown 源文,生成 review md(给协作者看 / 给 AI 改)。
//
// 策略:对每条意见,在 source 里用 anchor 唯一定位选中片段 → 在那一行(被选中片段所在行)末尾追加
// `\n> **检视意见，请处理**：<text>`。多条意见在同一段落 → 按出现顺序连续追加。
// 锚点失效(stale / wrong file)的意见 → 跟在文档最末追加一段 fallback。
//
// 输出格式严格遵循用户决定:不带 emoji + 以 `**检视意见，请处理**` 开头。
export function buildReviewMarkdown(source: string, comments: ReviewComment[]): string {
  if (comments.length === 0) return source;

  // 收集每条意见在 source 中的"插入点"(行尾偏移),失败的留作 fallback
  type Hit = { insertAt: number; text: string; order: number };
  const hits: Hit[] = [];
  const orphans: ReviewComment[] = [];

  comments.forEach((comment, order) => {
    const hit = findUniqueAnchor(source, comment.anchor.originalText, comment.anchor.prefixHint);
    if (!hit) {
      orphans.push(comment);
      return;
    }
    // 找到锚点所在段落的末尾(下一个空行前 / 文档末)
    const segmentEnd = findSegmentEnd(source, hit.start + hit.length);
    hits.push({ insertAt: segmentEnd, text: comment.text, order });
  });

  // 按 insertAt 从大到小排序,反向插入避免后续偏移失效
  hits.sort((a, b) => b.insertAt - a.insertAt);

  let result = source;
  for (const hit of hits) {
    const marker = `\n\n> **检视意见，请处理**：${hit.text}`;
    result = `${result.slice(0, hit.insertAt)}${marker}${result.slice(hit.insertAt)}`;
  }

  if (orphans.length > 0) {
    const tail = orphans.map((c) => (
      `> **检视意见，请处理**：${c.text}\n> (原片段已无法精确定位:${truncate(c.anchor.originalText, 60)})`
    )).join('\n\n');
    result = `${result.replace(/\s+$/u, '')}\n\n---\n\n## 失效的检视意见\n\n${tail}\n`;
  }

  return result;
}

// 找到包含 offset 的"段落"末尾:从 offset 向后找,直到遇到空行(\n\n) 或文档末。
function findSegmentEnd(source: string, offset: number): number {
  const len = source.length;
  if (offset >= len) return len;
  // 找下一个 \n\n
  const idx = source.indexOf('\n\n', offset);
  if (idx === -1) {
    // 没有空行 → 走到文档末,但去掉末尾换行
    let end = len;
    while (end > offset && (source[end - 1] === '\n' || source[end - 1] === '\r')) end -= 1;
    return end;
  }
  // 在 \n\n 之前;但 idx 指向 \n,需要回到当前段最后一个非空字符
  let end = idx;
  while (end > offset && (source[end - 1] === '\n' || source[end - 1] === '\r' || source[end - 1] === ' ' || source[end - 1] === '\t')) end -= 1;
  return end;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}
