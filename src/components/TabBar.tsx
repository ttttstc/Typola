import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditorStore } from '../store/editor';
import { X } from 'lucide-react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({ title, message, onConfirm, onCancel }: ConfirmDialogProps) {
  const { t } = useTranslation();
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 3000,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: 'var(--color-paper)',
          borderRadius: 'var(--radius-lg)',
          padding: '24px',
          width: '360px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 600 }}>{title}</h3>
        <p style={{ margin: '0 0 20px', fontSize: '14px', color: 'var(--color-muted)' }}>{message}</p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '8px 16px',
              background: 'var(--color-surface-sunken)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '8px 16px',
              background: 'var(--color-accent)',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TabBar() {
  const { t } = useTranslation();
  const { openFiles, currentFile, setCurrentFile, removeOpenFile } = useEditorStore();

  const [confirmDialog, setConfirmDialog] = useState<{
    file: { path: string; name: string; isDirty: boolean };
    onConfirm: () => void;
  } | null>(null);

  const handleTabClick = (path: string) => {
    setCurrentFile(path);
  };

  const handleClose = (e: React.MouseEvent, file: { path: string; name: string; isDirty: boolean }) => {
    e.stopPropagation();
    if (file.isDirty) {
      setConfirmDialog({
        file,
        onConfirm: () => {
          // If this is the current file, save it first
          const editorState = useEditorStore.getState();
          if (editorState.currentFile === file.path && editorState.isDirty) {
            // Save asynchronously - don't wait
            window.electronAPI.writeFile(file.path, editorState.content).catch((err) => {
              console.error('Failed to save:', err);
            });
          }
          // If not current file, changes should have been auto-saved when it was current
          removeOpenFile(file.path);
          setConfirmDialog(null);
        },
      });
    } else {
      removeOpenFile(file.path);
    }
  };

  const getFileName = (path: string) => {
    const parts = path.split(/[\\/]/);
    return parts[parts.length - 1];
  };

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          background: 'var(--color-surface-sunken)',
          borderBottom: '1px solid var(--color-line-soft)',
          height: '32px',
          overflowX: 'auto',
          overflowY: 'hidden',
          flexShrink: 0,
        }}
      >
        {openFiles.map((file) => (
          <div
            key={file.path}
            onClick={() => handleTabClick(file.path)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0 12px',
              height: '100%',
              cursor: 'pointer',
              borderRight: '1px solid var(--color-line-soft)',
              background: file.path === currentFile ? 'var(--color-paper)' : 'transparent',
              color: file.path === currentFile ? 'var(--color-ink)' : 'var(--color-muted)',
              fontSize: '12px',
              minWidth: '100px',
              maxWidth: '200px',
            }}
          >
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
              }}
            >
              {getFileName(file.path)}
            </span>
            {file.isDirty && (
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: 'var(--color-accent)',
                  flexShrink: 0,
                }}
                title={t('tabBar.modified')}
              />
            )}
            <span
              onClick={(e) => handleClose(e, file)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '16px',
                height: '16px',
                borderRadius: '2px',
                color: 'var(--color-muted)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--color-line-soft)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <X size={12} />
            </span>
          </div>
        ))}
      </div>
      {confirmDialog && (
        <ConfirmDialog
          title={t('tabBar.fileModified')}
          message={t('tabBar.fileModifiedMessage', { name: confirmDialog.file.name })}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </>
  );
}
