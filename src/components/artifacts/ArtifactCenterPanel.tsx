import { Archive, Eye, FileImage, FileText, FolderOpen, GitCompare, RefreshCw, RotateCcw, Search, Trash2, Undo2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ArtifactRecord, ArtifactViewMode } from '../../services/artifacts/types';
import { artifactBasename } from '../../services/artifacts/manifest';
import { filterArtifacts, isOverwritableArtifact } from '../../services/artifacts/scanner';

type ArtifactCenterPanelProps = {
  records: ArtifactRecord[];
  activeConversationId?: string;
  onOpen: (path: string) => void;
  onCompare: (path: string) => void;
  onArchive: (path: string) => void;
  onDelete: (path: string) => void;
  onOverwrite: (record: ArtifactRecord) => void;
  onUndoOverwrite: (record: ArtifactRecord) => void;
  onRefresh: () => void;
  onClose: () => void;
  onOpenExternal?: (path: string) => void;
  onRevealInFolder?: (path: string) => void;
  /** Issue #156 §12.2:HTML/HTM 产物入口预览右侧面板。 */
  onPreviewHtml?: (path: string) => void;
  /** Issue #156 §12.2 补充:HTML 产物「源码」按钮 — 打开到主编辑器并切到 source 模式。 */
  onOpenSource?: (path: string) => void;
};

function kindLabel(kind: string): string {
  const labels: Record<string, string> = {
    markdown: 'Markdown',
    html: 'HTML',
    review: '检视版',
    revision: 'AI 改稿',
    'wechat-html': '公众号',
    'ppt-html': 'PPT',
    data: '数据',
    asset: '资源',
    unknown: '文件',
  };
  return labels[kind] ?? kind;
}

function isHtmlKind(kind: string): boolean {
  return kind === 'html' || kind === 'wechat-html' || kind === 'ppt-html';
}

function isHtmlPrimary(primary: string): boolean {
  return /\.html?$/i.test(primary);
}

function isImageKind(kind: string): boolean {
  return kind === 'asset';
}

function isImagePrimary(primary: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i.test(primary);
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    running: '生成中',
    done: '完成',
    failed: '失败',
    partial: '部分完成',
    archived: '已归档',
    deleted: '已删除',
  };
  return labels[status] ?? status;
}

function formatTime(value: string): string {
  const time = /^\d+$/u.test(value) ? Number(value) : Date.parse(value);
  if (!Number.isFinite(time)) return '';
  return new Date(time).toLocaleString();
}

