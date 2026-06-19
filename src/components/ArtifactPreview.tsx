import { FileText, FolderInput, Presentation, X } from 'lucide-react';

export type ArtifactItem = {
  path: string;
  name: string;
  ts: number;
  kind: 'markdown' | 'html' | 'text' | 'other';
};

type ArtifactPreviewProps = {
  artifacts: ArtifactItem[];
  onOpenFile: (path: string) => void;
  onArchiveFile?: (path: string) => void;
  onClose?: () => void;
};

function iconFor(kind: ArtifactItem['kind']) {
  if (kind === 'html') return <Presentation size={13} />;
  return <FileText size={13} />;
}

export function ArtifactPreview({ artifacts, onOpenFile, onArchiveFile, onClose }: ArtifactPreviewProps) {
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
            </button>
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
          </div>
        ))}
      </div>
    </aside>
  );
}
