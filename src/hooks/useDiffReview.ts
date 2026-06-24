// AI Diff Preview 审阅态状态管理。
//
// 严格按 SPEC §2.1 触发判定:openDiffReview 是 A 类直接触发(检视发AI改、
// `output: review_inline` 的 skill)和 B 类显式触发(产物 chip 点「合并到当前文档」)
// 共用入口;不在 hook 内做任何意图猜测,意图判定由调用方负责。

import { useCallback, useMemo, useState } from 'react';
import {
  countDecidableHunks,
  diffMarkdown,
  isDecidableHunk,
  mergeDecisions,
  type DiffHunk,
  type HunkDecision,
} from '../services/diff/markdownDiff';

export type DiffReviewSource = 'review' | 'skill' | 'merge-artifact';

export type DiffReviewState = {
  isOpen: boolean;
  source: DiffReviewSource;
  title: string;
  originalContent: string;
  proposedContent: string;
  hunks: DiffHunk[];
  decisions: HunkDecision[];
  /** 当前焦点 hunk 在 hunks 中的索引(可能落在 unchanged 上,UI 应跳过) */
  focusIndex: number;
  /** 用户是否动过任何 hunk 的决定(从默认 accept 翻成 reject 算动过)。
   *  关闭审阅时若此为 true 需要轻确认「放弃本次 AI 审阅?」(SPEC §2.7) */
  dirty: boolean;
};

export type OpenDiffReviewOptions = {
  source: DiffReviewSource;
  title?: string;
  originalContent: string;
  proposedContent: string;
};

const EMPTY_STATE: DiffReviewState = {
  isOpen: false,
  source: 'review',
  title: '',
  originalContent: '',
  proposedContent: '',
  hunks: [],
  decisions: [],
  focusIndex: -1,
  dirty: false,
};

/** 在 hunks 中找下一个/上一个可决策的 hunk 索引。step=+1 next / -1 prev。 */
function findDecidable(hunks: DiffHunk[], from: number, step: 1 | -1): number {
  if (hunks.length === 0) return -1;
  const n = hunks.length;
  let i = from;
  for (let count = 0; count < n; count += 1) {
    i = (i + step + n) % n;
    if (isDecidableHunk(hunks[i])) return i;
  }
  return -1;
}

/** 把 hunks 中某个 hunk 的全局索引转成 decisions 数组里的索引(跳过 unchanged)。 */
function hunkToDecisionIndex(hunks: DiffHunk[], hunkIndex: number): number {
  let decisionIndex = -1;
  for (let i = 0; i <= hunkIndex; i += 1) {
    if (isDecidableHunk(hunks[i])) decisionIndex += 1;
  }
  return decisionIndex;
}

export function useDiffReview(onApplyMerged?: (merged: string, originalContent: string) => void) {
  const [state, setState] = useState<DiffReviewState>(EMPTY_STATE);

  const open = useCallback((options: OpenDiffReviewOptions) => {
    const hunks = diffMarkdown(options.originalContent, options.proposedContent);
    const decisionCount = countDecidableHunks(hunks);
    const decisions: HunkDecision[] = new Array(decisionCount).fill('accept');
    // 焦点落在第一个可决策 hunk 上
    const firstDecidable = hunks.findIndex(isDecidableHunk);
    setState({
      isOpen: true,
      source: options.source,
      title: options.title ?? '',
      originalContent: options.originalContent,
      proposedContent: options.proposedContent,
      hunks,
      decisions,
      focusIndex: firstDecidable,
      dirty: false,
    });
  }, []);

  const close = useCallback(() => {
    setState(EMPTY_STATE);
  }, []);

  const setDecision = useCallback((hunkIndex: number, decision: HunkDecision) => {
    setState((prev) => {
      if (!prev.isOpen) return prev;
      const decisionIndex = hunkToDecisionIndex(prev.hunks, hunkIndex);
      if (decisionIndex < 0) return prev;
      if (prev.decisions[decisionIndex] === decision) return prev;
      const decisions = prev.decisions.slice();
      decisions[decisionIndex] = decision;
      return { ...prev, decisions, dirty: true };
    });
  }, []);

  const acceptAll = useCallback(() => {
    setState((prev) => {
      if (!prev.isOpen) return prev;
      return { ...prev, decisions: prev.decisions.map(() => 'accept'), dirty: true };
    });
  }, []);

  const rejectAll = useCallback(() => {
    setState((prev) => {
      if (!prev.isOpen) return prev;
      return { ...prev, decisions: prev.decisions.map(() => 'reject'), dirty: true };
    });
  }, []);

  const focusNext = useCallback(() => {
    setState((prev) => {
      if (!prev.isOpen) return prev;
      const next = findDecidable(prev.hunks, prev.focusIndex, 1);
      if (next < 0 || next === prev.focusIndex) return prev;
      return { ...prev, focusIndex: next };
    });
  }, []);

  const focusPrev = useCallback(() => {
    setState((prev) => {
      if (!prev.isOpen) return prev;
      const prevIdx = findDecidable(prev.hunks, prev.focusIndex, -1);
      if (prevIdx < 0 || prevIdx === prev.focusIndex) return prev;
      return { ...prev, focusIndex: prevIdx };
    });
  }, []);

  const focusHunk = useCallback((hunkIndex: number) => {
    setState((prev) => {
      if (!prev.isOpen) return prev;
      if (hunkIndex < 0 || hunkIndex >= prev.hunks.length) return prev;
      if (!isDecidableHunk(prev.hunks[hunkIndex])) return prev;
      return { ...prev, focusIndex: hunkIndex };
    });
  }, []);

  const apply = useCallback(() => {
    if (!state.isOpen) return;
    const merged = mergeDecisions(state.hunks, state.decisions);
    onApplyMerged?.(merged, state.originalContent);
    setState(EMPTY_STATE);
  }, [state, onApplyMerged]);

  const decidableCount = useMemo(() => countDecidableHunks(state.hunks), [state.hunks]);
  const focusOrdinal = useMemo(() => {
    // 1-based "第 N 处"。focusIndex 落在不可决策上则返回 0。
    if (state.focusIndex < 0) return 0;
    if (!isDecidableHunk(state.hunks[state.focusIndex])) return 0;
    return hunkToDecisionIndex(state.hunks, state.focusIndex) + 1;
  }, [state.hunks, state.focusIndex]);

  return {
    state,
    decidableCount,
    focusOrdinal,
    open,
    close,
    setDecision,
    acceptAll,
    rejectAll,
    focusNext,
    focusPrev,
    focusHunk,
    apply,
  };
}

export type DiffReviewController = ReturnType<typeof useDiffReview>;
