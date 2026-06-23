import { useEffect, useRef } from 'react';
import { SELECTION_ACTIONS, type SelectionActionId } from '../services/agent/selectionActions';

export type HeadingLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type FormatAction =
  | { type: 'heading'; level: HeadingLevel }
  | { type: 'bold' | 'italic' | 'strike' | 'inline-code' }
  | { type: 'quote' | 'ul' | 'ol' | 'task' | 'codeblock' | 'hr' | 'link' }
  | { type: 'cut' | 'copy' | 'paste' | 'select-all' };

type Props = {
  open: boolean;
  x: number;
  y: number;
  hasSelection: boolean;
  hasMermaidSvg?: boolean;
  onPick: (action: FormatAction) => void;
  onCopyMermaidSvg?: () => void;
  onClose: () => void;
  // 选区 AI 动作（可选，渲染在菜单底部）。仅 hasSelection 时可点。
  onPickAI?: (action: SelectionActionId) => void;
};

const AI_ACTION_IDS: SelectionActionId[] = ['polish', 'shorten', 'expand', 'explain', 'custom'];

export function EditorContextMenu({
  open,
  x,
  y,
  hasSelection,
  hasMermaidSvg = false,
  onPick,
  onCopyMermaidSvg,
  onClose,
  onPickAI,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const adjustedRef = useRef({ left: x, top: y });

  useEffect(() => {
    if (!open) return;
    // 防止菜单超出视口
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
      adjustedRef.current = { left, top };
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

  const pick = (action: FormatAction) => {
    onPick(action);
    onClose();
  };

  const copyMermaidSvg = () => {
    onCopyMermaidSvg?.();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="editor-ctx-menu"
      role="menu"
      style={{ left: x, top: y }}
    >
      <div className="editor-ctx-heading-row" role="group" aria-label="段落级别">
        <span className="editor-ctx-heading-label">段落</span>
        <button type="button" onClick={() => pick({ type: 'heading', level: 0 })} title="正文 (Ctrl+0)">¶</button>
        <button type="button" onClick={() => pick({ type: 'heading', level: 1 })} title="一级标题 (Ctrl+1)">H1</button>
        <button type="button" onClick={() => pick({ type: 'heading', level: 2 })} title="二级标题 (Ctrl+2)">H2</button>
        <button type="button" onClick={() => pick({ type: 'heading', level: 3 })} title="三级标题 (Ctrl+3)">H3</button>
        <button type="button" onClick={() => pick({ type: 'heading', level: 4 })} title="四级标题 (Ctrl+4)">H4</button>
        <button type="button" onClick={() => pick({ type: 'heading', level: 5 })} title="五级标题 (Ctrl+5)">H5</button>
        <button type="button" onClick={() => pick({ type: 'heading', level: 6 })} title="六级标题 (Ctrl+6)">H6</button>
      </div>

      <div className="editor-ctx-separator" />

      <MenuItem label="加粗" hint="Ctrl+B" onClick={() => pick({ type: 'bold' })} />
      <MenuItem label="斜体" hint="Ctrl+I" onClick={() => pick({ type: 'italic' })} />
      <MenuItem label="删除线" onClick={() => pick({ type: 'strike' })} />
      <MenuItem label="行内代码" hint="Ctrl+G" onClick={() => pick({ type: 'inline-code' })} />
      <MenuItem label="链接" hint="Ctrl+K" onClick={() => pick({ type: 'link' })} />

      <div className="editor-ctx-separator" />

      <MenuItem label="引用块" onClick={() => pick({ type: 'quote' })} />
      <MenuItem label="无序列表" onClick={() => pick({ type: 'ul' })} />
      <MenuItem label="有序列表" onClick={() => pick({ type: 'ol' })} />
      <MenuItem label="任务列表" onClick={() => pick({ type: 'task' })} />
      <MenuItem label="代码块" onClick={() => pick({ type: 'codeblock' })} />
      <MenuItem label="分隔线" onClick={() => pick({ type: 'hr' })} />

      <div className="editor-ctx-separator" />

      <MenuItem label="剪切" hint="Ctrl+X" disabled={!hasSelection} onClick={() => pick({ type: 'cut' })} />
      <MenuItem label="复制" hint="Ctrl+C" disabled={!hasSelection} onClick={() => pick({ type: 'copy' })} />
      <MenuItem label="粘贴" hint="Ctrl+V" onClick={() => pick({ type: 'paste' })} />
      <MenuItem label="全选" hint="Ctrl+A" onClick={() => pick({ type: 'select-all' })} />

      {hasMermaidSvg && (
        <>
          <div className="editor-ctx-separator" />
          <MenuItem label="复制为 SVG" onClick={copyMermaidSvg} />
        </>
      )}

      {onPickAI && (
        <>
          <div className="editor-ctx-separator" />
          <div className="selection-ai-section-title" role="presentation">AI</div>
          {AI_ACTION_IDS.map((id) => {
            const action = SELECTION_ACTIONS[id];
            const disabled = !hasSelection && id !== 'custom';
            return (
              <button
                key={id}
                type="button"
                role="menuitem"
                className="editor-ctx-item"
                disabled={disabled}
                onClick={() => { onPickAI(id); onClose(); }}
                title={disabled ? '请先选中文字' : ''}
              >
                <span className="selection-ai-item-label">
                  <span className="selection-ai-item-icon" aria-hidden="true">
                    <action.icon size={13} strokeWidth={1.7} />
                  </span>
                  {action.label}
                </span>
                {id === 'custom' ? <kbd>自定义</kbd> : null}
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}

function MenuItem({
  label,
  hint,
  disabled,
  onClick,
}: {
  label: string;
  hint?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className="editor-ctx-item"
      disabled={disabled}
      onClick={onClick}
    >
      <span>{label}</span>
      {hint && <kbd>{hint}</kbd>}
    </button>
  );
}
