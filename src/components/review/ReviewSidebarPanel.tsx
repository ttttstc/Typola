// 右栏「检视意见」面板 —— 人工与 AI 意见共用一份列表,AI 改稿沿用原视图。

import {
  Edit3,
  EyeOff,
  FileDown,
  FileText,
  GitCompare,
  History,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useState } from 'react';
import {
  getActiveReviewComments,
  type ReviewComment,
} from '../../services/review/reviewState';
import type { RevisionEntry } from '../../hooks/useRevisionList';
import type { DocumentHistoryEntry } from '../../services/review/documentHistoryService';
import { findUniqueAnchor } from '../../services/agent/selectionActions';
import { lineNumberForAnchor } from '../../services/review/reviewState';
import type { AIRewriteScope } from '../../services/review/aiRewriteScope';

type View = 'review' | 'aiRevisions';
type ReviewFilter = 'all' | 'human' | 'ai' | 'ignored';

export type AIReviewSettings = {
  useStyleGuide: boolean;
  skillName?: string;
  requirement: string;
};

export type { AIRewriteScope } from '../../services/review/aiRewriteScope';

export type AIRewriteRequest = {
  scope: AIRewriteScope;
  requirement: string;
};

export type ReviewSkillOption = { name: string; label: string };

type Props = {
  comments: ReviewComment[];
  dirty: boolean;
  currentFilePath?: string;
  currentSource?: string;
  onJump: (comment: ReviewComment) => void;
  onEdit: (comment: ReviewComment) => void;
  onRemove: (commentId: string) => void;
  onSetIgnored: (commentId: string, ignored: boolean) => void;
  onExport: () => void;
  onSendToAI: () => void;
  onClose: () => void;
  revisions: RevisionEntry[];
  onOpenRevision: (path: string) => void;
  onReviewRevision: (path: string) => void;
  onRefreshRevisions: () => void;
  histories?: DocumentHistoryEntry[];
  onReviewHistory?: (path: string) => void;
  onRefreshHistories?: () => void;
  styleGuidePath?: string;
  reviewSkills?: ReviewSkillOption[];
  aiReviewRunning?: boolean;
  onStartAIReview?: (settings: AIReviewSettings) => void;
  aiRewriteRunning?: boolean;
  onStartAIRewrite?: (request: AIRewriteRequest) => void;
};

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

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
  currentSource = '',
  onJump,
  onEdit,
  onRemove,
  onSetIgnored,
  onExport,
  onSendToAI,
  onClose,
  revisions,
  onOpenRevision,
  onReviewRevision,
  onRefreshRevisions,
  histories = [],
  onReviewHistory,
  onRefreshHistories,
  styleGuidePath,
  reviewSkills = [],
  aiReviewRunning = false,
  onStartAIReview,
  aiRewriteRunning = false,
  onStartAIRewrite,
}: Props) {
  const activeComments = getActiveReviewComments(comments);
  const ignoredCount = comments.length - activeComments.length;
  const hasComments = activeComments.length > 0;
  const canAct = hasComments && !!currentFilePath;
  const [view, setView] = useState<View>('review');

  return (
    <aside className="review-sidebar-panel" aria-label="检视意见">
      <div className="review-sidebar-header">
        <div className="review-sidebar-title">
          <MessageSquare size={14} />
          <span>检视意见</span>
          {hasComments && <span className="review-sidebar-count">{activeComments.length}</span>}
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
          {hasComments && <span className="review-sidebar-view-count">{activeComments.length}</span>}
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
          activeComments={activeComments}
          ignoredCount={ignoredCount}
          canAct={canAct}
          currentFilePath={currentFilePath}
          currentSource={currentSource}
          onJump={onJump}
          onEdit={onEdit}
          onRemove={onRemove}
          onSetIgnored={onSetIgnored}
          onExport={onExport}
          styleGuidePath={styleGuidePath}
          reviewSkills={reviewSkills}
          aiReviewRunning={aiReviewRunning}
          onStartAIReview={onStartAIReview}
        />
      )}

      {view === 'aiRevisions' && (
        <AIRevisionsView
          currentFilePath={currentFilePath}
          canSend={canAct}
          onSendToAI={onSendToAI}
          revisions={revisions}
          onOpenRevision={onOpenRevision}
          onReviewRevision={onReviewRevision}
          onRefreshRevisions={onRefreshRevisions}
          histories={histories}
          onReviewHistory={onReviewHistory}
          onRefreshHistories={onRefreshHistories}
          aiRewriteRunning={aiRewriteRunning}
          onStartAIRewrite={onStartAIRewrite}
        />
      )}
    </aside>
  );
}

