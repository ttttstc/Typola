// 候选稿 Diff 审阅状态：同一会话持续演进，正式文档仅在 apply 时改变。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  countDecidableHunks,
  diffMarkdown,
  isDecidableHunk,
  mergeDecisions,
  type DiffHunk,
  type HunkDecision,
} from '../services/diff/markdownDiff';

export type DiffReviewSource = 'review' | 'skill' | 'merge-artifact';
export type CandidateSelfCheckStatus = 'fresh' | 'stale' | 'warning' | 'blocked';
export type CandidateBaselineStatus = 'current' | 'stale';

export type DiffReviewState = {
  isOpen: boolean;
  source: DiffReviewSource;
  title: string;
  documentPath?: string;
  candidatePath?: string;
  originalContent: string;
  proposedContent: string;
  hunks: DiffHunk[];
  decisions: HunkDecision[];
  focusIndex: number;
  dirty: boolean;
  selfCheckStatus: CandidateSelfCheckStatus;
  selfCheckSummary?: string;
  baselineStatus: CandidateBaselineStatus;
  latestSourceContent?: string;
  feedbackPending: boolean;
};

export type OpenDiffReviewOptions = {
  source: DiffReviewSource;
  title?: string;
  documentPath?: string;
  candidatePath?: string;
  originalContent: string;
  proposedContent: string;
  selfCheckStatus?: CandidateSelfCheckStatus;
  selfCheckSummary?: string;
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
  selfCheckStatus: 'fresh',
  baselineStatus: 'current',
  feedbackPending: false,
};

const STORAGE_PREFIX = 'typola.diff-review.v1:';

function createReviewState(options: OpenDiffReviewOptions): DiffReviewState {
  const hunks = diffMarkdown(options.originalContent, options.proposedContent);
  const decisions: HunkDecision[] = new Array(countDecidableHunks(hunks)).fill('accept');
  return {
    isOpen: true,
    source: options.source,
    title: options.title ?? '',
    documentPath: options.documentPath,
    candidatePath: options.candidatePath,
    originalContent: options.originalContent,
    proposedContent: options.proposedContent,
    hunks,
    decisions,
    focusIndex: hunks.findIndex(isDecidableHunk),
    dirty: false,
    selfCheckStatus: options.selfCheckStatus ?? 'fresh',
    selfCheckSummary: options.selfCheckSummary,
    baselineStatus: 'current',
    feedbackPending: false,
  };
}

function findDecidable(hunks: DiffHunk[], from: number, step: 1 | -1): number {
  if (hunks.length === 0) return -1;
  const count = hunks.length;
  let index = from;
  for (let visited = 0; visited < count; visited += 1) {
    index = (index + step + count) % count;
    if (isDecidableHunk(hunks[index])) return index;
  }
  return -1;
}

function hunkToDecisionIndex(hunks: DiffHunk[], hunkIndex: number): number {
  let decisionIndex = -1;
  for (let index = 0; index <= hunkIndex; index += 1) {
    if (isDecidableHunk(hunks[index])) decisionIndex += 1;
  }
  return decisionIndex;
}

function storageKey(persistenceKey?: string): string | null {
  return persistenceKey ? `${STORAGE_PREFIX}${persistenceKey}` : null;
}

function restoreState(persistenceKey?: string): DiffReviewState {
  const key = storageKey(persistenceKey);
  if (!key || typeof localStorage === 'undefined') return EMPTY_STATE;
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!value || typeof value !== 'object') return EMPTY_STATE;
    const saved = value as Partial<DiffReviewState>;
    if (
      saved.isOpen !== true
      || typeof saved.originalContent !== 'string'
      || typeof saved.proposedContent !== 'string'
      || (saved.source !== 'review' && saved.source !== 'skill' && saved.source !== 'merge-artifact')
    ) return EMPTY_STATE;
    const restored = createReviewState({
      source: saved.source,
      title: typeof saved.title === 'string' ? saved.title : '',
      documentPath: typeof saved.documentPath === 'string' ? saved.documentPath : undefined,
      candidatePath: typeof saved.candidatePath === 'string' ? saved.candidatePath : undefined,
      originalContent: saved.originalContent,
      proposedContent: saved.proposedContent,
      selfCheckStatus: isSelfCheckStatus(saved.selfCheckStatus) ? saved.selfCheckStatus : 'fresh',
      selfCheckSummary: typeof saved.selfCheckSummary === 'string' ? saved.selfCheckSummary : undefined,
    });
    const decisionCount = countDecidableHunks(restored.hunks);
    const decisions = Array.isArray(saved.decisions)
      && saved.decisions.length === decisionCount
      && saved.decisions.every((decision) => decision === 'accept' || decision === 'reject')
      ? saved.decisions as HunkDecision[]
      : restored.decisions;
    return {
      ...restored,
      decisions,
      focusIndex: typeof saved.focusIndex === 'number' ? saved.focusIndex : restored.focusIndex,
      dirty: saved.dirty === true,
      baselineStatus: saved.baselineStatus === 'stale' ? 'stale' : 'current',
      latestSourceContent: typeof saved.latestSourceContent === 'string' ? saved.latestSourceContent : undefined,
      feedbackPending: false,
    };
  } catch {
    return EMPTY_STATE;
  }
}

