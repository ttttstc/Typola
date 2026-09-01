import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { filterRecentFiles, type RecentFile } from '../services/recentFilesService';

type QuickOpenPanelProps = {
  visible: boolean;
  files: RecentFile[];
  onClose: () => void;
  onOpen: (path: string) => void;
};

export function QuickOpenPanel({ visible, files, onClose, onOpen }: QuickOpenPanelProps) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => filterRecentFiles(files, query), [files, query]);
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // 键盘移动 active 项时保持在可视区内
  useEffect(() => {
    const listNode = listRef.current;
    if (!listNode) return;
    const effectiveIndex = Math.min(activeIndex, Math.max(0, filtered.length - 1));
    const activeNode = listNode.querySelector<HTMLButtonElement>(`[data-index="${effectiveIndex}"]`);
    activeNode?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, filtered]);

  if (!visible) return null;

  const activeFile = filtered[Math.min(activeIndex, Math.max(0, filtered.length - 1))];

  const submit = () => {
    if (!activeFile) return;
    onOpen(activeFile.path);
  };

  const moveActive = (direction: 1 | -1) => {
    if (filtered.length === 0) {
      setActiveIndex(0);
      return;
    }
    setActiveIndex((index) => Math.min(filtered.length - 1, Math.max(0, index + direction)));
  };

  // keydown 统一挂在面板容器：焦点移到列表项后 Esc/方向键仍然可用
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActive(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(-1);
    }
  };

  return (
    <div className="quick-open-overlay" role="dialog" aria-label="快速打开最近文件" onMouseDown={onClose}>
      <div className="quick-open-panel" onMouseDown={(event) => event.stopPropagation()} onKeyDown={handleKeyDown}>
        <input
          autoFocus
          className="quick-open-input"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          placeholder="输入文件名或路径"
        />
        <div className="quick-open-list" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="quick-open-empty">{query.trim() ? '没有匹配的文件' : '没有最近文件'}</div>
          ) : filtered.map((file, index) => (
            <button
              key={file.path}
              type="button"
              data-index={index}
              className={`quick-open-item${index === activeIndex ? ' active' : ''}`}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => onOpen(file.path)}
            >
              <span className="quick-open-name">{file.name}</span>
              <span className="quick-open-path">{file.path}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
