import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, FolderOpen, History, X } from 'lucide-react';

type WorkingDirPickerProps = {
  workingDir: string | null;
  recentDirs: string[];
  onPickDirectory: () => void;
  onSelectRecent: (dir: string) => void;
  onClear: () => void;
  placement?: 'down' | 'up';
};

function basename(dir: string): string {
  return dir.split(/[/\\]/).filter(Boolean).pop() ?? dir;
}

export function WorkingDirPicker({
  workingDir,
  recentDirs,
  onPickDirectory,
  onSelectRecent,
  onClear,
  placement = 'up',
}: WorkingDirPickerProps) {
  const [open, setOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      setRecentOpen(false);
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      if (wrapRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div className="working-dir-picker" ref={wrapRef}>
      <button
        type="button"
        className="working-dir-trigger"
        aria-expanded={open}
        title={workingDir ?? '未选择工作区时，Claude 使用默认启动目录'}
        onClick={() => setOpen((value) => !value)}
      >
        <FolderOpen size={13} />
        <span>{workingDir ? basename(workingDir) : '默认路径'}</span>
        <ChevronDown size={11} />
      </button>

      {open && (
        <div className={`working-dir-panel ${placement === 'up' ? 'panel-up' : ''}`} role="menu">
          <button
            type="button"
            role="menuitem"
            className="working-dir-item"
            onClick={() => {
              setOpen(false);
              onPickDirectory();
            }}
          >
            <FolderOpen size={14} />
            <span>{workingDir ? '更换工作区' : '选择工作区'}</span>
          </button>

          <div
            className="working-dir-submenu-row"
            onMouseEnter={() => setRecentOpen(true)}
            onMouseLeave={() => setRecentOpen(false)}
          >
            <button
              type="button"
              role="menuitem"
              className="working-dir-item"
              aria-haspopup="menu"
              aria-expanded={recentOpen}
              onClick={() => setRecentOpen((value) => !value)}
            >
              <History size={14} />
              <span>最近工作区</span>
              <ChevronRight size={12} className="working-dir-chevron" />
            </button>
            {recentOpen && (
              <div className={`working-dir-flyout ${placement === 'up' ? 'flyout-up' : ''}`} role="menu">
                {recentDirs.length === 0 ? (
                  <div className="working-dir-empty">暂无最近工作区</div>
                ) : (
                  recentDirs.map((dir) => (
                    <button
                      key={dir}
                      type="button"
                      role="menuitem"
                      className="working-dir-recent-item"
                      title={dir}
                      onClick={() => {
                        onSelectRecent(dir);
                        setOpen(false);
                      }}
                    >
                      <FolderOpen size={13} />
                      <span className="working-dir-recent-name">{basename(dir)}</span>
                      <span className="working-dir-recent-path">{dir}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {workingDir && (
            <button
              type="button"
              role="menuitem"
              className="working-dir-item"
              onClick={() => {
                onClear();
                setOpen(false);
              }}
            >
              <X size={14} />
              <span>清除工作区</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
