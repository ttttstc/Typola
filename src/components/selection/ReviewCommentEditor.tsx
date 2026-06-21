// 检视意见输入浮卡 —— 浮条点「加检视意见」后弹出。
// 简单的 textarea + 保存按钮;保存时回调把 (text) 交给 reviewState.addComment。
// 关闭:Esc / 点外部 / 取消。
//
// 跟 SelectionResultCard 风格一致(都是浮卡)。新增意见 vs 编辑现有意见
// 都用同一组件:initialText 不空 → 编辑态(标题改"修改检视意见")。

import { useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';

type Props = {
  open: boolean;
  x: number;
  y: number;
  /** 已选中的原文(用于显示给用户参考,不可编辑) */
  originalText: string;
  /** 现有意见文本(编辑模式);空字符串=新增模式 */
  initialText?: string;
  onSave: (text: string) => void;
  onCancel: () => void;
};

export function ReviewCommentEditor({
  open,
  x,
  y,
  originalText,
  initialText = '',
  onSave,
  onCancel,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(initialText);

  useEffect(() => {
    if (!open) return;
    setText(initialText);
    // open 时自动 focus + 视口边界回弹
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      const card = cardRef.current;
      if (!card) return;
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
    });
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
  }, [open, x, y, initialText, onCancel]);

  if (!open) return null;

  const isEditing = initialText.length > 0;
  const canSave = text.trim().length > 0;

  return (
    <div
      ref={cardRef}
      className="review-comment-editor"
      role="dialog"
      aria-label={isEditing ? '修改检视意见' : '添加检视意见'}
      style={{ left: x, top: y }}
    >
      <div className="review-comment-editor-header">
        <span className="review-comment-editor-title">{isEditing ? '修改检视意见' : '加检视意见'}</span>
        <button
          type="button"
          className="review-comment-editor-close"
          onClick={onCancel}
          title="关闭(Esc)"
          aria-label="关闭"
        >
          <X size={13} />
        </button>
      </div>
      <div className="review-comment-editor-body">
        <div className="review-comment-editor-section">
          <div className="review-comment-editor-label">原文</div>
          <div className="review-comment-editor-original">{originalText}</div>
        </div>
        <div className="review-comment-editor-section">
          <div className="review-comment-editor-label">意见</div>
          <textarea
            ref={textareaRef}
            className="review-comment-editor-textarea"
            value={text}
            placeholder="写下你的修改建议、问题或注释..."
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              // Ctrl/Cmd + Enter 保存
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && canSave) {
                event.preventDefault();
                onSave(text);
              }
            }}
            rows={3}
          />
        </div>
        <div className="review-comment-editor-actions">
          <button
            type="button"
            className="review-comment-editor-primary"
            onClick={() => onSave(text)}
            disabled={!canSave}
            title="保存 Ctrl+Enter"
          >
            <Check size={13} /> 保存
          </button>
          <button type="button" className="review-comment-editor-secondary" onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