export function ArtifactCenterPanel({
  records,
  activeConversationId,
  onOpen,
  onCompare,
  onArchive,
  onDelete,
  onOverwrite,
  onUndoOverwrite,
  onRefresh,
  onClose,
  onOpenExternal,
  onRevealInFolder,
  onPreviewHtml,
  onOpenSource,
}: ArtifactCenterPanelProps) {
  const [mode, setMode] = useState<ArtifactViewMode>('session');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const filtered = useMemo(() => filterArtifacts(records, mode, {
    conversationId: activeConversationId,
    query,
    kind,
  }), [activeConversationId, kind, mode, query, records]);

  return (
    <aside className="artifact-center-panel" aria-label="AI 产物中心">
      <header className="artifact-center-header">
        <div>
          <strong>AI 产物</strong>
          <span>管理当前会话或全部产物</span>
        </div>
        <div className="artifact-center-header-actions">
          <button type="button" onClick={onRefresh} title="重新扫描产物">
            <RefreshCw size={14} />
          </button>
          <button type="button" onClick={onClose} title="关闭产物中心">
            <X size={14} />
          </button>
        </div>
      </header>
      <div className="artifact-center-tabs" role="tablist" aria-label="产物范围">
        {[
          ['session', '当前会话'],
          ['all', '全部产物'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={mode === id ? 'active' : ''}
            onClick={() => setMode(id as ArtifactViewMode)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="artifact-center-filters">
        <label className="artifact-center-search">
          <Search size={13} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题 / 文件 / Agent" />
        </label>
        <select value={kind} onChange={(event) => setKind(event.target.value)} aria-label="产物类型">
          <option value="all">全部类型</option>
          <option value="markdown">Markdown</option>
          <option value="revision">AI 改稿</option>
          <option value="review">检视版</option>
          <option value="html">HTML</option>
          <option value="wechat-html">公众号</option>
          <option value="ppt-html">PPT</option>
        </select>
      </div>
      {filtered.length === 0 ? (
        <div className="artifact-center-empty">
          <FileText size={22} />
          <strong>暂无产物</strong>
          <span>{mode === 'session' ? '当前会话还没有生成产物。' : '产物文件夹中暂无可展示文件。'}</span>
        </div>
      ) : (
        <ol className="artifact-center-list">
          {filtered.map((record) => {
            const manifest = record.manifest;
            const primary = manifest.primaryFile;
            const canOverwrite = isOverwritableArtifact(record);
            const overwritten = Boolean(manifest.overwrite?.backupPath);
            // Issue #156 §12.2:HTML/HTM 产物默认动作是预览,不是源码打开。
            // 文件后缀作 fallback,避免 manifest.kind 缺失或异常时仍按 markdown 行为走 onOpen。
            const isHtml = isHtmlKind(manifest.kind) || isHtmlPrimary(primary);
            const htmlPreviewAvailable = isHtml && !!onPreviewHtml;
            const isImage = isImageKind(manifest.kind) || isImagePrimary(primary);
            const externalOpenAvailable = isImage && !!onOpenExternal;
            const handlePrimaryAction = htmlPreviewAvailable
              ? () => onPreviewHtml!(primary)
              : externalOpenAvailable
                ? () => onOpenExternal!(primary)
              : () => onOpen(primary);
            const primaryActionTitle = htmlPreviewAvailable
              ? `${primary}\n点击在右侧预览`
              : externalOpenAvailable
                ? `${primary}\n点击用系统图片工具打开`
              : `${primary}\n点击在主编辑器打开`;
            return (
              <li key={`${primary}-${manifest.updatedAt ?? manifest.createdAt}`} className={`artifact-center-card ${record.legacy ? 'legacy' : ''}`}>
                <div className="artifact-center-card-main">
                  <div className="artifact-center-card-title">
                    <span className="artifact-center-kind">{kindLabel(manifest.kind)}</span>
                    <button type="button" onClick={handlePrimaryAction} title={primaryActionTitle}>
                      {manifest.title || artifactBasename(primary)}
                    </button>
                  </div>
                  <div className="artifact-center-meta">
                    <span>{statusLabel(manifest.status)}</span>
                    {record.legacy && <span>旧产物</span>}
                    {overwritten && <span>已覆盖</span>}
                    {manifest.source.documentName && <span>来自 {manifest.source.documentName}</span>}
                    {manifest.agent?.label && <span>{manifest.agent.label}{manifest.agent.model ? ` · ${manifest.agent.model}` : ''}</span>}
                    <span>{formatTime(manifest.updatedAt ?? manifest.createdAt)}</span>
                  </div>
                </div>
                <div className="artifact-center-card-actions">
                  {htmlPreviewAvailable ? (
                    <button type="button" className="primary" onClick={() => onPreviewHtml!(primary)}><Eye size={13} />预览</button>
                  ) : externalOpenAvailable ? (
                    <button type="button" className="primary" onClick={() => onOpenExternal!(primary)}><FileImage size={13} />打开</button>
                  ) : (
                    <button type="button" className="primary" onClick={() => onOpen(primary)}>打开</button>
                  )}
                  {isHtml && (
                    <button
                      type="button"
                      onClick={() => (onOpenSource ?? onOpen)(primary)}
                      title={onOpenSource ? '在主编辑器打开源码' : '在主编辑器打开'}
                    >
                      源码
                    </button>
                  )}
                  {manifest.actions?.compareWithCurrent && <button type="button" onClick={() => onCompare(primary)}><GitCompare size={13} />对比</button>}
                  {onRevealInFolder && <button type="button" onClick={() => onRevealInFolder(primary)}><FolderOpen size={13} />所在文件夹</button>}
                  {canOverwrite && !overwritten && <button type="button" onClick={() => onOverwrite(record)}><RotateCcw size={13} />覆盖原文</button>}
                  {overwritten && <button type="button" onClick={() => onUndoOverwrite(record)}><Undo2 size={13} />撤销覆盖</button>}
                  {manifest.actions?.archive && <button type="button" onClick={() => onArchive(primary)}><Archive size={13} />归档</button>}
                  {manifest.actions?.delete && <button type="button" className="danger" onClick={() => onDelete(primary)}><Trash2 size={13} />删除</button>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
