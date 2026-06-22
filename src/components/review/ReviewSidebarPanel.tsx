// 右栏「检视意见」面板 —— 两视图切换:检视列表(意见 + 导出)/ AI 改稿(发送 + 版本)。
//
// 检视列表视图:
//   - 意见列表 + 编辑/删除/跳转
//   - 底部「导出检视版」按钮(原"导出 review 版"重命名)
//   - 顶部「AI 改稿」按钮(原"发 AI 改")—— 点击切换到 AI 改稿视图,不立刻发送
//
// AI 改稿视图:
//   - 「发 AI 修改」按钮 —— 真正发送 prompt 给 AI
//   - 下方列表展示已生成的 {stem}.ai改{N}.md 文件,点击打开到中间栏
//
// 设计原则:保持与原右栏单模态外观一致(无新增 Tab 抽象),通过 header 切换按钮在
// 两视图间切。

import { Edit3, FileDown, FileText, MessageSquare, RefreshCw, Send, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import type { ReviewComment } from '../../services/review/reviewState';
import type { RevisionEntry } from '../../hooks/useRevisionList';

type View = 'review' | 'aiRevisions';

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
  /** 导出检视版(原"导出 review 版"重命名) */
  onExport: () => void;
  /** 发 AI 修改 —— 把全文 + 意见拼成 prompt 真正发送给 AI(只在 AI 改稿视图调) */
  onSendToAI: () => void;
  /** 关闭右栏检视面板 */
  onClose: () => void;
  /** 当前文档的 AI 改稿列表(来自 useRevisionList) */
  revisions: RevisionEntry[];
  /** 点击 AI 改稿 → 中间栏打开 */
  onOpenRevision: (path: string) => void;
  /** 手动刷新 AI 改稿列表 */
  onRefreshRevisions: () => void;
};

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

// 相对时间显示(几分钟前 / 几小时前 / 几天前 / 直接日期)
function relativeTime(ms: number): string {
  if (!ms) return '';
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} 天前`;
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
  revisions,
  onOpenRevision,
  onRefreshRevisions,
}: Props) {
  const hasComments = comments.length > 0;
  const canAct = hasComments && !!currentFilePath;
  const [view, setView] = useState<View>('review');

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

      <div className="review-sidebar-view-switch" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'review'}
          className={`review-sidebar-view-tab${view === 'review' ? ' active' : ''}`}
          onClick={() => setView('review')}
        >
          检视列表
          {hasComments && <span className="review-sidebar-view-count">{comments.length}</span>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'aiRevisions'}
          className={`review-sidebar-view-tab${view === 'aiRevisions' ? ' active' : ''}`}
          onClick={() => setView('aiRevisions')}
        >
          AI 改稿
          {revisions.length > 0 && <span className="review-sidebar-view-count">{revisions.length}</span>}
        </button>
      </div>

      {view === 'review' && (
        <ReviewListView
          comments={comments}
          hasComments={hasComments}
          canAct={canAct}
          currentFilePath={currentFilePath}
          onJump={onJump}
          onEdit={onEdit}
          onRemove={onRemove}
          onExport={onExport}
        />
      )}

      {view === 'aiRevisions' && (
        <AIRevisionsView
          currentFilePath={currentFilePath}
          canSend={canAct}
          onSendToAI={onSendToAI}
          revisions={revisions}
          onOpenRevision={onOpenRevision}
          onRefreshRevisions={onRefreshRevisions}
        />
      )}
    </aside>
  );
}

// 检视列表视图 —— 意见列表 + 导出按钮
function ReviewListView({
  comments,
  hasComments,
  canAct,
  currentFilePath,
  onJump,
  onEdit,
  onRemove,
  onExport,
}: {
  comments: ReviewComment[];
  hasComments: boolean;
  canAct: boolean;
  currentFilePath?: string;
  onJump: (c: ReviewComment) => void;
  onEdit: (c: ReviewComment) => void;
  onRemove: (id: string) => void;
  onExport: () => void;
}) {
  return (
    <>
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

      <div className="review-sidebar-actions review-sidebar-actions-bottom">
        <button
          type="button"
          className="review-sidebar-action review-sidebar-action-export"
          disabled={!canAct}
          onClick={onExport}
          title={canAct ? '把意见以行内段后格式注入,另存为 review.md' : '没有意见或未打开文档'}
        >
          <FileDown size={13} /> 导出检视版
        </button>
      </div>
    </>
  );
}

// AI 改稿视图 —— 「发 AI 修改」按钮 + 版本列表
function AIRevisionsView({
  currentFilePath,
  canSend,
  onSendToAI,
  revisions,
  onOpenRevision,
  onRefreshRevisions,
}: {
  currentFilePath?: string;
  canSend: boolean;
  onSendToAI: () => void;
  revisions: RevisionEntry[];
  onOpenRevision: (path: string) => void;
  onRefreshRevisions: () => void;
}) {
  return (
    <>
      {currentFilePath && (
        <section className="review-sidebar-revisions" aria-label="AI 改稿">
          <div className="review-sidebar-revisions-actions">
            <button
              type="button"
              className="review-sidebar-action review-sidebar-action-send"
              disabled={!canSend}
              onClick={onSendToAI}
              title={canSend ? '把全文 + 所有意见拼成 prompt 真正发送给 AI' : '没有意见或未打开文档'}
            >
              <Send size={13} /> 发 AI 修改
            </button>
            <button
              type="button"
              className="review-sidebar-revisions-refresh"
              onClick={onRefreshRevisions}
              title="重新扫描 .typola-output"
              aria-label="刷新 AI 改稿列表"
            >
              <RefreshCw size={11} />
            </button>
          </div>
          <header className="review-sidebar-revisions-header">
            <span className="review-sidebar-revisions-title">
              <FileText size={12} /> 已有改稿
              {revisions.length > 0 && (
                <span className="review-sidebar-revisions-count">{revisions.length}</span>
              )}
            </span>
          </header>
          {revisions.length === 0 ? (
            <p className="review-sidebar-revisions-empty">
              暂无 AI 改稿。点上方「发 AI 修改」让 AI 生成。
            </p>
          ) : (
            <ol className="review-sidebar-revisions-list">
              {revisions.map((rev) => (
                <li key={rev.path}>
                  <button
                    type="button"
                    className="review-sidebar-revisions-item"
                    onClick={() => onOpenRevision(rev.path)}
                    title={`打开 ${rev.path}`}
                  >
                    <span className="review-sidebar-revisions-item-name">{rev.name}</span>
                    <span className="review-sidebar-revisions-item-time">{relativeTime(rev.mtime)}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
      {!currentFilePath && (
        <div className="review-sidebar-empty">请先打开一个文档</div>
      )}
    </>
  );
}