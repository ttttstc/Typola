import { useEffect, useRef, useState } from 'react';
import { FilePlus2, Plug, Puzzle, X } from 'lucide-react';

type ComposerPlusMenuProps = {
  onAttachFiles: () => void;
  onOpenMcp: () => void;
  onOpenPlugins: () => void;
};

export function ComposerPlusMenu({ onAttachFiles, onOpenMcp, onOpenPlugins }: ComposerPlusMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
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

  const pick = (handler: () => void) => {
    setOpen(false);
    handler();
  };

  return (
    <div className="composer-plus-menu" ref={rootRef}>
      <button
        type="button"
        className={`composer-plus-trigger ${open ? 'active' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="添加上下文"
      >
        {open ? <X size={15} /> : '+'}
      </button>
      {open && (
        <div className="composer-plus-popup" role="menu">
          <button type="button" role="menuitem" onClick={() => pick(onAttachFiles)}>
            <FilePlus2 size={15} />
            <span>Attach files</span>
          </button>
          <button type="button" role="menuitem" onClick={() => pick(onOpenMcp)}>
            <Plug size={15} />
            <span>MCP</span>
          </button>
          <button type="button" role="menuitem" onClick={() => pick(onOpenPlugins)}>
            <Puzzle size={15} />
            <span>Plugins</span>
          </button>
        </div>
      )}
    </div>
  );
}
