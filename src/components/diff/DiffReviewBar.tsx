// Diff 审阅态顶部条:计数器 + 上/下一处导航 + 全采/全拒/应用按钮 + 关闭。
// 键盘快捷键由 DiffReviewPane 父容器统一挂(避免重复挂载冲突)。

import { ChevronDown, ChevronUp, Check, GitCompare, X } from 'lucide-react';
import type { DiffReviewController } from '../../hooks/useDiffReview';
import { messageDialog } from '../../services/dialogService';

type Props = {
  controller: DiffReviewController;
  onClose: () => void;
  onSaveAs?: () => void;
};

const SOURCE_LABEL: Record<string, string> = {
  review: '审阅 AI 改稿',
  skill: '审阅 Skill 产物',
  'merge-artifact': '合并到当前文档',
};

export function DiffReviewBar({ controller, onClose, onSaveAs }: Props) {
  const { state, decidableCount, focusOrdinal, acceptAll, rejectAll, focusNext, focusPrev, apply } = controller;
  const headerLabel = state.title || SOURCE_LABEL[state.source] || '审阅 AI 改动';

  return (
    <div className="diff-review-bar" role="toolbar" aria-label="AI 改动审阅工具栏">
      <GitCompare size={16} strokeWidth={1.6} className="diff-review-bar-icon" />
      <span className="diff-review-bar-title">{headerLabel}</span>

      <div className="diff-review-bar-counter">
        <button
          type="button"
          className="diff-review-bar-navbtn"
          data-tooltip="上一处 (Shift+Enter)"
          aria-label="上一处"
          onClick={focusPrev}
          disabled={decidableCount === 0}
        >
          <ChevronUp size={14} strokeWidth={1.8} />
        </button>
        <span className="diff-review-bar-ordinal">
          {decidableCount === 0 ? '无改动' : `第 ${focusOrdinal} / ${decidableCount} 处`}
        </span>
        <button
          type="button"
          className="diff-review-bar-navbtn"
          data-tooltip="下一处 (Enter)"
          aria-label="下一处"
          onClick={focusNext}
          disabled={decidableCount === 0}
        >
          <ChevronDown size={14} strokeWidth={1.8} />
        </button>
      </div>

      <div className="diff-review-bar-actions">
        <button
          type="button"
          className="diff-review-bar-actionbtn"
          onClick={acceptAll}
          disabled={decidableCount === 0}
        >
          全部采纳
        </button>
        <button
          type="button"
          className="diff-review-bar-actionbtn"
          onClick={rejectAll}
          disabled={decidableCount === 0}
        >
          全部拒绝
        </button>
        {onSaveAs && (
          <button type="button" className="diff-review-bar-actionbtn" onClick={onSaveAs}>
            另存为
          </button>
        )}
        <button
          type="button"
          className="diff-review-bar-applybtn"
          onClick={() => {
            void apply().catch((error) => messageDialog(`应用候选稿失败：${String(error)}`, {
              title: '应用候选稿失败',
            }));
          }}
          disabled={state.selfCheckStatus === 'blocked' || state.baselineStatus === 'stale'}
          data-tooltip="把当前选择写回当前文档"
        >
          <Check size={14} strokeWidth={1.8} /> 应用
        </button>
        <button
          type="button"
          className="diff-review-bar-closebtn"
          onClick={onClose}
          data-tooltip="关闭(放弃本次审阅)"
          aria-label="关闭"
        >
          <X size={14} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}
