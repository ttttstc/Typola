// AI Diff Preview 内联审阅态主视图。
// 覆盖中间编辑区(渲染条件由 AppLayout 控制),只读 DOM:
//   - unchanged 段:正常段落显示
//   - modified 段:原文 strikethrough + 新版高亮 + ✓/✗ 按钮
//   - added 段:全段绿色高亮 + ✓/✗
//   - removed 段:全段红色 strikethrough + ✓(采纳删除)/✗(保留)
// 当前焦点 hunk 加蓝色边框 + 滚到视图中央。
// 键盘:Y 采纳 / N 拒绝 / Enter 下一处 / Shift+Enter 上一处 / Esc 关闭。

import { useEffect, useMemo, useRef } from 'react';
import { Check, X } from 'lucide-react';
import type { DiffReviewController } from '../../hooks/useDiffReview';
import { isDecidableHunk } from '../../services/diff/markdownDiff';
import { DiffReviewBar } from './DiffReviewBar';
import { DiffGutterMap } from './DiffGutterMap';
import { confirmDialog } from '../../services/dialogService';

type Props = {
  controller: DiffReviewController;
};

export function DiffReviewPane({ controller }: Props) {
  const { state, decidableCount, setDecision, focusNext, focusPrev, focusHunk, close } = controller;
  const scrollerRef = useRef<HTMLDivElement>(null);

  // SPEC §2.7:关闭前若已 dirty 弹轻确认。
  const handleClose = async () => {
    if (state.dirty) {
      const ok = await confirmDialog(
        '当前有未应用的采纳/拒绝选择,关闭后将丢失,可从产物 chip 重新发起。',
        { title: '放弃本次 AI 审阅?', okLabel: '放弃', cancelLabel: '继续审阅' },
      );
      if (!ok) return;
    }
    close();
  };

  // 全局键盘:Y/N/Enter/Shift+Enter/Esc。
  useEffect(() => {
    if (!state.isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      // 在 input/textarea/contenteditable 内忽略
      const target = e.target as HTMLElement | null;
      if (target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      )) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        void handleClose();
        return;
      }
      if (state.focusIndex < 0) return;
      if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault();
        setDecision(state.focusIndex, 'accept');
        focusNext();
        return;
      }
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setDecision(state.focusIndex, 'reject');
        focusNext();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) focusPrev();
        else focusNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.isOpen, state.focusIndex, state.dirty, setDecision, focusNext, focusPrev]);

  // 焦点变化时滚到屏幕中央
  useEffect(() => {
    if (state.focusIndex < 0) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const el = scroller.querySelector<HTMLElement>(`[data-hunk-index="${state.focusIndex}"]`);
    if (!el) return;
    const elTop = el.offsetTop;
    const target = elTop - scroller.clientHeight / 2 + el.clientHeight / 2;
    scroller.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  }, [state.focusIndex]);

  // 把 hunks 内每个可决策项对应的 decisionIndex 算出来(渲染时直接用)
  const hunkToDecisionIndex = useMemo(() => {
    const map = new Map<number, number>();
    let di = -1;
    state.hunks.forEach((hunk, i) => {
      if (isDecidableHunk(hunk)) {
        di += 1;
        map.set(i, di);
      }
    });
    return map;
  }, [state.hunks]);

  if (!state.isOpen) return null;

  return (
    <div className="diff-review-pane" aria-label="AI 改动审阅">
      <DiffReviewBar controller={controller} onClose={() => void handleClose()} />
      <div className="diff-review-scroll-wrap">
        <div className="diff-review-scroll" ref={scrollerRef}>
          <div className="diff-review-doc">
            {decidableCount === 0 ? (
              <div className="diff-review-empty">AI 给的版本跟原文一致,无可审阅的改动。</div>
            ) : (
              state.hunks.map((hunk, hunkIndex) => {
                const decisionIndex = hunkToDecisionIndex.get(hunkIndex);
                const decision = decisionIndex !== undefined ? state.decisions[decisionIndex] : null;
                const focused = hunkIndex === state.focusIndex;
                if (hunk.kind === 'unchanged') {
                  return (
                    <p key={hunkIndex} className="diff-hunk diff-hunk--unchanged">{hunk.content}</p>
                  );
                }
                const cardClass = [
                  'diff-hunk',
                  `diff-hunk--${hunk.kind}`,
                  decision === 'reject' ? 'diff-hunk--rejected' : 'diff-hunk--accepted',
                  focused ? 'diff-hunk--focused' : '',
                ].filter(Boolean).join(' ');
                return (
                  <div
                    key={hunkIndex}
                    className={cardClass}
                    data-hunk-index={hunkIndex}
                    onClick={() => focusHunk(hunkIndex)}
                  >
                    <div className="diff-hunk-body">
                      {hunk.kind === 'modified' && (
                        <>
                          <div className="diff-hunk-line diff-hunk-line--before">{hunk.before}</div>
                          <div className="diff-hunk-line diff-hunk-line--after">{hunk.after}</div>
                        </>
                      )}
                      {hunk.kind === 'added' && (
                        <div className="diff-hunk-line diff-hunk-line--after">+ {hunk.content}</div>
                      )}
                      {hunk.kind === 'removed' && (
                        <div className="diff-hunk-line diff-hunk-line--before">− {hunk.content}</div>
                      )}
                    </div>
                    <div className="diff-hunk-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className={`diff-hunk-actbtn ${decision === 'accept' ? 'is-on' : ''}`}
                        onClick={() => setDecision(hunkIndex, 'accept')}
                        data-tooltip={hunk.kind === 'removed' ? '采纳删除 (Y)' : '采纳 (Y)'}
                        aria-label="采纳"
                      >
                        <Check size={14} strokeWidth={2} />
                      </button>
                      <button
                        type="button"
                        className={`diff-hunk-actbtn ${decision === 'reject' ? 'is-on' : ''}`}
                        onClick={() => setDecision(hunkIndex, 'reject')}
                        data-tooltip={hunk.kind === 'removed' ? '保留原段 (N)' : '拒绝 (N)'}
                        aria-label="拒绝"
                      >
                        <X size={14} strokeWidth={2} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <DiffGutterMap
            hunks={state.hunks}
            decisions={state.decisions}
            focusIndex={state.focusIndex}
            onFocus={focusHunk}
          />
        </div>
      </div>
    </div>
  );
}
