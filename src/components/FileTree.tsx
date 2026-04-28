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
import {
  useWorkspaceStore,
  FileEntry,
  WorkspaceRoot,
  findContainingWorkspaceRoot,
} from '../store/workspace';
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

interface RenameDialogProps {
  currentName: string;
  error: string | null;
  pending: boolean;
  value: string;
  onCancel: () => void;
  onConfirm: () => void;
  onChange: (value: string) => void;
}

function RenameDialog({
  currentName,
  error,
  pending,
  value,
  onCancel,
  onConfirm,
  onChange,
}: RenameDialogProps) {
  const { t } = useTranslation();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.32)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 4000,
      }}
      onClick={onCancel}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm();
        }}
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(420px, calc(100vw - 32px))',
          background: 'var(--color-paper)',
          border: '1px solid var(--color-line-soft)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 16px 48px rgba(15, 23, 42, 0.2)',
          padding: '18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <strong style={{ fontSize: '14px', color: 'var(--color-ink)' }}>
            {t('common.rename')}
          </strong>
          <span style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
            {t('fileTree.renamePrompt', { name: currentName })}
          </span>
        </div>
        <input
          autoFocus
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={pending}
          style={{
            width: '100%',
            height: '36px',
            padding: '0 10px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-line-soft)',
            background: 'var(--color-paper)',
            color: 'var(--color-ink)',
            fontSize: '13px',
            outline: 'none',
          }}
        />
        <div
          style={{
            minHeight: '18px',
            fontSize: '12px',
            color: error ? '#dc2626' : 'var(--color-muted)',
          }}
        >
          {error ?? t('fileTree.renameHint')}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            style={{
              height: '32px',
              padding: '0 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-line-soft)',
              background: 'transparent',
              color: 'var(--color-ink)',
              cursor: pending ? 'default' : 'pointer',
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={pending}
            style={{
              height: '32px',
              padding: '0 12px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: 'var(--color-ink)',
              color: 'var(--color-paper)',
              cursor: pending ? 'default' : 'pointer',
            }}
          >
            {pending ? t('statusBar.saving') : t('common.confirm')}
          </button>
        </div>
      </form>
    </div>
  );
}

function findSiblingEntries(entries: FileEntry[], targetPath: string): FileEntry[] | null {
  for (const entry of entries) {
    if (entry.path === targetPath) {
      return entries;
    }

    if (!entry.children) {
      continue;
    }

    const nested = findSiblingEntries(entry.children, targetPath);
    if (nested) {
      return nested;
    }
  }

  return null;
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
        title={entry.name}
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
  const [renameTarget, setRenameTarget] = useState<{ entry: FileEntry; rootPath: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renamePending, setRenamePending] = useState(false);

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
    setRenameTarget({ entry, rootPath });
    setRenameValue(entry.name);
    setRenameError(null);
  };

  const handleRenameConfirm = useCallback(async () => {
    if (!renameTarget) {
      return;
    }

    const nextName = renameValue.trim();
    if (!nextName) {
      setRenameError(t('fileTree.renameEmpty'));
      return;
    }

    if (/[\\/]/.test(nextName)) {
      setRenameError(t('fileTree.renameInvalid'));
      return;
    }

    if (nextName === renameTarget.entry.name) {
      setRenameTarget(null);
      setRenameValue('');
      setRenameError(null);
      return;
    }

    const root = workspaceRoots.find((candidate) => candidate.path === renameTarget.rootPath);
    const siblingEntries = root ? findSiblingEntries(root.fileTree, renameTarget.entry.path) : null;
    const hasConflict = siblingEntries?.some(
      (candidate) =>
        candidate.path !== renameTarget.entry.path &&
        candidate.name.localeCompare(nextName, undefined, { sensitivity: 'accent' }) === 0
    );

    if (hasConflict) {
      setRenameError(t('fileTree.renameConflict', { name: nextName }));
      return;
    }

    const lastSlash = Math.max(
      renameTarget.entry.path.lastIndexOf('/'),
      renameTarget.entry.path.lastIndexOf('\\')
    );
    const parentDir = lastSlash >= 0 ? renameTarget.entry.path.slice(0, lastSlash) : '';
    const separator =
      renameTarget.entry.path.includes('\\') || !renameTarget.entry.path.includes('/') ? '\\' : '/';
    const nextPath = parentDir ? `${parentDir}${separator}${nextName}` : nextName;

    try {
      setRenamePending(true);
      await window.electronAPI.renamePath(renameTarget.entry.path, nextPath);
      useEditorStore.getState().replacePathPrefix(renameTarget.entry.path, nextPath);
      await refreshRoot(renameTarget.rootPath);
      setRenameTarget(null);
      setRenameValue('');
      setRenameError(null);
    } catch (error) {
      console.error('Failed to rename:', error);
      setRenameError(t('fileTree.renameFailed'));
    } finally {
      setRenamePending(false);
    }
  }, [refreshRoot, renameTarget, renameValue, t, workspaceRoots]);

  const handleFileClick = (path: string) => {
    void window.electronAPI.addRecentFile(path);
    useEditorStore.getState().addOpenFile(path);
  };

  const handleNewFile = async (dirPath: string) => {
    const owningRoot = findContainingWorkspaceRoot(workspaceRoots, dirPath);
    const baseName = t('fileTree.untitled') || 'Untitled';
    let fileName = baseName + '.md';
    let counter = 1;
    while (true) {
      const testPath = `${dirPath}/${fileName}`;
      if (!(await window.electronAPI.pathExists(testPath))) {
        break;
      }

      counter++;
      fileName = `${baseName}-${counter}.md`;
    }
    try {
      const newPath = `${dirPath}/${fileName}`;
      await window.electronAPI.createFile(newPath);
      await window.electronAPI.addRecentFile(newPath);
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
      {renameTarget && (
        <RenameDialog
          currentName={renameTarget.entry.name}
          error={renameError}
          pending={renamePending}
          value={renameValue}
          onCancel={() => {
            if (renamePending) return;
            setRenameTarget(null);
            setRenameValue('');
            setRenameError(null);
          }}
          onConfirm={() => {
            void handleRenameConfirm();
          }}
          onChange={(value) => {
            setRenameValue(value);
            if (renameError) {
              setRenameError(null);
            }
          }}
        />
      )}
    </div>
  );
}
