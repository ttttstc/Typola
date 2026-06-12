import { useMemo, useState } from 'react';
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

  return (
    <div className="quick-open-overlay" role="dialog" aria-label="快速打开最近文件" onMouseDown={onClose}>
      <div className="quick-open-panel" onMouseDown={(event) => event.stopPropagation()}>
        <input
          autoFocus
          className="quick-open-input"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              onClose();
            }
            if (event.key === 'Enter') {
              event.preventDefault();
              submit();
            }
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              moveActive(1);
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              moveActive(-1);
            }
          }}
          placeholder="输入文件名或路径"
        />
        <div className="quick-open-list">
          {filtered.length === 0 ? (
            <div className="quick-open-empty">没有最近文件</div>
          ) : filtered.map((file, index) => (
            <button
              key={file.path}
              type="button"
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
