// 文档检视状态层 —— per-document 的批注意见 + 脏标记 + 导出 review md。
//
// in-memory(本期不持久化到 sidecar),文档切换时由 useReviewState 切 store。
// 一条意见 = anchor(prefixHint + originalText 唯一定位) + 意见正文 + 时间戳。
//
// 「脏」语义:任何 add/update/remove 后 dirty = true。导出/discard 后 dirty = false。
// AppLayout 关闭/切文档时观察 dirty 走 confirmUnsavedChoice(任务 #14)。

import type { SelectionAnchor } from '../agent/types';
import { recoverAnchorInBlock } from '../agent/selectionActions';

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
// 双轨保险:
//   1) 行内段后:对能锚定的意见,在选中片段所在段落末尾追加 `> **检视意见，请处理**：…`
//   2) 文末汇总:**所有**意见无条件追加到文末「## 检视意见汇总」段,即使 anchor 全失效也不丢
//
// 输出格式:不带 emoji,以 `**检视意见，请处理**` 开头(行内段后),文末汇总每条带编号 + 引文 + 意见。
export function buildReviewMarkdown(source: string, comments: ReviewComment[]): string {
  if (comments.length === 0) return source;

  // === 行内段后(尽力)===
  type Hit = { insertAt: number; text: string };
  const hits: Hit[] = [];

  comments.forEach((comment) => {
    const hit = recoverAnchorInBlock(source, comment.anchor, comment.anchor.block);
    if (!hit) return; // anchor 失效跳过段后插入,文末汇总仍会兜底
    const segmentEnd = findSegmentEnd(source, hit.start + hit.length);
    hits.push({ insertAt: segmentEnd, text: comment.text });
  });

  // 从大到小排序,反向插入避免偏移失效
  hits.sort((a, b) => b.insertAt - a.insertAt);

  let result = source;
  for (const hit of hits) {
    const marker = `\n\n> **检视意见，请处理**：${hit.text}`;
    result = `${result.slice(0, hit.insertAt)}${marker}${result.slice(hit.insertAt)}`;
  }

  // === 文末汇总(无条件,永远不丢)===
  // 即便所有 anchor 都失败、或调用方传错路径,意见仍能从文末完整找回。
  // 每条意见前面带「第 N 行」便于肉眼定位;anchor.from 越界(原文已改)时显示「定位失效」。
  const summary = comments.map((c, i) => {
    const quote = reviewEscape(truncate(c.anchor.originalText.replace(/\n+/g, ' '), 80));
    const line = lineNumberForAnchor(source, c.anchor.from);
    const prefix = line === null ? '定位失效 · ' : `第 ${line} 行 · `;
    return `### ${i + 1}. ${prefix}针对片段「${quote}」\n\n${reviewEscape(c.text)}`;
  }).join('\n\n');
  result = `${result.replace(/\s+$/u, '')}\n\n---\n\n## 检视意见汇总\n\n${summary}\n`;

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

/**
 * 给定 source 与字符 offset,返回 1-based 行号。
 * offset < 0 或 offset > source.length 时返回 null(视为失效)。
 * 行号 = source[0..offset) 中 '\n' 的个数 + 1。
 */
export function lineNumberForAnchor(source: string, offset: number): number | null {
  if (offset < 0 || offset > source.length) return null;
  let line = 1;
  for (let i = 0; i < offset; i++) {
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
