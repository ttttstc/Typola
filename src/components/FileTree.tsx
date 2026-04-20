import { useState, useEffect, useCallback } from 'react';
import {
  Folder,
  FolderOpen,
  FileText,
  ChevronRight,
  ChevronDown,
  Plus,
} from 'lucide-react';
import { useWorkspaceStore, FileEntry } from '../store/workspace';
import { useEditorStore } from '../store/editor';

interface TreeNodeProps {
  entry: FileEntry;
  level: number;
  onFileClick: (path: string) => void;
  onNewFile: (dirPath: string) => void;
}

function TreeNode({ entry, level, onFileClick, onNewFile }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = entry.children && entry.children.length > 0;

  const handleClick = () => {
    if (entry.isDir) {
      setExpanded(!expanded);
    } else if (entry.name.endsWith('.md')) {
      onFileClick(entry.path);
    }
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
      {expanded && hasChildren && (
        <div>
          {entry.children!.map((child, i) => (
            <TreeNode
              key={`${child.path}-${i}`}
              entry={child}
              level={level + 1}
              onFileClick={onFileClick}
              onNewFile={onNewFile}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree() {
  const { workspaceRoot, setWorkspaceRoot, setFileTree } = useWorkspaceStore();
  const [loading, setLoading] = useState(false);

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
    const baseName = '未命名.md';
    let fileName = baseName;
    let counter = 1;
    while (true) {
      try {
        const testPath = `${dirPath}/${fileName}`;
        await window.electronAPI.readFile(testPath);
        counter++;
        fileName = `未命名-${counter}.md`;
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
      handleFileClick(newPath);
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
          文件
        </span>
        <button
          onClick={handleOpenWorkspace}
          title="打开工作区"
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
              打开工作区
            </button>
          </div>
        ) : loading ? (
          <div style={{ padding: '12px', textAlign: 'center', color: 'var(--color-muted)', fontSize: '13px' }}>
            加载中...
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
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
