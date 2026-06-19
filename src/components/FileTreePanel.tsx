import {
  ChevronDown,
  ChevronRight,
  FileArchive,
  FileCode2,
  FileImage,
  FileText,
  FileType,
  Folder,
  FolderOpen,
  NotebookText,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  listWorkspaceEntries,
  pickWorkspaceDirectory,
  workspaceNameFromPath,
  type WorkspaceEntry,
} from '../services/workspaceService';
import { useSettings } from '../hooks/useSettings';
import { translate } from '../services/i18n';

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
  loadingHint: string;
  onOpenFile: (path: string) => void;
};

function getFileIconMeta(name: string): { Icon: typeof FileText; className: string } {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['md', 'markdown', 'mdx'].includes(ext)) return { Icon: NotebookText, className: 'file-tree-icon-md' };
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'hpp', 'sh', 'bash', 'css', 'json', 'yaml', 'yml', 'toml', 'html', 'htm', 'xml'].includes(ext)) return { Icon: FileCode2, className: 'file-tree-icon-code' };
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'].includes(ext)) return { Icon: FileImage, className: 'file-tree-icon-image' };
  if (['doc', 'docx', 'pdf', 'rtf', 'odt'].includes(ext)) return { Icon: FileType, className: 'file-tree-icon-doc' };
  if (['zip', 'tar', 'gz', '7z', 'rar'].includes(ext)) return { Icon: FileArchive, className: 'file-tree-icon-archive' };
  return { Icon: FileText, className: '' };
}

function TreeNode({ entry, depth, activePath, dirtyPaths, agentChangedPaths, refreshKey, loadingHint, onOpenFile }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<WorkspaceEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const active = !entry.isDir && activePath === entry.path;
  const isAgentChanged = !entry.isDir && Boolean(agentChangedPaths?.has(entry.path));
  const fileMeta = !entry.isDir ? getFileIconMeta(entry.name) : null;

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
          fileMeta ? (
            <span className={fileMeta.className}>
              <fileMeta.Icon size={14} />
            </span>
          ) : <FileText size={14} />
        )}
        <span className="file-tree-name">{dirtyPaths.has(entry.path) ? `*${entry.name}` : entry.name}</span>
      </button>
      {expanded && (
        <div className="file-tree-children">
          {loading && <div className="file-tree-loading" style={{ paddingLeft: `${24 + depth * 14}px` }}>{loadingHint}</div>}
          {!loading && children.map((child) => (
            <TreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              activePath={activePath}
              dirtyPaths={dirtyPaths}
              agentChangedPaths={agentChangedPaths}
              refreshKey={refreshKey}
              loadingHint={loadingHint}
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
  const settings = useSettings();
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);

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
    <aside className="workspace-sidebar" style={{ width }} aria-label={t('fileTreeAriaLabel')}>
      <div className="workspace-sidebar-header">
        <div>
          <span>{t('fileTreeWorkspace')}</span>
          <strong>{rootPath ? workspaceNameFromPath(rootPath) : t('fileTreeNoDirectory')}</strong>
        </div>
        <button type="button" onClick={() => void handlePickRoot()} title={t('fileTreeOpenDirectoryTitle')}>
          <FolderOpen size={15} />
        </button>
      </div>
      {rootPath && <div className="workspace-root-path" title={rootPath}>{rootPath}</div>}
      <div className="file-tree-list">
        {!rootPath && <button type="button" className="workspace-empty" onClick={() => void handlePickRoot()}>{t('fileTreePickDirectory')}</button>}
        {loading && <div className="file-tree-loading">{t('fileTreeLoading')}</div>}
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
            loadingHint={t('fileTreeLoadingChild')}
            onOpenFile={onOpenFile}
          />
        ))}
      </div>
    </aside>
  );
}