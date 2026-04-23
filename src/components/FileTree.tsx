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
  X,
} from 'lucide-react';
import { useWorkspaceStore, FileEntry, WorkspaceRoot } from '../store/workspace';
import { useEditorStore } from '../store/editor';

interface ContextMenuProps {
  x: number;
  y: number;
  entry: FileEntry;
  onClose: () => void;
  onDelete: (path: string) => void;
  onRename: (entry: FileEntry) => void;
}

function ContextMenu({ x, y, entry, onClose, onDelete, onRename }: ContextMenuProps) {
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
          onRename(entry);
          onClose();
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          fontSize: '13px',
          cursor: 'pointer',
          color: 'var(--color-ink)',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-sunken)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <FileText size={14} />
        {t('common.rename')}
      </div>
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
  onRename: (entry: FileEntry) => void;
}

function TreeNode({ entry, level, onFileClick, onNewFile, onDelete, onRename }: TreeNodeProps) {
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
          onRename={onRename}
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
              onRename={onRename}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface RootSectionProps {
  root: WorkspaceRoot;
  isActive: boolean;
  onActivate: (path: string) => void;
  onToggleExpanded: (path: string) => void;
  onRemove: (root: WorkspaceRoot) => void;
  onFileClick: (path: string) => void;
  onNewFile: (dirPath: string) => void;
  onDelete: (path: string, rootPath: string) => void;
  onRename: (entry: FileEntry, rootPath: string) => void;
}

function RootSection({
  root,
  isActive,
  onActivate,
  onToggleExpanded,
  onRemove,
  onFileClick,
  onNewFile,
  onDelete,
  onRename,
}: RootSectionProps) {
  const { t } = useTranslation();

  return (
    <div style={{ borderBottom: '1px solid var(--color-line-soft)' }}>
      <div
        onClick={() => {
          onActivate(root.path);
          onToggleExpanded(root.path);
        }}
        title={root.path}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '6px 8px',
          cursor: 'pointer',
          background: isActive ? 'var(--color-surface-sunken)' : 'transparent',
        }}
      >
        <span style={{ color: 'var(--color-muted)', width: '16px', display: 'flex' }}>
          {root.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <span
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--color-ink)',
            textTransform: 'uppercase',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {root.name}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(root);
          }}
          title={t('fileTree.removeProject')}
          style={{
            width: '20px',
            height: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--color-muted)',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
          }}
        >
          <X size={12} />
        </button>
      </div>
      {root.expanded && (
        <div>
          {root.fileTree.length === 0 ? (
            <div style={{ padding: '8px 12px', color: 'var(--color-muted)', fontSize: '12px' }}>
              {t('fileTree.loading')}
            </div>
          ) : (
            root.fileTree.map((entry, i) => (
              <TreeNode
                key={`${entry.path}-${i}`}
                entry={entry}
                level={0}
                onFileClick={(path) => {
                  onActivate(root.path);
                  onFileClick(path);
                }}
                onNewFile={onNewFile}
                onDelete={(path) => onDelete(path, root.path)}
                onRename={(entry) => onRename(entry, root.path)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function FileTree() {
  const { t } = useTranslation();
  const workspaceRoots = useWorkspaceStore((s) => s.workspaceRoots);
  const activeRootPath = useWorkspaceStore((s) => s.activeRootPath);
  const addWorkspaceRoot = useWorkspaceStore((s) => s.addWorkspaceRoot);
  const removeWorkspaceRoot = useWorkspaceStore((s) => s.removeWorkspaceRoot);
  const setActiveRoot = useWorkspaceStore((s) => s.setActiveRoot);
  const setRootFileTree = useWorkspaceStore((s) => s.setRootFileTree);
  const toggleRootExpanded = useWorkspaceStore((s) => s.toggleRootExpanded);

  const refreshRoot = useCallback(
    async (rootPath: string) => {
      try {
        const entries = await window.electronAPI.listDir(rootPath);
        setRootFileTree(rootPath, entries);
      } catch (e) {
        console.error('Failed to load workspace root:', e);
      }
    },
    [setRootFileTree]
  );

  // Load tree for any root that doesn't have one yet.
  useEffect(() => {
    workspaceRoots
      .filter((r) => r.fileTree.length === 0)
      .forEach((r) => {
        void refreshRoot(r.path);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceRoots.length]);

  const findContainingRoot = (path: string): WorkspaceRoot | undefined => {
    return workspaceRoots.find(
      (r) => path === r.path || path.startsWith(`${r.path}\\`) || path.startsWith(`${r.path}/`)
    );
  };

  const handleAddProject = async () => {
    try {
      const selected = await window.electronAPI.pickFolder();
      if (selected) {
        addWorkspaceRoot(selected);
        await refreshRoot(selected);
      }
    } catch (e) {
      console.error('Failed to pick folder:', e);
    }
  };

  const handleRemoveProject = (root: WorkspaceRoot) => {
    const confirmed = window.confirm(
      t('fileTree.confirmRemoveProject', { name: root.name })
    );
    if (!confirmed) return;
    removeWorkspaceRoot(root.path);
  };

  const handleDelete = async (path: string, rootPath: string) => {
    const confirmed = window.confirm(
      t('fileTree.confirmDelete', { name: path.split(/[\\/]/).pop() })
    );
    if (!confirmed) return;

    try {
      await window.electronAPI.deletePath(path);
      const { openFiles, removeOpenFile } = useEditorStore.getState();
      openFiles
        .filter(
          (file) =>
            file.path === path ||
            file.path.startsWith(`${path}\\`) ||
            file.path.startsWith(`${path}/`)
        )
        .forEach((file) => removeOpenFile(file.path));

      await refreshRoot(rootPath);
    } catch (e) {
      console.error('Failed to delete:', e);
    }
  };

  const handleRename = async (entry: FileEntry, rootPath: string) => {
    const currentName = entry.name;
    const nextName = window
      .prompt(t('fileTree.renamePrompt', { name: currentName }), currentName)
      ?.trim();

    if (!nextName || nextName === currentName) return;

    const parentDir = entry.path.split(/[\\/]/).slice(0, -1).join('\\');
    const nextPath = `${parentDir}\\${nextName}`;

    try {
      await window.electronAPI.renamePath(entry.path, nextPath);
      useEditorStore.getState().replacePathPrefix(entry.path, nextPath);
      await refreshRoot(rootPath);
    } catch (error) {
      console.error('Failed to rename:', error);
    }
  };

  const handleFileClick = (path: string) => {
    useEditorStore.getState().addOpenFile(path);
  };

  const handleNewFile = async (dirPath: string) => {
    const owningRoot = findContainingRoot(dirPath);
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
      if (owningRoot) {
        await refreshRoot(owningRoot.path);
      }
      useEditorStore.getState().addOpenFile(newPath, { isDraft: true });
    } catch (e) {
      console.error('Failed to create file:', e);
    }
  };

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
        <span
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--color-muted)',
            textTransform: 'uppercase',
          }}
        >
          {t('fileTree.files')}
        </span>
        <button
          onClick={handleAddProject}
          title={t('fileTree.addProject')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 8px',
            height: '24px',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--color-muted)',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          <Plus size={14} />
          <span>{t('fileTree.addProject')}</span>
        </button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {workspaceRoots.length === 0 ? (
          <div
            style={{
              padding: '24px 12px',
              textAlign: 'center',
              color: 'var(--color-muted)',
              fontSize: '13px',
            }}
          >
            <button
              onClick={handleAddProject}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                background: 'var(--color-surface-sunken)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-ink)',
                fontSize: '13px',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <Plus size={14} />
              {t('fileTree.addProject')}
            </button>
            <div style={{ marginTop: '12px', fontSize: '12px' }}>{t('fileTree.noProjects')}</div>
          </div>
        ) : (
          <div>
            {workspaceRoots.map((root) => (
              <RootSection
                key={root.path}
                root={root}
                isActive={root.path === activeRootPath}
                onActivate={setActiveRoot}
                onToggleExpanded={toggleRootExpanded}
                onRemove={handleRemoveProject}
                onFileClick={handleFileClick}
                onNewFile={handleNewFile}
                onDelete={handleDelete}
                onRename={handleRename}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
