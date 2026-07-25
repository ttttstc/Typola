import { FilePlus2, Plug, Plus, Puzzle } from 'lucide-react';
import { ControlMenu } from '../ui/ControlMenu';

type ComposerPlusMenuProps = {
  onAttachFiles: () => void;
  onOpenMcp: () => void;
  onOpenPlugins: () => void;
};

export function ComposerPlusMenu({ onAttachFiles, onOpenMcp, onOpenPlugins }: ComposerPlusMenuProps) {
  return (
    <ControlMenu
      label="添加上下文"
      icon={<Plus size={15} strokeWidth={1.7} />}
      placement="top-start"
      showChevron={false}
      className="composer-plus-menu"
      triggerClassName="composer-plus-trigger"
      menuClassName="composer-plus-popup"
      items={[
        {
          id: 'files',
          label: '添加文件',
          icon: <FilePlus2 size={15} />,
          onSelect: onAttachFiles,
        },
        {
          id: 'mcp',
          label: 'MCP',
          icon: <Plug size={15} />,
          onSelect: onOpenMcp,
        },
        {
          id: 'plugins',
          label: '插件',
          icon: <Puzzle size={15} />,
          onSelect: onOpenPlugins,
        },
      ]}
    />
  );
}
