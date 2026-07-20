// 右栏检视工作台：统一管理意见、发起改稿并查看历史版本。

import {
  ArrowLeft,
  ChevronDown,
  EyeOff,
  FileDown,
  FilePlus2,
  FileText,
  GitCompare,
  History,
  LoaderCircle,
  LocateFixed,
  MessageSquare,
  RefreshCw,
  Send,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import {
  getActiveReviewComments,
  type ReviewComment,
} from '../../services/review/reviewState';
import type { RevisionEntry } from '../../hooks/useRevisionList';
import type { DocumentHistoryEntry } from '../../services/review/documentHistoryService';
import { findUniqueAnchor } from '../../services/agent/selectionActions';
import { lineNumberForAnchor } from '../../services/review/reviewState';

type View = 'review' | 'history';
type ReviewFilter = 'all' | 'human' | 'ai' | 'ignored';

export type AIReviewSettings = {
  rulePaths: string[];
  skillNames: string[];
  requirement: string;
};

export type ReviewSkillOption = { name: string; label: string };

export type ReviewCommentNavigation = {
  ids: string[];
  index: number;
};

type Props = {
  comments: ReviewComment[];
  dirty: boolean;
  currentFilePath?: string;
  currentSource?: string;
  onJump: (comment: ReviewComment) => void;
  onEdit: (comment: ReviewComment, navigation: ReviewCommentNavigation) => void;
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
  reviewSkills?: ReviewSkillOption[];
  aiReviewRunning?: boolean;
  onStartAIReview?: (settings: AIReviewSettings) => void;
  onStopAIReview?: () => void;
  onPickRuleFiles?: () => Promise<string[]>;
  aiRewriteRunning?: boolean;
  editorFontSize?: number;
  revisionReturnPath?: string;
  onReturnFromRevision?: () => void;
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
  reviewSkills = [],
  aiReviewRunning = false,
  onStartAIReview,
  onStopAIReview,
  onPickRuleFiles,
  aiRewriteRunning = false,
  editorFontSize = 13,
  revisionReturnPath,
  onReturnFromRevision,
}: Props) {
  const activeComments = getActiveReviewComments(comments);
  const ignoredCount = comments.length - activeComments.length;
  const hasComments = activeComments.length > 0;
  const canAct = hasComments && !!currentFilePath;
  const [view, setView] = useState<View>('review');

  return (
    <aside
      className="review-sidebar-panel"
      aria-label="检视意见"
      style={{ '--review-font-size': `${Math.max(12, editorFontSize + 1)}px` } as CSSProperties}
    >
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
          aria-selected={view === 'history'}
          className={`review-sidebar-view-tab${view === 'history' ? ' active' : ''}`}
          onClick={() => setView('history')}
        >
          改稿历史
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
          onSetIgnored={onSetIgnored}
          onExport={onExport}
          onSendToAI={onSendToAI}
          reviewSkills={reviewSkills}
          aiReviewRunning={aiReviewRunning}
          onStartAIReview={onStartAIReview}
          onStopAIReview={onStopAIReview}
          onPickRuleFiles={onPickRuleFiles}
          aiRewriteRunning={aiRewriteRunning}
        />
      )}

      {view === 'history' && (
        <RewriteHistoryView
          currentFilePath={currentFilePath}
          revisions={revisions}
          onOpenRevision={onOpenRevision}
          onReviewRevision={onReviewRevision}
          onRefreshRevisions={onRefreshRevisions}
          histories={histories}
          onReviewHistory={onReviewHistory}
          onRefreshHistories={onRefreshHistories}
          revisionReturnPath={revisionReturnPath}
          onReturnFromRevision={onReturnFromRevision}
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
  onSetIgnored,
  onExport,
  onSendToAI,
  reviewSkills,
  aiReviewRunning,
  onStartAIReview,
  onStopAIReview,
  onPickRuleFiles,
  aiRewriteRunning,
}: {
  comments: ReviewComment[];
  activeComments: ReviewComment[];
  ignoredCount: number;
  canAct: boolean;
  currentFilePath?: string;
  currentSource: string;
  onJump: (comment: ReviewComment) => void;
  onEdit: (comment: ReviewComment, navigation: ReviewCommentNavigation) => void;
  onSetIgnored: (commentId: string, ignored: boolean) => void;
  onExport: () => void;
  onSendToAI: () => void;
  reviewSkills: ReviewSkillOption[];
  aiReviewRunning: boolean;
  onStartAIReview?: (settings: AIReviewSettings) => void;
  onStopAIReview?: () => void;
  onPickRuleFiles?: () => Promise<string[]>;
  aiRewriteRunning: boolean;
}) {
  const [filter, setFilter] = useState<ReviewFilter>('all');
  const [inspectionOpen, setInspectionOpen] = useState(true);
  const [rulePaths, setRulePaths] = useState<string[]>([]);
  const [skillNames, setSkillNames] = useState<string[]>([]);
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
    <div className="review-sidebar-review-view">
      <div className="review-sidebar-review-scroll">
        {currentFilePath && onStartAIReview && (
        <details
          className="review-sidebar-ai-inspection"
          open={inspectionOpen}
          onToggle={(event) => setInspectionOpen(event.currentTarget.open)}
        >
          <summary><Sparkles size={12} /> AI 检视</summary>
          {aiReviewRunning && (
            <div className="review-sidebar-ai-running" role="status" aria-live="polite">
              <span className="review-sidebar-ai-running-label">
                <LoaderCircle size={14} /> 正在读取规则并分析正文…
              </span>
              <span className="review-sidebar-ai-running-track" aria-hidden="true">
                <span />
              </span>
            </div>
          )}
          <div className="review-sidebar-ai-field">
            <span>规则文件</span>
            <details className="review-sidebar-multi-select">
              <summary>
                <span>{rulePaths.length ? `已选 ${rulePaths.length} 个 Markdown 文件` : '选择 Markdown 规则文件'}</span>
                <ChevronDown size={13} />
              </summary>
              <div className="review-sidebar-multi-menu">
                <button
                  type="button"
                  className="review-sidebar-rule-import"
                  disabled={aiReviewRunning || !onPickRuleFiles}
                  onClick={() => {
                    void onPickRuleFiles?.().then((paths) => {
                      setRulePaths((current) => [...new Set([...current, ...paths])]);
                    });
                  }}
                >
                  <FilePlus2 size={12} /> 导入 Markdown
                </button>
                {rulePaths.length === 0 && <p>可同时导入多个写作规范文件</p>}
                {rulePaths.length > 0 && (
                  <ul className="review-sidebar-rule-list">
                    {rulePaths.map((path) => (
                      <li key={path} title={path}>
                        <span>{path.replace(/\\/gu, '/').split('/').pop()}</span>
                        <button
                          type="button"
                          disabled={aiReviewRunning}
                          onClick={() => setRulePaths((current) => current.filter((item) => item !== path))}
                          aria-label={`移除规则文件 ${path}`}
                        >
                          <X size={11} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </details>
          </div>
          <div className="review-sidebar-ai-field">
            <span>写作规范 Skill</span>
            <details className="review-sidebar-multi-select">
              <summary>
                <span>{skillNames.length ? `已选 ${skillNames.length} 个 Skill` : '选择写作规范 Skill'}</span>
                <ChevronDown size={13} />
              </summary>
              <div className="review-sidebar-multi-menu review-sidebar-skill-options">
                {reviewSkills.length === 0 && <p>暂无可用 Skill</p>}
                {reviewSkills.map((skill) => (
                  <label key={skill.name}>
                    <input
                      type="checkbox"
                      checked={skillNames.includes(skill.name)}
                      disabled={aiReviewRunning}
                      onChange={(event) => setSkillNames((current) => (
                        event.target.checked
                          ? [...current, skill.name]
                          : current.filter((name) => name !== skill.name)
                      ))}
                    />
                    <span>{skill.label}</span>
                  </label>
                ))}
              </div>
            </details>
          </div>
          <label className="review-sidebar-ai-field">
            <span>手工规则</span>
            <textarea
              value={requirement}
              placeholder="例如：重点检查重复论证和报告腔"
              disabled={aiReviewRunning}
              onChange={(event) => setRequirement(event.target.value)}
            />
          </label>
          {aiReviewRunning ? (
            <button
              type="button"
              className="review-sidebar-action review-sidebar-action-stop"
              onClick={onStopAIReview}
            >
              <Square size={12} /> 停止检视
            </button>
          ) : (
            <button
              type="button"
              className="review-sidebar-action review-sidebar-action-send"
              onClick={() => onStartAIReview({
                rulePaths,
                skillNames,
                requirement: requirement.trim(),
              })}
            >
              <Sparkles size={13} /> 开始检视
            </button>
          )}
        </details>
      )}

        <section className="review-sidebar-comments-section" aria-label="检视意见列表">
          <div className="review-sidebar-comments-heading">
            <span><MessageSquare size={12} /> 检视意见</span>
            <span>{activeComments.length} 条</span>
          </div>
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
                  onClick={() => onEdit(comment, {
                    ids: visibleComments.map((item) => item.id),
                    index,
                  })}
                  title="查看并编辑检视意见"
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
                  <span className="review-sidebar-item-section is-original">
                    <span className="review-sidebar-item-section-label">原文</span>
                    <span className="review-sidebar-item-quote">{truncate(comment.anchor.originalText, 120)}</span>
                  </span>
                  <span className="review-sidebar-item-section is-opinion">
                    <span className="review-sidebar-item-section-label">意见</span>
                    <span className="review-sidebar-item-text">{comment.text}</span>
                  </span>
                </button>
                <div className="review-sidebar-item-tools">
                  <button
                    type="button"
                    className="review-sidebar-item-tool"
                    onClick={() => onJump(comment)}
                    title="定位原文"
                    aria-label="定位原文"
                  >
                    <LocateFixed size={12} />
                    <span>定位</span>
                  </button>
                  <button
                    type="button"
                    className={`review-sidebar-item-tool${ignored ? ' is-selected' : ''}`}
                    onClick={() => onSetIgnored(comment.id, true)}
                    title="忽略意见"
                    aria-label="忽略意见"
                    aria-pressed={ignored}
                  >
                    <EyeOff size={12} />
                    <span>忽略</span>
                  </button>
                </div>
              </li>
            );
          })}
          </ol>
          )}
        </section>
      </div>

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
        <button
          type="button"
          className="review-sidebar-action review-sidebar-action-send"
          disabled={!canAct || aiRewriteRunning}
          onClick={onSendToAI}
          title={canAct ? '按所有未忽略意见发起 AI 改稿' : '没有未忽略意见或未打开文档'}
        >
          <Send size={13} /> {aiRewriteRunning ? '改稿中…' : 'AI 改稿'}
        </button>
      </div>
    </div>
  );
}

