// 检视意见 hook —— 同一列表管理人工与 AI 意见,按文档保留状态。

import { useCallback, useMemo, useState } from 'react';
import {
  EMPTY_REVIEW_STATE,
  addAIReviewComment,
  addReviewComment,
  clearReviewState,
  markReviewClean,
  removeReviewComment,
  setReviewCommentIgnored,
  updateReviewComment,
  type ReviewBasis,
  type ReviewComment,
  type ReviewStateSnapshot,
} from '../services/review/reviewState';
import type { SelectionAnchor } from '../services/agent/types';

type DocStates = Map<string, ReviewStateSnapshot>;

type UseReviewStateResult = {
  state: ReviewStateSnapshot;
  addComment: (anchor: SelectionAnchor, text: string) => void;
  addAIComment: (anchor: SelectionAnchor, text: string, basis?: ReviewBasis) => void;
  updateComment: (commentId: string, text: string) => void;
  setIgnored: (commentId: string, ignored: boolean) => void;
  removeComment: (commentId: string) => void;
  clearAll: () => void;
  markClean: () => void;
  /** 从检视版恢复意见。已有内存状态时不覆盖用户本轮操作。 */
  hydrateComments: (comments: ReviewComment[]) => void;
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

  const addAIComment = useCallback((anchor: SelectionAnchor, text: string, basis?: ReviewBasis) => {
    if (!currentFilePath) return;
    mutate((prev) => addAIReviewComment(prev, currentFilePath, anchor, text, basis));
  }, [currentFilePath, mutate]);

  const updateComment = useCallback((commentId: string, text: string) => {
    mutate((prev) => updateReviewComment(prev, commentId, text));
  }, [mutate]);

  const setIgnored = useCallback((commentId: string, ignored: boolean) => {
    mutate((prev) => setReviewCommentIgnored(prev, commentId, ignored));
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

  const hydrateComments = useCallback((comments: ReviewComment[]) => {
    if (!currentFilePath || comments.length === 0) return;
    setDocStates((prev) => {
      if (prev.has(currentFilePath)) return prev;
      const map = new Map(prev);
      map.set(currentFilePath, { comments, dirty: false });
      return map;
    });
  }, [currentFilePath]);

  return {
    state,
    addComment,
    addAIComment,
    updateComment,
    setIgnored,
    removeComment,
    clearAll,
    markClean,
    hydrateComments,
  };
}
