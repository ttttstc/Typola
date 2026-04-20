import { useEditorStore } from '../store/editor';
import { X } from 'lucide-react';

export function TabBar() {
  const { openFiles, currentFile, setCurrentFile, removeOpenFile, isDirty } = useEditorStore();

  const handleTabClick = (path: string) => {
    setCurrentFile(path);
  };

  const handleClose = (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    removeOpenFile(path);
  };

  const getFileName = (path: string) => {
    const parts = path.split(/[\\/]/);
    return parts[parts.length - 1];
  };

  return (
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
          {file.path === currentFile && isDirty && (
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: 'var(--color-accent)',
                flexShrink: 0,
              }}
              title="已修改"
            />
          )}
          <span
            onClick={(e) => handleClose(e, file.path)}
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
  );
}
