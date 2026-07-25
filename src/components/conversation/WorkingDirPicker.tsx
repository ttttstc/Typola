import { FolderOpen, History, X } from 'lucide-react';
import { ControlMenu, type ControlMenuItem } from '../ui/ControlMenu';

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
  const items: ControlMenuItem[] = [
    {
      id: 'pick-directory',
      label: workingDir ? '更换工作区' : '选择工作区',
      icon: <FolderOpen size={14} strokeWidth={1.7} />,
      onSelect: onPickDirectory,
    },
    ...recentDirs.map((dir) => ({
      id: `recent-${dir}`,
      label: basename(dir),
      description: dir,
      icon: <History size={14} strokeWidth={1.7} />,
      onSelect: () => onSelectRecent(dir),
    })),
    ...(workingDir ? [{
      id: 'clear-directory',
      label: '清除工作区',
      icon: <X size={14} strokeWidth={1.7} />,
      onSelect: onClear,
    }] : []),
  ];
  const currentLabel = workingDir ? basename(workingDir) : '默认路径';

  return (
    <ControlMenu
      label={`工作区：${currentLabel}`}
      icon={(
        <>
          <FolderOpen size={13} strokeWidth={1.7} />
          <span>{currentLabel}</span>
        </>
      )}
      items={items}
      placement={placement === 'up' ? 'top-start' : 'bottom-start'}
      className="working-dir-picker"
      triggerClassName="working-dir-trigger"
      menuClassName="working-dir-menu"
    />
  );
}
