import type { ArtifactItem } from '../ArtifactPreview';

type ArtifactToastProps = {
  artifact: ArtifactItem;
  onOpen: (path: string) => void;
  onArchive: (path: string) => void;
  onDismiss: () => void;
};

export function ArtifactToast({ artifact, onOpen, onArchive, onDismiss }: ArtifactToastProps) {
  return (
    <div className="artifact-toast" role="status">
      <span className="artifact-toast-label">
        ✨ 生成了 <code>{artifact.name}</code>
      </span>
      <div className="artifact-toast-actions">
        <button type="button" onClick={() => onOpen(artifact.path)}>打开</button>
        <button type="button" onClick={() => onArchive(artifact.path)}>保存到工作区</button>
        <button type="button" onClick={onDismiss}>忽略</button>
      </div>
    </div>
  );
}