function RewriteHistoryView({
  currentFilePath,
  revisions,
  onOpenRevision,
  onReviewRevision,
  onRefreshRevisions,
  histories,
  onReviewHistory,
  onRefreshHistories,
  revisionReturnPath,
  onReturnFromRevision,
}: {
  currentFilePath?: string;
  revisions: RevisionEntry[];
  onOpenRevision: (path: string) => void;
  onReviewRevision: (path: string) => void;
  onRefreshRevisions: () => void;
  histories: DocumentHistoryEntry[];
  onReviewHistory?: (path: string) => void;
  onRefreshHistories?: () => void;
  revisionReturnPath?: string;
  onReturnFromRevision?: () => void;
}) {
  return (
    <div className="review-sidebar-history-view">
      {currentFilePath && (
        <>
        {revisionReturnPath && onReturnFromRevision && (
          <button
            type="button"
            className="review-sidebar-return"
            onClick={onReturnFromRevision}
            title={revisionReturnPath}
          >
            <ArrowLeft size={13} /> 返回前一篇
          </button>
        )}
        <section className="review-sidebar-revisions" aria-label="改稿历史">
          <header className="review-sidebar-revisions-header">
            <span className="review-sidebar-revisions-title">
              <FileText size={12} /> AI 改稿版本
              {revisions.length > 0 && (
                <span className="review-sidebar-revisions-count">{revisions.length}</span>
              )}
            </span>
            <button
              type="button"
              className="review-sidebar-revisions-refresh"
              onClick={onRefreshRevisions}
              title="重新扫描 .typola-output"
              aria-label="刷新 AI 改稿列表"
            >
              <RefreshCw size={11} />
            </button>
          </header>
          {revisions.length === 0 ? (
            <p className="review-sidebar-revisions-empty">暂无改稿版本。请在检视列表底部发起 AI 改稿。</p>
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
    </div>
  );
}