function isSelfCheckStatus(value: unknown): value is CandidateSelfCheckStatus {
  return value === 'fresh' || value === 'stale' || value === 'warning' || value === 'blocked';
}

export function useDiffReview(
  onApplyMerged?: (merged: string, originalContent: string) => void | Promise<void>,
  persistenceKey?: string,
) {
  const [state, setState] = useState<DiffReviewState>(() => restoreState(persistenceKey));
  const loadedKeyRef = useRef(persistenceKey);
  const skipPersistRef = useRef(false);

  useEffect(() => {
    if (loadedKeyRef.current === persistenceKey) return;
    loadedKeyRef.current = persistenceKey;
    skipPersistRef.current = true;
    setState(restoreState(persistenceKey));
  }, [persistenceKey]);

  useEffect(() => {
    const key = storageKey(persistenceKey);
    if (!key || typeof localStorage === 'undefined') return;
    if (skipPersistRef.current) {
      skipPersistRef.current = false;
      return;
    }
    try {
      if (state.isOpen) {
        const { hunks: _hunks, feedbackPending: _feedbackPending, ...persisted } = state;
        localStorage.setItem(key, JSON.stringify(persisted));
      } else {
        localStorage.removeItem(key);
      }
    } catch {
      // localStorage 可能因候选稿过大而写满；保留内存态，不中断当前编辑。
    }
  }, [persistenceKey, state]);

  const open = useCallback((options: OpenDiffReviewOptions) => {
    setState(createReviewState(options));
  }, []);

  const clearPersistedCandidate = useCallback(() => {
    const key = storageKey(persistenceKey);
    if (!key || typeof localStorage === 'undefined') return;
    try {
      localStorage.removeItem(key);
    } catch {
      // 清理失败不影响关闭内存中的候选稿。
    }
  }, [persistenceKey]);

  const close = useCallback(() => {
    clearPersistedCandidate();
    setState(EMPTY_STATE);
  }, [clearPersistedCandidate]);

  const updateCandidate = useCallback((
    proposedContent: string,
    selfCheckStatus: CandidateSelfCheckStatus = 'stale',
    selfCheckSummary?: string,
  ) => {
    setState((previous) => {
      if (!previous.isOpen) return previous;
      if (previous.proposedContent === proposedContent) {
        return previous.selfCheckStatus === selfCheckStatus && previous.selfCheckSummary === selfCheckSummary
          ? previous
          : { ...previous, selfCheckStatus, selfCheckSummary };
      }
      const next = createReviewState({
          source: previous.source,
          title: previous.title,
          documentPath: previous.documentPath,
          candidatePath: previous.candidatePath,
          originalContent: previous.originalContent,
          proposedContent,
          selfCheckStatus,
          selfCheckSummary,
        });
      return {
        ...next,
        baselineStatus: previous.baselineStatus,
        latestSourceContent: previous.latestSourceContent,
        dirty: true,
      };
    });
  }, []);

  const setSelfCheckStatus = useCallback((selfCheckStatus: CandidateSelfCheckStatus, selfCheckSummary?: string) => {
    setState((previous) => {
      if (!previous.isOpen) return previous;
      if (previous.selfCheckStatus === selfCheckStatus && previous.selfCheckSummary === selfCheckSummary) return previous;
      return { ...previous, selfCheckStatus, selfCheckSummary };
    });
  }, []);

  const markBaselineStale = useCallback((latestSourceContent: string) => {
    setState((previous) => {
      if (!previous.isOpen || previous.originalContent === latestSourceContent) return previous;
      if (previous.baselineStatus === 'stale' && previous.latestSourceContent === latestSourceContent) return previous;
      return { ...previous, baselineStatus: 'stale', latestSourceContent };
    });
  }, []);

  const resetToLatestSource = useCallback(() => {
    setState((previous) => {
      if (!previous.isOpen || previous.baselineStatus !== 'stale' || previous.latestSourceContent === undefined) return previous;
      return createReviewState({
        source: previous.source,
        title: previous.title,
        documentPath: previous.documentPath,
        candidatePath: previous.candidatePath,
        originalContent: previous.latestSourceContent,
        proposedContent: previous.latestSourceContent,
        selfCheckStatus: 'stale',
        selfCheckSummary: '源文档已更新，请重新发起修改或检视。',
      });
    });
  }, []);

  const rebaseCandidateToLatestSource = useCallback(() => {
    setState((previous) => {
      if (!previous.isOpen || previous.baselineStatus !== 'stale' || previous.latestSourceContent === undefined) return previous;
      const candidate = mergeDecisions(previous.hunks, previous.decisions);
      return {
        ...createReviewState({
          source: previous.source,
          title: previous.title,
          documentPath: previous.documentPath,
          candidatePath: previous.candidatePath,
          originalContent: previous.latestSourceContent,
          proposedContent: candidate,
          selfCheckStatus: 'warning',
          selfCheckSummary: '候选稿已改用最新源文档作为基线，请人工确认新增差异。',
        }),
        dirty: true,
      };
    });
  }, []);

  const setFeedbackPending = useCallback((feedbackPending: boolean) => {
    setState((previous) => previous.isOpen ? { ...previous, feedbackPending } : previous);
  }, []);

  const setDecision = useCallback((hunkIndex: number, decision: HunkDecision) => {
    setState((previous) => {
      if (!previous.isOpen) return previous;
      const decisionIndex = hunkToDecisionIndex(previous.hunks, hunkIndex);
      if (decisionIndex < 0 || previous.decisions[decisionIndex] === decision) return previous;
      const decisions = previous.decisions.slice();
      decisions[decisionIndex] = decision;
      return { ...previous, decisions, dirty: true };
    });
  }, []);

  const acceptAll = useCallback(() => {
    setState((previous) => previous.isOpen
      ? { ...previous, decisions: previous.decisions.map(() => 'accept'), dirty: true }
      : previous);
  }, []);

  const rejectAll = useCallback(() => {
    setState((previous) => previous.isOpen
      ? { ...previous, decisions: previous.decisions.map(() => 'reject'), dirty: true }
      : previous);
  }, []);

  const focusNext = useCallback(() => {
    setState((previous) => {
      if (!previous.isOpen) return previous;
      const next = findDecidable(previous.hunks, previous.focusIndex, 1);
      return next < 0 || next === previous.focusIndex ? previous : { ...previous, focusIndex: next };
    });
  }, []);

  const focusPrev = useCallback(() => {
    setState((previous) => {
      if (!previous.isOpen) return previous;
      const next = findDecidable(previous.hunks, previous.focusIndex, -1);
      return next < 0 || next === previous.focusIndex ? previous : { ...previous, focusIndex: next };
    });
  }, []);

  const focusHunk = useCallback((hunkIndex: number) => {
    setState((previous) => {
      if (!previous.isOpen || hunkIndex < 0 || hunkIndex >= previous.hunks.length) return previous;
      return isDecidableHunk(previous.hunks[hunkIndex])
        ? { ...previous, focusIndex: hunkIndex }
        : previous;
    });
  }, []);

  const apply = useCallback(async () => {
    if (!state.isOpen || state.selfCheckStatus === 'blocked' || state.baselineStatus === 'stale') return false;
    await onApplyMerged?.(mergeDecisions(state.hunks, state.decisions), state.originalContent);
    clearPersistedCandidate();
    setState(EMPTY_STATE);
    return true;
  }, [clearPersistedCandidate, onApplyMerged, state]);

  const decidableCount = useMemo(() => countDecidableHunks(state.hunks), [state.hunks]);
  const focusOrdinal = useMemo(() => {
    if (state.focusIndex < 0 || !isDecidableHunk(state.hunks[state.focusIndex])) return 0;
    return hunkToDecisionIndex(state.hunks, state.focusIndex) + 1;
  }, [state.focusIndex, state.hunks]);

  return {
    state,
    decidableCount,
    focusOrdinal,
    open,
    close,
    updateCandidate,
    setSelfCheckStatus,
    markBaselineStale,
    resetToLatestSource,
    rebaseCandidateToLatestSource,
    setFeedbackPending,
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
