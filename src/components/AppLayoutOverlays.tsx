import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { FindReplacePanel } from './FindReplacePanel';
import { QuickOpenPanel } from './QuickOpenPanel';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';
import type { RecentFile } from '../services/recentFilesService';
import type { SearchMatch } from '../services/documentSearchService';

type DiffPreview = {
  path: string;
  hunks: import('../services/textDiffService').DiffHunk[];
} | null;

type AppLayoutOverlaysProps = {
  findVisible: boolean;
  findFocusTarget: 'find' | 'replace';
  source: string;
  readOnly: boolean;
  onCloseFind: () => void;
  onReplaceSource: (value: string) => void;
  onNavigate: (match: SearchMatch) => void;
  quickOpenVisible: boolean;
  recentFiles: RecentFile[];
  onCloseQuickOpen: () => void;
  onQuickOpen: (path: string) => void;
  artifactPreviewNode: ReactNode;
  settingsNode: ReactNode;
  unsavedDialog: { message: string } | null;
  onUnsavedChoice: (decision: 'save' | 'discard' | 'cancel') => void;
  renameDialog: { tabId: string; name: string; error?: string } | null;
  setRenameDialog: Dispatch<SetStateAction<{ tabId: string; name: string; error?: string } | null>>;
  onConfirmRename: () => void;
  diffPreview: DiffPreview;
  setDiffPreview: Dispatch<SetStateAction<DiffPreview>>;
};

/**
 * Presentation-only overlay stack for AppLayout modals, panels, and diff dialogs.
 */
export function AppLayoutOverlays({
  findVisible,
  findFocusTarget,
  source,
  readOnly,
  onCloseFind,
  onReplaceSource,
  onNavigate,
  quickOpenVisible,
  recentFiles,
  onCloseQuickOpen,
  onQuickOpen,
  artifactPreviewNode,
  settingsNode,
  unsavedDialog,
  onUnsavedChoice,
  renameDialog,
  setRenameDialog,
  onConfirmRename,
  diffPreview,
  setDiffPreview,
}: AppLayoutOverlaysProps) {
  return (
    <>
      <FindReplacePanel
        visible={findVisible}
        focusTarget={findFocusTarget}
        source={source}
        readOnly={readOnly}
        onClose={onCloseFind}
        onReplaceSource={onReplaceSource}
        onNavigate={onNavigate}
      />
      <QuickOpenPanel
        visible={quickOpenVisible}
        files={recentFiles}
        onClose={onCloseQuickOpen}
        onOpen={onQuickOpen}
      />
      {artifactPreviewNode}
      {settingsNode}
      <UnsavedChangesDialog
        open={unsavedDialog !== null}
        message={unsavedDialog?.message ?? ''}
        onChoice={onUnsavedChoice}
      />
      {renameDialog && (
        <div className="rename-dialog-overlay" role="presentation">
          <form
            className="rename-dialog"
            onSubmit={(event) => {
              event.preventDefault();
              onConfirmRename();
            }}
          >
            <h3>重命名文件</h3>
            <input
              autoFocus
              value={renameDialog.name}
              onChange={(event) => setRenameDialog((current) => current
                ? { ...current, name: event.target.value, error: undefined }
                : current)}
            />
            {renameDialog.error && <p>{renameDialog.error}</p>}
            <div className="rename-dialog-actions">
              <button type="button" onClick={() => setRenameDialog(null)}>取消</button>
              <button type="submit">重命名</button>
            </div>
          </form>
        </div>
      )}
      {diffPreview && (
        <div className="diff-preview-overlay" onClick={() => setDiffPreview(null)}>
          <div className="diff-preview-modal" onClick={(event) => event.stopPropagation()}>
            <div className="diff-preview-header">
              <span>差异: {diffPreview.path}</span>
              <button type="button" onClick={() => setDiffPreview(null)} title="关闭">
                ×
              </button>
            </div>
            <div className="diff-preview-body">
              {diffPreview.hunks.map((hunk, index) => (
                <div key={index} className={`diff-hunk diff-hunk-${hunk.op}`}>
                  {hunk.op === 'insert' ? '+ ' : hunk.op === 'delete' ? '- ' : '  '}
                  {hunk.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
