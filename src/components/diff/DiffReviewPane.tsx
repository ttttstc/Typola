// 候选稿审阅主视图：左侧基线只读，右侧候选可编辑，反馈留在同一页面。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { DiffReviewController } from '../../hooks/useDiffReview';
import {
  isDecidableHunk,
  mergeDecisions,
  type DiffHunk,
  type HunkDecision,
} from '../../services/diff/markdownDiff';
import { DiffReviewBar } from './DiffReviewBar';
import { confirmDialog, messageDialog } from '../../services/dialogService';

export type DiffFeedbackScope = 'current-diff' | 'current-section' | 'all-candidate';

export type DiffFeedbackRequest = {
  text: string;
  scope: DiffFeedbackScope;
  candidateContent: string;
  focusIndex: number;
};

type Props = {
  controller: DiffReviewController;
  onFeedback?: (request: DiffFeedbackRequest) => Promise<void>;
  onRecheck?: () => Promise<void>;
  onSaveAs?: (candidateContent: string) => Promise<void>;
  onResetToLatestSource?: () => Promise<void>;
  onRebaseCandidateToLatestSource?: () => Promise<void>;
};

const SELF_CHECK_LABEL = {
  fresh: '自检通过',
  stale: '自检已过期',
  warning: '自检有警告',
  blocked: '自检阻断',
} as const;

function originalSide(hunk: DiffHunk): string {
  if (hunk.kind === 'modified') return hunk.before;
  if (hunk.kind === 'added') return '';
  return hunk.content;
}

function proposedSide(hunk: DiffHunk): string {
  if (hunk.kind === 'modified') return hunk.after;
  if (hunk.kind === 'removed') return '';
  return hunk.content;
}

function candidateSide(hunk: DiffHunk, decision?: HunkDecision): string {
  if (!isDecidableHunk(hunk) || decision !== 'reject') return proposedSide(hunk);
  return originalSide(hunk);
}

function candidateAfterRowEdit(
  hunks: DiffHunk[],
  decisions: HunkDecision[],
  targetIndex: number,
  nextText: string,
): string {
  let decisionIndex = -1;
  return hunks
    .map((hunk, index) => {
      let decision: HunkDecision | undefined;
      if (isDecidableHunk(hunk)) {
        decisionIndex += 1;
        decision = decisions[decisionIndex] ?? 'accept';
      }
      return index === targetIndex ? nextText : candidateSide(hunk, decision);
    })
    .filter((text) => text.trim().length > 0)
    .join('\n\n');
}

