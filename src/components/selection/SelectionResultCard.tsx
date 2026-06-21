// 选区原地结果对比卡 —— 选区浮条「原地闭环」的结果展示层。
//
// 三态:
//   loading: 转圈 + "AI 正在<动作名>..."
//   success: 原文 vs 新版本对比 + [采纳替换] [取消]
//   error:   错误信息 + [重试] [取消]
//
// 定位与 SelectionAIMenu 同源 —— fixed + 视口边界回弹。
// 关闭:Esc / 点击外部 / 点 [取消] / 采纳后自动关闭。

import { useEffect, useRef, useState } from 'react';
import { Check, ClipboardCopy, Loader2, RefreshCcw, Send, X } from 'lucide-react';

export type SelectionResultCardState = 'input' | 'loading' | 'success' | 'error';

type Props = {
  open: boolean;
  x: number;
  y: number;
  state: SelectionResultCardState;
  /** 动作中文名,用在 loading 标签 + 卡顶 */
  actionLabel: string;
  originalText: string;
  newText: string | null;
  error: string | null;
  /** 只展示不替换（如名词解释），显示单文本块 + 复制按钮 */
  displayOnly?: boolean;
  /** input 态默认值(retry 时 prefill 上次填的) */
  initialRequirements?: string;
  onAccept: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onCopy?: () => void;
  /** input 态用户点确认 → 把要求传出去启动真 oneshot */
  onSubmitInput?: (requirements: string) => void;
};

export function SelectionResultCard({
  open,
  x,
  y,
  state,
  actionLabel,
  originalText,
  newText,
  error,
  displayOnly,
  initialRequirements = '',
  onAccept,
  onCancel,
  onRetry,
  onCopy,
  onSubmitInput,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [requirements, setRequirements] = useState(initialRequirements);
  // open / state 变化时 reset 输入(避免上次的要求泄漏到下次)
  useEffect(() => {
    if (open && state === 'input') setRequirements(initialRequirements);
  }, [open, state, initialRequirements]);

  useEffect(() => {
    if (!open) return;
    const card = cardRef.current;
    if (card) {
      const rect = card.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const padding = 8;
      let left = x;
      let top = y;
      if (left + rect.width > vw - padding) left = Math.max(padding, vw - rect.width - padding);
      if (top + rect.height > vh - padding) top = Math.max(padding, vh - rect.height - padding);
      card.style.left = `${left}px`;
      card.style.top = `${top}px`;
    }
    const onDocMouseDown = (event: MouseEvent) => {
      if (!cardRef.current?.contains(event.target as Node)) onCancel();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener('mousedown', onDocMouseDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, x, y, onCancel]);

  if (!open) return null;

  return (
    <div
      ref={cardRef}
      className="selection-result-card"
      role="dialog"
      aria-label={`AI ${actionLabel}结果`}
      style={{ left: x, top: y }}
    >
      <div className="selection-result-card-header">
        <span className="selection-result-card-title">AI {actionLabel}</span>
        <button
          type="button"
          className="selection-result-card-close"
          onClick={onCancel}
          title="关闭(Esc)"
          aria-label="关闭"
        >
          <X size={13} />
        </button>
      </div>

      {state === 'input' && (
        <div className="selection-result-card-body">
          <div className="selection-result-card-section">
            <div className="selection-result-card-label">原文</div>
            <div className="selection-result-card-text selection-result-card-text-original">{originalText}</div>
          </div>
          <div className="selection-result-card-section">
            <div className="selection-result-card-label">{actionLabel}要求(可空,直接确认走默认)</div>
            <textarea
              className="selection-result-card-textarea"
              value={requirements}
              placeholder="例如:更口语 / 改成商务腔 / 保持原意但更精简"
              autoFocus
              rows={2}
              onChange={(e) => setRequirements(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  onSubmitInput?.(requirements);
                }
              }}
            />
          </div>
          <div className="selection-result-card-actions">
            <button
              type="button"
              className="selection-result-card-primary"
              onClick={() => onSubmitInput?.(requirements)}
              title="确认 Ctrl+Enter"
            >
              <Send size={13} /> 确认{actionLabel}
            </button>
            <button type="button" className="selection-result-card-secondary" onClick={onCancel}>
              取消
            </button>
          </div>
        </div>
      )}

      {state === 'loading' && (
        <div className="selection-result-card-body selection-result-card-loading">
          <Loader2 size={16} className="selection-result-card-spin" />
          <span>AI 正在{actionLabel}...</span>
        </div>
      )}

      {state === 'success' && newText !== null && (
        <div className="selection-result-card-body">
          {displayOnly ? (
            <div className="selection-result-card-section">
              <div className="selection-result-card-label">{actionLabel}结果</div>
              <div className="selection-result-card-text selection-result-card-text-new">{newText}</div>
            </div>
          ) : (
            <>
              <div className="selection-result-card-section">
                <div className="selection-result-card-label">原文</div>
                <div className="selection-result-card-text selection-result-card-text-original">{originalText}</div>
              </div>
              <div className="selection-result-card-section">
                <div className="selection-result-card-label">新版本</div>
                <div className="selection-result-card-text selection-result-card-text-new">{newText}</div>
              </div>
            </>
          )}
          <div className="selection-result-card-actions">
            {displayOnly ? (
              <>
                <button
                  type="button"
                  className="selection-result-card-primary"
                  onClick={onCopy}
                  autoFocus
                >
                  <ClipboardCopy size={13} /> 复制
                </button>
                <button type="button" className="selection-result-card-secondary" onClick={onCancel}>
                  关闭
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="selection-result-card-primary"
                  onClick={onAccept}
                  autoFocus
                >
                  <Check size={13} /> 采纳替换
                </button>
                <button type="button" className="selection-result-card-secondary" onClick={onCancel}>
                  取消
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {state === 'error' && (
        <div className="selection-result-card-body">
          <div className="selection-result-card-error">{error || '调用失败'}</div>
          <div className="selection-result-card-actions">
            <button
              type="button"
              className="selection-result-card-primary"
              onClick={onRetry}
              autoFocus
            >
              <RefreshCcw size={13} /> 重试
            </button>
            <button type="button" className="selection-result-card-secondary" onClick={onCancel}>
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
