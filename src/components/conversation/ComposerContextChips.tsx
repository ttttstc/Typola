import { X } from 'lucide-react';

type ComposerContextChipsProps = {
  currentFileName?: string;
  currentFilePath?: string;
  currentFileDismissed: boolean;
  attachedFiles: string[];
  onDismissCurrentFile: () => void;
  onRemoveAttachment: (path: string) => void;
};

/**
 * Renders Composer context chips without changing their existing labels or removal behavior.
 */
export function ComposerContextChips({
  currentFileName,
  currentFilePath,
  currentFileDismissed,
  attachedFiles,
  onDismissCurrentFile,
  onRemoveAttachment,
}: ComposerContextChipsProps) {
  return (
    <div className="conversation-context-chips">
      {currentFilePath && !currentFileDismissed && (
        <span title={currentFilePath}>
          {currentFileName || currentFilePath}
          <button
            type="button"
            onClick={onDismissCurrentFile}
            aria-label="移除当前文档上下文"
          >
            <X size={12} />
          </button>
        </span>
      )}
      {attachedFiles.map((path) => (
        <span key={path} title={path}>
          {path.replace(/\\/g, '/').split('/').pop() || path}
          <button
            type="button"
            onClick={() => onRemoveAttachment(path)}
            aria-label="绉婚櫎闄勪欢"
          >
            <X size={12} />
          </button>
        </span>
      ))}
    </div>
  );
}
