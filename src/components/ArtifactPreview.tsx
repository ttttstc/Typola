import { Clipboard, FileText, FolderInput, GitCompare, Plus, Presentation, Trash2, X } from 'lucide-react';
import type { ArtifactKind, ArtifactStatus } from '../services/artifacts/types';

export type ArtifactItem = {
  path: string;
  name: string;
  ts: number;
  kind: ArtifactKind;
  status?: ArtifactStatus;
  legacy?: boolean;
};

type ArtifactPreviewProps = {
  artifacts: ArtifactItem[];
  onOpenFile: (path: string) => void;
  onArchiveFile?: (path: string) => void;
  onDeleteFile?: (path: string) => void;
  /** B 类入口:把产物 markdown 跟当前文档分段 diff 进入审阅态。
   *  仅 markdown 产物显示该按钮(其他 kind 不可与文档合并)。 */
  onMergeIntoDocument?: (path: string) => void;
  onInsertFile?: (path: string) => void;
  onCopyPath?: (path: string) => void;
  onClose?: () => void;
};

function iconFor(kind: ArtifactItem['kind']) {
  if (kind === 'html') return <Presentation size={13} />;
  return <FileText size={13} />;
}

function canInsert(kind: ArtifactItem['kind']): boolean {
  return kind === 'markdown' || kind === 'review' || kind === 'revision' || kind === 'text';
}

function canCompare(kind: ArtifactItem['kind']): boolean {
  return kind === 'markdown' || kind === 'review' || kind === 'revision';
}

function statusLabel(item: ArtifactItem): string | null {
  if (item.status === 'failed') return '失败';
  if (item.status === 'partial') return '部分';
  if (item.legacy) return '旧';
  return null;
}

export function ArtifactPreview({
  artifacts,
  onOpenFile,
  onArchiveFile,
  onDeleteFile,
  onMergeIntoDocument,
  onInsertFile,
  onCopyPath,
  onClose,
}: ArtifactPreviewProps) {
  if (artifacts.length === 0) return null;

  return (
    <aside className="artifact-preview" aria-label="AI 产物">
      <div className="artifact-preview-header">
        <div>
          <strong>AI 产物</strong>
          <span>点击在编辑器打开</span>
        </div>
        {onClose && (
          <button type="button" className="artifact-clear" onClick={onClose} title="清除本次产物">
            <X size={12} />
          </button>
        )}
      </div>
      <div className="artifact-chips">
        {artifacts.map((item) => (
          <div key={item.path} className="artifact-chip-row">
            <button
              type="button"
              className="artifact-chip"
              onClick={() => onOpenFile(item.path)}
              title={`${item.path}\n点击在主编辑器打开`}
            >
              <span className="artifact-chip-icon">{iconFor(item.kind)}</span>
              <span className="artifact-chip-name">{item.name}</span>
              {statusLabel(item) && <span className={`artifact-status artifact-status-${item.status ?? 'legacy'}`}>{statusLabel(item)}</span>}
            </button>
            {onMergeIntoDocument && canCompare(item.kind) && (
              <button
                type="button"
                className="artifact-merge"
                onClick={() => onMergeIntoDocument(item.path)}
                title="合并到当前文档(分段 diff + 逐段采纳)"
                aria-label={`合并 ${item.name} 到当前文档`}
              >
                <GitCompare size={13} />
              </button>
            )}
            {onInsertFile && canInsert(item.kind) && (
              <button
                type="button"
                className="artifact-insert"
                onClick={() => onInsertFile(item.path)}
                title="插入到当前光标"
                aria-label={`插入 ${item.name} 到当前文档`}
              >
                <Plus size={13} />
              </button>
            )}
            {onArchiveFile && (
              <button
                type="button"
                className="artifact-archive"
                onClick={() => onArchiveFile(item.path)}
                title="保存到工作区"
                aria-label={`保存 ${item.name} 到工作区`}
              >
                <FolderInput size={13} />
              </button>
            )}
            {onCopyPath && (
              <button
                type="button"
                className="artifact-copy"
                onClick={() => onCopyPath(item.path)}
                title="复制路径"
                aria-label={`复制 ${item.name} 的路径`}
              >
                <Clipboard size={13} />
              </button>
            )}
            {onDeleteFile && (
              <button
                type="button"
                className="artifact-delete"
                onClick={() => onDeleteFile(item.path)}
                title="删除暂存文件"
                aria-label={`删除 ${item.name}`}
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
