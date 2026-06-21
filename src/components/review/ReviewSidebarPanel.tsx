// 右栏「检视意见」汇总面板 —— 列表展示当前文档所有意见,支持跳转/编辑/删除/导出/发 AI 改。
//
// 设计:跟 SkillHubPanel 在右栏并列,通过 rightPanelMode 切换。
//
// 显示策略:每条意见显示:
//   - 引用片段(取自 anchor.originalText,截断)
//   - 意见正文(以 **检视意见，请处理** 开头的视觉风格 — 但 UI 上简化只展示意见文字 + 标识徽章)
//   - 编辑/删除/跳转 三个操作
//
// 任务 #14/#15 会接「导出 review md」和「发 AI 改」两个工具栏按钮。

import { Edit3, FileDown, MessageSquare, Send, Trash2, X } from 'lucide-react';
import type { ReviewComment } from '../../services/review/reviewState';

type Props = {
  comments: ReviewComment[];
  dirty: boolean;
  /** 当前文档路径(用于显示 + dirty 判断;无文档时 disabled 所有操作) */
  currentFilePath?: string;
  /** 点击意见 → 跳转到锚点 */
  onJump: (comment: ReviewComment) => void;
  /** 编辑意见 → 弹 ReviewCommentEditor 浮卡 */
  onEdit: (comment: ReviewComment) => void;
  /** 删除一条 */
  onRemove: (commentId: string) => void;
  /** 导出 review md(任务 #14) */
  onExport: () => void;
  /** 发 AI 改(任务 #15) */
  onSendToAI: () => void;
  /** 关闭右栏检视面板 */
  onClose: () => void;
};

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

export function ReviewSidebarPanel({
  comments,
  dirty,
  currentFilePath,
  onJump,
  onEdit,
  onRemove,
  onExport,
  onSendToAI,
  onClose,
}: Props) {
  const hasComments = comments.length > 0;
  const canAct = hasComments && !!currentFilePath;
  return (
    <aside className="review-sidebar-panel" aria-label="检视意见">
      <div className="review-sidebar-header">
        <div className="review-sidebar-title">
          <MessageSquare size={14} />
          <span>检视意见</span>
          {hasComments && <span className="review-sidebar-count">{comments.length}</span>}
          {dirty && <span className="review-sidebar-dot" title="有未保存的检视意见" aria-label="未保存" />}
        </div>
        <button
          type="button"
          className="review-sidebar-close"
          onClick={onClose}
          title="关闭检视面板"
          aria-label="关闭检视面板"
        >
          <X size={14} />
        </button>
      </div>
      <div className="review-sidebar-actions">
        <button
          type="button"
          className="review-sidebar-action review-sidebar-action-export"
          disabled={!canAct}
          onClick={onExport}
          title={canAct ? '把意见以行内段后格式注入,另存为 review.md' : '没有意见或未打开文档'}
        >
          <FileDown size={13} /> 导出 review 版
        </button>
        <button
          type="button"
          className="review-sidebar-action review-sidebar-action-send"
          disabled={!canAct}
          onClick={onSendToAI}
          title={canAct ? '把全文 + 所有意见拼成 prompt 交给 AI 改' : '没有意见或未打开文档'}
        >
          <Send size={13} /> 发 AI 改
        </button>
      </div>

      {!currentFilePath && (
        <div className="review-sidebar-empty">请先打开一个文档</div>
      )}
      {currentFilePath && !hasComments && (
        <div className="review-sidebar-empty">
          <p>当前文档暂无检视意见</p>
          <p className="review-sidebar-empty-hint">
            选中正文 → 浮条「加检视意见」即可加批注。
          </p>
        </div>
      )}

      {hasComments && (
        <ol className="review-sidebar-list">
          {comments.map((comment, idx) => (
            <li key={comment.id} className="review-sidebar-item">
              <button
                type="button"
                className="review-sidebar-item-main"
                onClick={() => onJump(comment)}
                title="跳转到原文片段"
              >
                <span className="review-sidebar-item-index">#{idx + 1}</span>
                <span className="review-sidebar-item-quote">{truncate(comment.anchor.originalText, 60)}</span>
                <span className="review-sidebar-item-text">{comment.text}</span>
              </button>
              <div className="review-sidebar-item-tools">
                <button
                  type="button"
                  className="review-sidebar-item-tool"
                  onClick={() => onEdit(comment)}
                  title="编辑意见"
                  aria-label="编辑意见"
                >
                  <Edit3 size={12} />
                </button>
                <button
                  type="button"
                  className="review-sidebar-item-tool review-sidebar-item-tool-danger"
                  onClick={() => onRemove(comment.id)}
                  title="删除"
                  aria-label="删除意见"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
