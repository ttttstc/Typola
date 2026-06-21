// 检视意见 hook —— per-document 包装 reviewState 的纯函数。
//
// 切换文档时:
//   - 旧文档若 dirty → 由调用方决定提醒/丢弃(本 hook 不做提醒,见任务 #14)。
//   - 切到新文档时,如果新文档在 docStates Map 里有记录,恢复;否则空状态。
//
// dirty 标记跟 ReviewStateSnapshot 走;markClean 用于导出后/明确丢弃后。

import { useCallback, useMemo, useState } from 'react';
import {
  EMPTY_REVIEW_STATE,
  addReviewComment,
  clearReviewState,
  markReviewClean,
  removeReviewComment,
  updateReviewComment,
  type ReviewStateSnapshot,
} from '../services/review/reviewState';
import type { SelectionAnchor } from '../services/agent/types';

type DocStates = Map<string, ReviewStateSnapshot>;

type UseReviewStateResult = {
  /** 当前文档的检视意见列表 + 脏标记 */
  state: ReviewStateSnapshot;
  /** 加一条意见 */
  addComment: (anchor: SelectionAnchor, text: string) => void;
  /** 改一条意见的正文 */
  updateComment: (commentId: string, text: string) => void;
  /** 删一条 */
  removeComment: (commentId: string) => void;
  /** 清空当前文档所有意见(用于"丢弃") */
  clearAll: () => void;
  /** 把当前文档标记为已保存(导出后调用) */
  markClean: () => void;
};

export function useReviewState(currentFilePath: string | undefined): UseReviewStateResult {
  const [docStates, setDocStates] = useState<DocStates>(() => new Map());

  const state = useMemo<ReviewStateSnapshot>(() => {
    if (!currentFilePath) return EMPTY_REVIEW_STATE;
    return docStates.get(currentFilePath) ?? EMPTY_REVIEW_STATE;
  }, [docStates, currentFilePath]);

  const mutate = useCallback((transform: (prev: ReviewStateSnapshot) => ReviewStateSnapshot) => {
    if (!currentFilePath) return;
    setDocStates((prev) => {
      const current = prev.get(currentFilePath) ?? EMPTY_REVIEW_STATE;
      const next = transform(current);
      if (next === current) return prev;
      const map = new Map(prev);
      map.set(currentFilePath, next);
      return map;
    });
  }, [currentFilePath]);

  const addComment = useCallback((anchor: SelectionAnchor, text: string) => {
    if (!currentFilePath) return;
    mutate((prev) => addReviewComment(prev, currentFilePath, anchor, text));
  }, [currentFilePath, mutate]);

  const updateComment = useCallback((commentId: string, text: string) => {
    mutate((prev) => updateReviewComment(prev, commentId, text));
  }, [mutate]);

  const removeComment = useCallback((commentId: string) => {
    mutate((prev) => removeReviewComment(prev, commentId));
  }, [mutate]);

  const clearAll = useCallback(() => {
    mutate(() => clearReviewState());
  }, [mutate]);

  const markClean = useCallback(() => {
    mutate((prev) => markReviewClean(prev));
  }, [mutate]);

  return { state, addComment, updateComment, removeComment, clearAll, markClean };
}
