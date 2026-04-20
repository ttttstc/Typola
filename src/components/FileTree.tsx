import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Folder,
  FolderOpen,
  FileText,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
} from 'lucide-react';
import { useWorkspaceStore, FileEntry } from '../store/workspace';
import { useEditorStore } from '../store/editor';

interface ContextMenuProps {
  x: number;
  y: number;
  entry: FileEntry;
  onClose: () => void;
  onDelete: (path: string) => void;
}

function ContextMenu({ x, y, entry, onClose, onDelete }: ContextMenuProps) {
  const { t } = useTranslation();
  useEffect(() => {
    const handleClick = () => onClose();
    setTimeout(() => document.addEventListener('click', handleClick), 0);
    return () => document.removeEventListener('click', handleClick);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed',
        left: x,
        top: y,
        background: 'var(--color-paper)',
        border: '1px solid var(--color-line-soft)',
        borderRadius: 'var(--radius-md)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        padding: '4px 0',
        minWidth: '120px',
        zIndex: 3000,
      }}
    >
      <div
        onClick={() => {
          onDelete(entry.path);
          onClose();
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          fontSize: '13px',
          cursor: 'pointer',
          color: '#dc2626',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-sunken)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <Trash2 size={14} />
        {t('common.delete')}
      </div>
    </div>
  );
}

interface TreeNodeProps {
  entry: FileEntry;
  level: number;
  onFileClick: (path: string) => void;
  onNewFile: (dirPath: string) => void;
  onDelete: (path: string) => void;
}

function TreeNode({ entry, level, onFileClick, onNewFile, onDelete }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const hasChildren = entry.children && entry.children.length > 0;

  const handleClick = () => {
    if (entry.isDir) {
      setExpanded(!expanded);
    } else if (entry.name.endsWith('.md')) {
      onFileClick(entry.path);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '4px 8px',
          paddingLeft: `${level * 16 + 8}px`,
          cursor: 'pointer',
          borderRadius: 'var(--radius-sm)',
          gap: '4px',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-sunken)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        {entry.isDir && (
          <span style={{ color: 'var(--color-muted)', width: '16px', display: 'flex' }}>
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        )}
        {!entry.isDir && <span style={{ width: '16px' }} />}
        <span style={{ color: entry.isDir ? 'var(--color-ink)' : 'var(--color-muted)' }}>
          {entry.isDir ? (expanded ? <FolderOpen size={14} /> : <Folder size={14} />) : <FileText size={14} />}
        </span>
        <span style={{ fontSize: '13px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.name}
        </span>
        {entry.isDir && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNewFile(entry.path);
            }}
            style={{
              opacity: 0,
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-muted)',
            }}
            className="node-action"
          >
            <Plus size={12} />
          </button>
        )}
      </div>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          entry={entry}
          onClose={() => setContextMenu(null)}
          onDelete={onDelete}
        />
      )}
      {expanded && hasChildren && (
        <div>
          {entry.children!.map((child, i) => (
            <TreeNode
              key={`${child.path}-${i}`}
              entry={child}
              level={level + 1}
              onFileClick={onFileClick}
              onNewFile={onNewFile}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree() {
  const { t } = useTranslation();
  const { workspaceRoot, setWorkspaceRoot, setFileTree } = useWorkspaceStore();
  const [loading, setLoading] = useState(false);

  const handleDelete = async (path: string) => {
    const confirmed = window.confirm(t('fileTree.confirmDelete', { name: path.split(/[\\/]/).pop() }));
    if (!confirmed) return;

    try {
      await window.electronAPI.deletePath(path);
      // If it's the current file, remove from open files
      const currentFile = useEditorStore.getState().currentFile;
      if (currentFile === path) {
        useEditorStore.getState().removeOpenFile(path);
      }
      // Refresh workspace
      if (workspaceRoot) {
        await loadWorkspace(workspaceRoot);
      }
    } catch (e) {
      console.error('Failed to delete:', e);
    }
  };

  const loadWorkspace = useCallback(async (root: string) => {
    setLoading(true);
    try {
      const entries = await window.electronAPI.listDir(root);
      setFileTree(entries);
    } catch (e) {
      console.error('Failed to load workspace:', e);
    } finally {
      setLoading(false);
    }
  }, [setFileTree]);

  const handleOpenWorkspace = async () => {
    try {
      const selected = await window.electronAPI.pickFolder();
      if (selected) {
        setWorkspaceRoot(selected);
        await loadWorkspace(selected);
      }
    } catch (e) {
      console.error('Failed to pick folder:', e);
    }
  };

  const handleFileClick = async (path: string) => {
    useEditorStore.getState().addOpenFile(path);
  };

  const handleNewFile = async (dirPath: string) => {
    const baseName = t('fileTree.untitled') || 'Untitled';
    let fileName = baseName + '.md';
    let counter = 1;
    while (true) {
      try {
        const testPath = `${dirPath}/${fileName}`;
        await window.electronAPI.readFile(testPath);
        counter++;
        fileName = `${baseName}-${counter}.md`;
      } catch {
        break;
      }
    }
    try {
      const newPath = `${dirPath}/${fileName}`;
      await window.electronAPI.createFile(newPath);
      // Refresh the workspace
      if (workspaceRoot) {
        await loadWorkspace(workspaceRoot);
      }
      useEditorStore.getState().addOpenFile(newPath, { isDraft: true });
    } catch (e) {
      console.error('Failed to create file:', e);
    }
  };

  useEffect(() => {
    if (workspaceRoot) {
      loadWorkspace(workspaceRoot);
    }
  }, [workspaceRoot, loadWorkspace]);

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-paper)',
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--color-line-soft)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase' }}>
          {t('fileTree.files')}
        </span>
        <button
          onClick={handleOpenWorkspace}
          title={t('fileTree.openWorkspace')}
          style={{
            width: '24px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--color-muted)',
          }}
        >
          <Plus size={14} />
        </button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
        {!workspaceRoot ? (
          <div
            style={{
              padding: '24px 12px',
              textAlign: 'center',
              color: 'var(--color-muted)',
              fontSize: '13px',
            }}
          >
            <button
              onClick={handleOpenWorkspace}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                background: 'var(--color-surface-sunken)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-ink)',
                fontSize: '13px',
              }}
            >
              {t('fileTree.openWorkspace')}
            </button>
          </div>
        ) : loading ? (
          <div style={{ padding: '12px', textAlign: 'center', color: 'var(--color-muted)', fontSize: '13px' }}>
            {t('fileTree.loading')}
          </div>
        ) : (
          <div>
            {useWorkspaceStore.getState().fileTree.map((entry, i) => (
              <TreeNode
                key={`${entry.path}-${i}`}
                entry={entry}
                level={0}
                onFileClick={handleFileClick}
                onNewFile={handleNewFile}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