function ReviewListView({
  comments,
  activeComments,
  ignoredCount,
  canAct,
  currentFilePath,
  currentSource,
  onJump,
  onEdit,
  onRemove,
  onSetIgnored,
  onExport,
  styleGuidePath,
  reviewSkills,
  aiReviewRunning,
  onStartAIReview,
}: {
  comments: ReviewComment[];
  activeComments: ReviewComment[];
  ignoredCount: number;
  canAct: boolean;
  currentFilePath?: string;
  currentSource: string;
  onJump: (comment: ReviewComment) => void;
  onEdit: (comment: ReviewComment) => void;
  onRemove: (commentId: string) => void;
  onSetIgnored: (commentId: string, ignored: boolean) => void;
  onExport: () => void;
  styleGuidePath?: string;
  reviewSkills: ReviewSkillOption[];
  aiReviewRunning: boolean;
  onStartAIReview?: (settings: AIReviewSettings) => void;
}) {
  const [filter, setFilter] = useState<ReviewFilter>('all');
  const [useStyleGuide, setUseStyleGuide] = useState(true);
  const [skillName, setSkillName] = useState('');
  const [requirement, setRequirement] = useState('');
  const filteredComments = filter === 'ignored'
    ? comments.filter((comment) => comment.status === 'ignored')
    : activeComments.filter((comment) => filter === 'all' || comment.source === filter);
  const visibleComments = [...filteredComments].sort((left, right) => {
    const leftPosition = findUniqueAnchor(currentSource, left.anchor.originalText, left.anchor.prefixHint)?.start;
    const rightPosition = findUniqueAnchor(currentSource, right.anchor.originalText, right.anchor.prefixHint)?.start;
    return (leftPosition ?? Number.MAX_SAFE_INTEGER) - (rightPosition ?? Number.MAX_SAFE_INTEGER)
      || left.createdAt - right.createdAt;
  });

  return (
    <>
      {currentFilePath && onStartAIReview && (
        <details className="review-sidebar-ai-inspection">
          <summary><Sparkles size={12} /> AI 检视</summary>
          <label className="review-sidebar-ai-option">
            <input
              type="checkbox"
              checked={useStyleGuide && Boolean(styleGuidePath)}
              disabled={!styleGuidePath}
              onChange={(event) => setUseStyleGuide(event.target.checked)}
            />
            {styleGuidePath ? '当前项目 style.md' : '未发现 style.md'}
          </label>
          <label className="review-sidebar-ai-field">
            <span>Skill（可选）</span>
            <select value={skillName} onChange={(event) => setSkillName(event.target.value)}>
              <option value="">不使用</option>
              {reviewSkills.map((skill) => <option key={skill.name} value={skill.name}>{skill.label}</option>)}
            </select>
          </label>
          <label className="review-sidebar-ai-field">
            <span>本次要求</span>
            <textarea
              value={requirement}
              placeholder="例如：重点检查重复论证和报告腔"
              onChange={(event) => setRequirement(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="review-sidebar-action review-sidebar-action-send"
            disabled={aiReviewRunning}
            onClick={() => onStartAIReview({
              useStyleGuide: useStyleGuide && Boolean(styleGuidePath),
              skillName: skillName || undefined,
              requirement: requirement.trim(),
            })}
          >
            <Sparkles size={13} /> {aiReviewRunning ? '检视中…' : '开始检视'}
          </button>
        </details>
      )}

      <div className="review-sidebar-filter-row" role="tablist" aria-label="检视意见筛选">
        {([
          ['all', '全部'],
          ['human', '人工'],
          ['ai', 'AI'],
          ['ignored', `已忽略${ignoredCount ? ` ${ignoredCount}` : ''}`],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`review-sidebar-filter${filter === value ? ' is-active' : ''}`}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {!currentFilePath && <div className="review-sidebar-empty">请先打开一个文档</div>}
      {currentFilePath && visibleComments.length === 0 && filter !== 'ignored' && (
        <div className="review-sidebar-empty">
          <p>{activeComments.length === 0 ? '当前文档暂无有效检视意见' : '当前筛选下暂无意见'}</p>
          <p className="review-sidebar-empty-hint">选中正文 → 浮条「加检视意见」即可加批注。</p>
        </div>
      )}
      {currentFilePath && filter === 'ignored' && visibleComments.length === 0 && (
        <div className="review-sidebar-empty">暂无已忽略意见</div>
      )}

      {visibleComments.length > 0 && (
        <ol className="review-sidebar-list">
          {visibleComments.map((comment, index) => {
            const ignored = comment.status === 'ignored';
            const anchorHit = findUniqueAnchor(currentSource, comment.anchor.originalText, comment.anchor.prefixHint);
            const line = anchorHit ? lineNumberForAnchor(currentSource, anchorHit.start) : null;
            return (
              <li
                key={comment.id}
                className={`review-sidebar-item${ignored ? ' is-ignored' : ''}`}
              >
                <button
                  type="button"
                  className="review-sidebar-item-main"
                  onClick={() => onJump(comment)}
                  title="跳转到原文片段"
                >
                  <span className="review-sidebar-item-meta">
                    <span className="review-sidebar-item-index">#{index + 1}</span>
                    <span className="review-sidebar-item-line">{line ? `L${line}` : '位置已变化'}</span>
                    <span className={`review-sidebar-item-source is-${comment.source}`}>
                      {comment.source === 'ai' ? 'AI' : '人工'}
                    </span>
                    {comment.source === 'ai' && comment.basis && (
                      <span className="review-sidebar-item-basis">依据：{comment.basis.label}</span>
                    )}
                  </span>
                  <span className="review-sidebar-item-quote">{truncate(comment.anchor.originalText, 60)}</span>
                  <span className="review-sidebar-item-text">{comment.text}</span>
                </button>
                <div className="review-sidebar-item-tools">
                  {!ignored && comment.source === 'human' && (
                    <button
                      type="button"
                      className="review-sidebar-item-tool"
                      onClick={() => onEdit(comment)}
                      title="编辑意见"
                      aria-label="编辑意见"
                    >
                      <Edit3 size={12} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="review-sidebar-item-tool"
                    onClick={() => onSetIgnored(comment.id, !ignored)}
                    title={ignored ? '恢复意见' : '忽略意见'}
                    aria-label={ignored ? '恢复意见' : '忽略意见'}
                  >
                    {ignored ? <RotateCcw size={12} /> : <EyeOff size={12} />}
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
            );
          })}
        </ol>
      )}

      <div className="review-sidebar-actions review-sidebar-actions-bottom">
        <button
          type="button"
          className="review-sidebar-action review-sidebar-action-export"
          disabled={!canAct}
          onClick={onExport}
          title={canAct ? '另存为带可恢复检视意见的 Markdown' : '没有有效意见或未打开文档'}
        >
          <FileDown size={13} /> 导出检视版
        </button>
      </div>
    </>
  );
}

function AIRevisionsView({
  currentFilePath,
  canSend,
  onSendToAI,
  revisions,
  onOpenRevision,
  onReviewRevision,
  onRefreshRevisions,
  histories,
  onReviewHistory,
  onRefreshHistories,
  aiRewriteRunning,
  onStartAIRewrite,
}: {
  currentFilePath?: string;
  canSend: boolean;
  onSendToAI: () => void;
  revisions: RevisionEntry[];
  onOpenRevision: (path: string) => void;
  onReviewRevision: (path: string) => void;
  onRefreshRevisions: () => void;
  histories: DocumentHistoryEntry[];
  onReviewHistory?: (path: string) => void;
  onRefreshHistories?: () => void;
  aiRewriteRunning: boolean;
  onStartAIRewrite?: (request: AIRewriteRequest) => void;
}) {
  const [rewriteScope, setRewriteScope] = useState<AIRewriteScope>('section');
  const [rewriteRequirement, setRewriteRequirement] = useState('');

  return (
    <>
      {currentFilePath && (
        <>
        <section className="review-sidebar-revisions" aria-label="AI 改稿">
          {onStartAIRewrite && (
            <div className="review-sidebar-rewrite-request">
              <label className="review-sidebar-ai-field">
                <span>修改范围</span>
                <select
                  value={rewriteScope}
                  onChange={(event) => setRewriteScope(event.target.value as AIRewriteScope)}
                >
                  <option value="selection">选中文本</option>
                  <option value="section">当前章节</option>
                  <option value="document">全文</option>
                </select>
              </label>
              <label className="review-sidebar-ai-field">
                <span>改稿要求</span>
                <textarea
                  value={rewriteRequirement}
                  placeholder="例如：这一节再自然一点，压缩重复论证"
                  onChange={(event) => setRewriteRequirement(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="review-sidebar-action review-sidebar-action-send"
                disabled={aiRewriteRunning || !rewriteRequirement.trim()}
                onClick={() => onStartAIRewrite({
                  scope: rewriteScope,
                  requirement: rewriteRequirement.trim(),
                })}
              >
                <Sparkles size={13} /> {aiRewriteRunning ? '改稿中…' : '生成候选稿'}
              </button>
            </div>
          )}
          <div className="review-sidebar-revisions-actions">
            <button
              type="button"
              className="review-sidebar-action review-sidebar-action-send"
              disabled={!canSend}
              onClick={onSendToAI}
              title={canSend ? '按当前有效意见发起 AI 修改' : '没有有效意见或未打开文档'}
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
            <p className="review-sidebar-revisions-empty">暂无 AI 改稿。点上方「发 AI 修改」让 AI 生成。</p>
          ) : (
            <ol className="review-sidebar-revisions-list">
              {revisions.map((revision) => (
                <li key={revision.path} className="review-sidebar-revisions-item-row">
                  <button
                    type="button"
                    className="review-sidebar-revisions-item"
                    onClick={() => onOpenRevision(revision.path)}
                    title={`打开 ${revision.path}`}
                  >
                    <span className="review-sidebar-revisions-item-name">{revision.name}</span>
                    <span className="review-sidebar-revisions-item-time">{relativeTime(revision.mtime)}</span>
                  </button>
                  <button
                    type="button"
                    className="review-sidebar-revisions-diffbtn"
                    onClick={() => onReviewRevision(revision.path)}
                    title="以 Diff 审阅（分段对比 + 逐段采纳）"
                    aria-label="以 Diff 审阅"
                  >
                    <GitCompare size={12} />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="review-sidebar-revisions" aria-label="文档历史版本">
          <header className="review-sidebar-revisions-header">
            <span className="review-sidebar-revisions-title">
              <History size={12} /> 应用前历史
              {histories.length > 0 && (
                <span className="review-sidebar-revisions-count">{histories.length}</span>
              )}
            </span>
            {onRefreshHistories && (
              <button
                type="button"
                className="review-sidebar-revisions-refresh"
                onClick={onRefreshHistories}
                title="刷新历史版本"
                aria-label="刷新历史版本"
              >
                <RefreshCw size={11} />
              </button>
            )}
          </header>
          {histories.length === 0 ? (
            <p className="review-sidebar-revisions-empty">应用候选稿后，这里会保留应用前版本。</p>
          ) : (
            <ol className="review-sidebar-revisions-list">
              {histories.map((history) => (
                <li key={history.path} className="review-sidebar-revisions-item-row">
                  <button
                    type="button"
                    className="review-sidebar-revisions-item"
                    onClick={() => onReviewHistory?.(history.path)}
                    title="与当前文档对比后恢复"
                  >
                    <span className="review-sidebar-revisions-item-name">{history.name}</span>
                    <span className="review-sidebar-revisions-item-time">{relativeTime(history.mtime)}</span>
                  </button>
                  <button
                    type="button"
                    className="review-sidebar-revisions-diffbtn"
                    onClick={() => onReviewHistory?.(history.path)}
                    title="以 Diff 审阅历史版本"
                    aria-label="以 Diff 审阅历史版本"
                  >
                    <GitCompare size={12} />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
        </>
      )}
      {!currentFilePath && <div className="review-sidebar-empty">请先打开一个文档</div>}
    </>
  );
}