export function DiffReviewPane({
  controller,
  onFeedback,
  onRecheck,
  onSaveAs,
  onResetToLatestSource,
  onRebaseCandidateToLatestSource,
}: Props) {
  const {
    state,
    decidableCount,
    setDecision,
    focusNext,
    focusPrev,
    focusHunk,
    close,
    updateCandidate,
    setFeedbackPending,
    resetToLatestSource,
    rebaseCandidateToLatestSource,
  } = controller;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [navigationCollapsed, setNavigationCollapsed] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [feedbackScope, setFeedbackScope] = useState<DiffFeedbackScope>('current-diff');

  const handleClose = useCallback(async () => {
    if (state.dirty) {
      const ok = await confirmDialog(
        '当前候选稿还有未应用修改，关闭后将丢弃。',
        { title: '放弃当前候选稿？', okLabel: '放弃', cancelLabel: '继续审阅' },
      );
      if (!ok) return;
    }
    close();
  }, [close, state.dirty]);

  useEffect(() => {
    if (!state.isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (
        target.tagName === 'INPUT'
        || target.tagName === 'TEXTAREA'
        || target.tagName === 'SELECT'
        || target.isContentEditable
      )) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        void handleClose();
        return;
      }
      if (state.focusIndex < 0) return;
      if (event.key === 'y' || event.key === 'Y') {
        event.preventDefault();
        setDecision(state.focusIndex, 'accept');
        focusNext();
      } else if (event.key === 'n' || event.key === 'N') {
        event.preventDefault();
        setDecision(state.focusIndex, 'reject');
        focusNext();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (event.shiftKey) focusPrev();
        else focusNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusNext, focusPrev, handleClose, setDecision, state.focusIndex, state.isOpen]);

  useEffect(() => {
    if (state.focusIndex < 0) return;
    const element = scrollerRef.current?.querySelector<HTMLElement>(
      `[data-hunk-index="${state.focusIndex}"]`,
    );
    element?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, [state.focusIndex]);

  const decisionByHunk = useMemo(() => {
    const map = new Map<number, HunkDecision>();
    let decisionIndex = -1;
    state.hunks.forEach((hunk, index) => {
      if (!isDecidableHunk(hunk)) return;
      decisionIndex += 1;
      map.set(index, state.decisions[decisionIndex] ?? 'accept');
    });
    return map;
  }, [state.decisions, state.hunks]);

  const effectiveCandidate = useMemo(
    () => mergeDecisions(state.hunks, state.decisions),
    [state.decisions, state.hunks],
  );

  const handleCandidateEdit = useCallback((hunkIndex: number, text: string) => {
    updateCandidate(candidateAfterRowEdit(state.hunks, state.decisions, hunkIndex, text));
  }, [state.decisions, state.hunks, updateCandidate]);

  const handleFeedback = useCallback(async () => {
    const text = feedback.trim();
    if (!text || !onFeedback || state.feedbackPending) return;
    setFeedbackPending(true);
    try {
      await onFeedback({
        text,
        scope: feedbackScope,
        candidateContent: effectiveCandidate,
        focusIndex: state.focusIndex,
      });
      setFeedback('');
    } finally {
      setFeedbackPending(false);
    }
  }, [effectiveCandidate, feedback, feedbackScope, onFeedback, setFeedbackPending, state.feedbackPending, state.focusIndex]);

  const handleRecheck = useCallback(async () => {
    if (!onRecheck || state.feedbackPending) return;
    setFeedbackPending(true);
    try {
      await onRecheck();
    } finally {
      setFeedbackPending(false);
    }
  }, [onRecheck, setFeedbackPending, state.feedbackPending]);

  if (!state.isOpen) return null;

  return (
    <div className="diff-review-pane" aria-label="AI 改动审阅">
      <DiffReviewBar
        controller={controller}
        onClose={() => void handleClose()}
        onSaveAs={onSaveAs ? () => {
          void onSaveAs(effectiveCandidate).catch((error) => messageDialog(
            `另存候选稿失败：${String(error)}`,
            { title: '另存候选稿失败' },
          ));
        } : undefined}
      />

      <div className="diff-review-status-row">
        <span className={`diff-self-check is-${state.selfCheckStatus}`}>
          {SELF_CHECK_LABEL[state.selfCheckStatus]}
        </span>
        {state.selfCheckStatus === 'stale' && onRecheck && (
          <button type="button" onClick={() => void handleRecheck()} disabled={state.feedbackPending}>
            重新检视
          </button>
        )}
        <span className="diff-review-status-hint">正式文档在点击“应用”前不会改变</span>
      </div>

      {state.selfCheckSummary && (
        <div className={`diff-review-self-check-summary is-${state.selfCheckStatus}`}>
          {state.selfCheckSummary}
        </div>
      )}

      {state.baselineStatus === 'stale' && (
        <div className="diff-review-baseline-stale" role="alert">
          <div>
            <strong>源文档已在候选稿生成后发生变化</strong>
            <span>系统不会自动合并，也不会允许直接应用旧基线上的候选稿。</span>
          </div>
          <div className="diff-review-baseline-stale-actions">
            <button type="button" onClick={() => void (onResetToLatestSource?.() ?? Promise.resolve(resetToLatestSource()))}>以最新文档重新开始</button>
            <button type="button" onClick={() => void (onRebaseCandidateToLatestSource?.() ?? Promise.resolve(rebaseCandidateToLatestSource()))}>保留候选稿并重新对比</button>
          </div>
        </div>
      )}

      <div className={`diff-review-workspace${navigationCollapsed ? ' nav-collapsed' : ''}`}>
        <div className="diff-review-compare" ref={scrollerRef}>
          <div className="diff-review-column-heading">修改前（只读）</div>
          <div className="diff-review-column-heading">候选稿（可编辑）</div>
          <div className="diff-review-baseline" aria-label="修改前原文">
            {state.hunks.map((hunk, index) => {
              const focused = state.focusIndex === index;
              return (
                <pre
                  key={`before-${index}`}
                  className={`diff-review-cell before is-${hunk.kind}${focused ? ' is-focused' : ''}`}
                  data-hunk-index={index}
                  onClick={() => focusHunk(index)}
                >
                  {originalSide(hunk) || ' '}
                </pre>
              );
            })}
          </div>
          <div className="diff-review-candidate" aria-label="候选稿">
            {state.hunks.map((hunk, index) => {
              const decision = decisionByHunk.get(index);
              const focused = state.focusIndex === index;
              const value = candidateSide(hunk, decision);
              return (
                <div
                  key={`after-${index}`}
                  className={`diff-review-cell after is-${hunk.kind}${focused ? ' is-focused' : ''}${decision === 'reject' ? ' is-rejected' : ''}`}
                  data-hunk-index={index}
                  onClick={() => focusHunk(index)}
                >
                  <textarea
                    data-candidate-hunk={index}
                    aria-label={`候选稿片段 ${index + 1}`}
                    value={value}
                    rows={Math.max(2, value.split('\n').length)}
                    placeholder={hunk.kind === 'removed' && decision !== 'reject' ? '此段已删除' : '输入候选内容'}
                    onChange={(event) => handleCandidateEdit(index, event.target.value)}
                  />
                  {isDecidableHunk(hunk) && (
                    <div className="diff-review-cell-actions" onClick={(event) => event.stopPropagation()}>
                      <button
                        type="button"
                        className={decision === 'accept' ? 'is-on' : ''}
                        onClick={() => setDecision(index, 'accept')}
                        aria-label="采纳"
                        title="采纳这处修改"
                      >
                        <Check size={13} />
                      </button>
                      <button
                        type="button"
                        className={decision === 'reject' ? 'is-on' : ''}
                        onClick={() => setDecision(index, 'reject')}
                        aria-label="拒绝"
                        title="保留原文"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <aside className="diff-review-navigation" aria-label="差异导航">
          <button
            type="button"
            className="diff-review-navigation-toggle"
            onClick={() => setNavigationCollapsed((value) => !value)}
            aria-label={navigationCollapsed ? '展开差异导航' : '收起差异导航'}
          >
            {navigationCollapsed ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
          </button>
          {!navigationCollapsed && (
            <>
              <strong>差异导航</strong>
              <ol>
                {state.hunks.map((hunk, index) => isDecidableHunk(hunk) ? (
                  <li key={index}>
                    <button type="button" onClick={() => focusHunk(index)}>
                      {index + 1}. {hunk.kind === 'modified' ? '修改' : hunk.kind === 'added' ? '新增' : '删除'}
                    </button>
                  </li>
                ) : null)}
              </ol>
            </>
          )}
        </aside>
      </div>

      {onFeedback && (
        <div className="diff-review-feedback">
          <textarea
            aria-label="改稿反馈"
            value={feedback}
            placeholder="继续说明你希望怎样修改…"
            onChange={(event) => setFeedback(event.target.value)}
          />
          <select
            aria-label="反馈范围"
            value={feedbackScope}
            onChange={(event) => setFeedbackScope(event.target.value as DiffFeedbackScope)}
          >
            <option value="current-diff">当前差异</option>
            <option value="current-section">当前章节</option>
            <option value="all-candidate">全部候选稿</option>
          </select>
          <button
            type="button"
            onClick={() => void handleFeedback()}
            disabled={!feedback.trim() || state.feedbackPending}
          >
            {state.feedbackPending ? '处理中…' : '继续修改'}
          </button>
        </div>
      )}

      {decidableCount === 0 && <div className="diff-review-empty">候选稿与原文一致。</div>}
    </div>
  );
}
