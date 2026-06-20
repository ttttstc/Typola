import { useEffect, useRef } from 'react';
import { SELECTION_ACTIONS, type SelectionActionId } from '../../services/agent/selectionActions';

type Props = {
  open: boolean;
  x: number;
  y: number;
  hasSelection: boolean;
  onPick: (action: SelectionActionId) => void;
  onClose: () => void;
};

const ACTION_IDS: SelectionActionId[] = ['polish', 'rewrite', 'shorten', 'expand', 'explain', 'custom'];

export function SelectionAIMenu({ open, x, y, hasSelection, onPick, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    if (menu) {
      const rect = menu.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const padding = 6;
      let left = x;
      let top = y;
      if (left + rect.width > vw - padding) left = Math.max(padding, vw - rect.width - padding);
      if (top + rect.height > vh - padding) top = Math.max(padding, vh - rect.height - padding);
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
    }
    const onDocMouseDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('mousedown', onDocMouseDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, x, y, onClose]);

  if (!open) return null;

  const pick = (action: SelectionActionId) => {
    onPick(action);
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="editor-ctx-menu selection-ai-menu"
      role="menu"
      style={{ left: x, top: y }}
    >
      <div className="selection-ai-section-title" role="presentation">AI</div>
      {ACTION_IDS.map((id) => {
        const action = SELECTION_ACTIONS[id];
        return (
          <button
            key={id}
            type="button"
            role="menuitem"
            className="editor-ctx-item"
            disabled={!hasSelection && id !== 'custom'}
            onClick={() => pick(id)}
            title={hasSelection || id === 'custom' ? '' : '请先选中文字'}
          >
            <span className="selection-ai-item-label">
              <span className="selection-ai-item-icon" aria-hidden="true">{action.icon}</span>
              {action.label}
            </span>
            {id === 'custom' ? <kbd>自定义</kbd> : null}
          </button>
        );
      })}
    </div>
  );
}
