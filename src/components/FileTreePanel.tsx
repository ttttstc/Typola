import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  listWorkspaceEntries,
  pickWorkspaceDirectory,
  workspaceNameFromPath,
  type WorkspaceEntry,
} from '../services/workspaceService';

type FileTreePanelProps = {
  rootPath: string;
  activePath: string;
  dirtyPaths: Set<string>;
  agentChangedPaths?: Set<string>;
  width: number;
  refreshKey?: number;
  onRootChange: (path: string) => void;
  onOpenFile: (path: string) => void;
};

type TreeNodeProps = {
  entry: WorkspaceEntry;
  depth: number;
  activePath: string;
  dirtyPaths: Set<string>;
  agentChangedPaths?: Set<string>;
  refreshKey?: number;
  onOpenFile: (path: string) => void;
};

function TreeNode({ entry, depth, activePath, dirtyPaths, agentChangedPaths, refreshKey, onOpenFile }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<WorkspaceEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const active = !entry.isDir && activePath === entry.path;
  const isAgentChanged = !entry.isDir && Boolean(agentChangedPaths?.has(entry.path));

  // refreshKey 变化或首次展开 → 重新拉子目录
  useEffect(() => {
    if (!entry.isDir || !expanded) return;
    setLoading(true);
    void listWorkspaceEntries(entry.path)
      .then(setChildren)
      .catch(() => setChildren([]))
      .finally(() => setLoading(false));
  }, [entry.isDir, entry.path, expanded, refreshKey]);

  return (
    <div className="file-tree-node">
      <button
        type="button"
        className={`file-tree-item ${active ? 'active' : ''} ${isAgentChanged ? 'agent-changed' : ''} ${dirtyPaths.has(entry.path) ? 'dirty' : ''}`}
        style={{ paddingLeft: `${10 + depth * 14}px` }}
        onClick={() => {
          if (entry.isDir) setExpanded((value) => !value);
          else onOpenFile(entry.path);
        }}
        title={entry.path}
      >
        {entry.isDir ? (
          expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />
        ) : (
          <span className="file-tree-spacer" />
        )}
        {entry.isDir ? (
          expanded ? <FolderOpen size={14} /> : <Folder size={14} />
        ) : (
          <FileText size={14} />
        )}
        <span className="file-tree-name">{dirtyPaths.has(entry.path) ? `*${entry.name}` : entry.name}</span>
      </button>
      {expanded && (
        <div className="file-tree-children">
          {loading && <div className="file-tree-loading" style={{ paddingLeft: `${24 + depth * 14}px` }}>读取中...</div>}
          {!loading && children.map((child) => (
            <TreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              activePath={activePath}
              dirtyPaths={dirtyPaths}
              agentChangedPaths={agentChangedPaths}
              refreshKey={refreshKey}
              onOpenFile={onOpenFile}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTreePanel({
  rootPath,
  activePath,
  dirtyPaths,
  agentChangedPaths,
  width,
  refreshKey,
  onRootChange,
  onOpenFile,
}: FileTreePanelProps) {
  const [entries, setEntries] = useState<WorkspaceEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!rootPath) {
      setEntries([]);
      return;
    }
    setLoading(true);
    setError('');
    void listWorkspaceEntries(rootPath)
      .then(setEntries)
      .catch((reason) => {
        setEntries([]);
        setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => setLoading(false));
  }, [refreshKey, rootPath]);

  const handlePickRoot = async () => {
    const selected = await pickWorkspaceDirectory();
    if (selected) onRootChange(selected);
  };

  return (
    <aside className="workspace-sidebar" style={{ width }} aria-label="文件工作区">
      <div className="workspace-sidebar-header">
        <div>
          <span>Workspace</span>
          <strong>{rootPath ? workspaceNameFromPath(rootPath) : '未选择目录'}</strong>
        </div>
        <button type="button" onClick={() => void handlePickRoot()} title="打开目录">
          <FolderOpen size={15} />
        </button>
      </div>
      {rootPath && <div className="workspace-root-path" title={rootPath}>{rootPath}</div>}
      <div className="file-tree-list">
        {!rootPath && <button type="button" className="workspace-empty" onClick={() => void handlePickRoot()}>打开一个目录</button>}
        {loading && <div className="file-tree-loading">读取目录中...</div>}
        {error && <div className="file-tree-error">{error}</div>}
        {!loading && entries.map((entry) => (
          <TreeNode
            key={entry.path}
            entry={entry}
            depth={0}
            activePath={activePath}
            dirtyPaths={dirtyPaths}
            agentChangedPaths={agentChangedPaths}
            refreshKey={refreshKey}
            onOpenFile={onOpenFile}
          />
        ))}
      </div>
    </aside>
  );
}
