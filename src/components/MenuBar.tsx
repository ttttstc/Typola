import { useState, useRef, useEffect, useCallback } from 'react';
import { useEditorStore } from '../store/editor';
import { useWorkspaceStore } from '../store/workspace';
import { useUIStore } from '../store/ui';

interface MenuItemData {
  label: string;
  shortcut?: string;
  action?: () => void;
  divider?: boolean;
}

interface ShortcutSettingsProps {
  onClose: () => void;
}

function ShortcutSettings({ onClose }: ShortcutSettingsProps) {
  const shortcuts = [
    { label: '保存', key: 'Ctrl+S' },
    { label: '新建文件', key: 'Ctrl+N' },
    { label: '切换侧边栏', key: 'Ctrl+\\' },
    { label: '切换大纲', key: 'Ctrl+Shift+\\' },
    { label: '切换主题', key: 'Ctrl+Shift+D' },
    { label: '粗体', key: 'Ctrl+B' },
    { label: '斜体', key: 'Ctrl+I' },
    { label: '删除线', key: 'Ctrl+Shift+S' },
    { label: '行内代码', key: 'Ctrl+`' },
    { label: '链接', key: 'Ctrl+K' },
    { label: '正文', key: 'Ctrl+0' },
    { label: '标题1', key: 'Ctrl+1' },
    { label: '标题2', key: 'Ctrl+2' },
    { label: '标题3', key: 'Ctrl+3' },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 3000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--color-paper)',
          borderRadius: 'var(--radius-lg)',
          padding: '24px',
          width: '400px',
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600 }}>快捷键设置</h2>
        <div style={{ display: 'grid', gap: '8px' }}>
          {shortcuts.map((s) => (
            <div
              key={s.label}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 12px',
                background: 'var(--color-surface-sunken)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <span style={{ fontSize: '13px' }}>{s.label}</span>
              <kbd
                style={{
                  padding: '4px 8px',
                  background: 'var(--color-paper)',
                  border: '1px solid var(--color-line-soft)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {s.key}
              </kbd>
            </div>
          ))}
        </div>
        <button
          onClick={onClose}
          style={{
            marginTop: '20px',
            width: '100%',
            padding: '10px',
            background: 'var(--color-ink)',
            color: 'var(--color-paper)',
            borderRadius: 'var(--radius-md)',
            fontSize: '13px',
            fontWeight: 500,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          关闭
        </button>
      </div>
    </div>
  );
}

// Context Menu for headings
interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
}

function ContextMenu({ x, y, onClose }: ContextMenuProps) {
  const setHeading = useCallback((level: string) => {
    const editor = document.querySelector('.ProseMirror');
    if (!editor) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    // Find the block element containing the selection
    let node: Node | null = selection.anchorNode;
    while (node && node !== editor) {
      if (node instanceof Element && (node.tagName === 'P' || /^H[1-6]$/.test(node.tagName))) {
        break;
      }
      node = node.parentNode;
    }

    if (!node || node === editor) return;

    const block = node as HTMLElement;

    if (level === 'p') {
      if (/^H[1-6]$/.test(block.tagName)) {
        const text = block.textContent || '';
        const p = document.createElement('p');
        p.textContent = text;
        block.parentNode?.replaceChild(p, block);
      }
    } else {
      const tagName = level.toUpperCase();
      if (block.tagName !== tagName) {
        const text = block.textContent || '';
        const heading = document.createElement(tagName);
        heading.textContent = text;
        block.parentNode?.replaceChild(heading, block);
      }
    }

    // Trigger content update event
    const event = new Event('input', { bubbles: true });
    editor.dispatchEvent(event);
    onClose();
  }, [onClose]);

  useEffect(() => {
    const handleClick = () => onClose();
    setTimeout(() => document.addEventListener('click', handleClick), 0);
    return () => document.removeEventListener('click', handleClick);
  }, [onClose]);

  const menuItems = [
    { label: '正文', action: () => setHeading('p') },
    { label: '标题 1', action: () => setHeading('h1') },
    { label: '标题 2', action: () => setHeading('h2') },
    { label: '标题 3', action: () => setHeading('h3') },
    { label: '标题 4', action: () => setHeading('h4') },
    { label: '标题 5', action: () => setHeading('h5') },
    { label: '标题 6', action: () => setHeading('h6') },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        left: x,
        top: y,
        background: 'var(--color-paper)',
        border: '1px solid var(--color-line-soft)',
        borderRadius: 'var(--radius-md)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        padding: '4px 0',
        minWidth: '120px',
        zIndex: 3000,
      }}
    >
      {menuItems.map((item) => (
        <div
          key={item.label}
          onClick={item.action}
          style={{
            padding: '6px 12px',
            fontSize: '13px',
            cursor: 'pointer',
            color: 'var(--color-ink)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-sunken)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          {item.label}
        </div>
      ))}
    </div>
  );
}

export function MenuBar() {
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const activeMenuRef = useRef<string | null>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);

  const { currentFile, content, setIsDirty } = useEditorStore();
  const { workspaceRoot } = useWorkspaceStore();
  const { toggleSidebar, toggleOutline, toggleTheme, theme } = useUIStore();

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        activeMenuRef.current = null;
        setMenusOpen({});
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [menusOpen, setMenusOpen] = useState<Record<string, boolean>>({});

  const handleNewFile = async () => {
    if (workspaceRoot) {
      const baseName = '未命名.md';
      let fileName = baseName;
      let counter = 1;
      // Find unique filename
      while (true) {
        try {
          const testPath = `${workspaceRoot}/${fileName}`;
          await window.electronAPI.readFile(testPath);
          counter++;
          fileName = `未命名-${counter}.md`;
        } catch {
          break;
        }
      }
      const newPath = `${workspaceRoot}/${fileName}`;
      try {
        await window.electronAPI.createFile(newPath);
        useEditorStore.getState().addOpenFile(newPath);
      } catch (err) {
        console.error('Failed to create file:', err);
      }
    }
  };

  const handleSave = async () => {
    if (!currentFile) return;
    try {
      // For new files (containing "未命名"), show save dialog
      if (currentFile.includes('未命名')) {
        const fileName = currentFile.split(/[\\/]/).pop() || '未命名.md';
        const selected = await window.electronAPI.showSaveDialog({
          defaultPath: fileName,
          filters: [{ name: 'Markdown', extensions: ['md'] }],
        });
        if (selected) {
          await window.electronAPI.writeFile(selected, content);
          setIsDirty(false);
          // Update the store with the new path
          useEditorStore.getState().updateFilePath(currentFile, selected);
        }
      } else {
        await window.electronAPI.writeFile(currentFile, content);
        setIsDirty(false);
      }
    } catch (err) {
      console.error('Failed to save:', err);
    }
  };

  const handleFormatBlock = (tag: string) => {
    const editor = document.querySelector('.ProseMirror');
    if (!editor) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

    // Find the block element
    let node: Node | null = selection.anchorNode;
    while (node && node !== editor) {
      if (node instanceof Element && (node.tagName === 'P' || /^H[1-6]$/.test(node.tagName))) {
        break;
      }
      node = node.parentNode;
    }

    if (!node || node === editor) return;
    const block = node as HTMLElement;

    if (tag === 'p') {
      if (/^H[1-6]$/.test(block.tagName)) {
        const text = block.textContent || '';
        const p = document.createElement('p');
        p.textContent = text;
        block.parentNode?.replaceChild(p, block);
      }
    } else {
      const tagName = tag.toUpperCase();
      if (block.tagName !== tagName) {
        const text = block.textContent || '';
        const heading = document.createElement(tagName);
        heading.textContent = text;
        block.parentNode?.replaceChild(heading, block);
      }
    }

    const event = new Event('input', { bubbles: true });
    editor.dispatchEvent(event);
  };

  const handleList = (type: 'ordered' | 'unordered') => {
    if (type === 'ordered') {
      document.execCommand('insertOrderedList');
    } else {
      document.execCommand('insertUnorderedList');
    }
  };

  const handleBlockquote = () => {
    document.execCommand('formatBlock', false, 'blockquote');
  };

  const handleBold = () => document.execCommand('bold');
  const handleItalic = () => document.execCommand('italic');
  const handleStrikethrough = () => document.execCommand('strikethrough');
  const handleCode = () => document.execCommand('code');
  const handleLink = () => {
    const url = prompt('输入链接地址:');
    if (url) document.execCommand('createLink', false, url);
  };
  const handleUndo = () => document.execCommand('undo');
  const handleRedo = () => document.execCommand('redo');
  const handleSelectAll = () => document.execCommand('selectAll');

  const menus: Record<string, MenuItemData[]> = {
    '文件': [
      { label: '新建文件', shortcut: 'Ctrl+N', action: handleNewFile },
      { label: '保存', shortcut: 'Ctrl+S', action: handleSave },
      { divider: true, label: '' },
      { label: '退出', action: () => window.close() },
    ],
    '编辑': [
      { label: '撤销', shortcut: 'Ctrl+Z', action: handleUndo },
      { label: '重做', shortcut: 'Ctrl+Shift+Z', action: handleRedo },
      { divider: true, label: '' },
      { label: '全选', shortcut: 'Ctrl+A', action: handleSelectAll },
      { divider: true, label: '' },
      { label: '快捷键设置', action: () => setShowShortcuts(true) },
    ],
    '段落': [
      { label: '标题 1', shortcut: 'Ctrl+1', action: () => handleFormatBlock('h1') },
      { label: '标题 2', shortcut: 'Ctrl+2', action: () => handleFormatBlock('h2') },
      { label: '标题 3', shortcut: 'Ctrl+3', action: () => handleFormatBlock('h3') },
      { label: '正文', shortcut: 'Ctrl+0', action: () => handleFormatBlock('p') },
      { divider: true, label: '' },
      { label: '有序列表', action: () => handleList('ordered') },
      { label: '无序列表', action: () => handleList('unordered') },
      { label: '引用', action: handleBlockquote },
    ],
    '格式': [
      { label: '粗体', shortcut: 'Ctrl+B', action: handleBold },
      { label: '斜体', shortcut: 'Ctrl+I', action: handleItalic },
      { label: '删除线', shortcut: 'Ctrl+Shift+S', action: handleStrikethrough },
      { label: '行内代码', shortcut: 'Ctrl+`', action: handleCode },
      { divider: true, label: '' },
      { label: '链接', shortcut: 'Ctrl+K', action: handleLink },
    ],
    '视图': [
      { label: '侧边栏', shortcut: 'Ctrl+\\', action: toggleSidebar },
      { label: '大纲', shortcut: 'Ctrl+Shift+\\', action: toggleOutline },
      { divider: true, label: '' },
      { label: theme === 'light' ? '暗色模式' : '亮色模式', shortcut: 'Ctrl+Shift+D', action: toggleTheme },
    ],
  };

  const toggleMenu = (label: string) => {
    setMenusOpen((prev) => ({ ...prev, [label]: !prev[label] }));
    activeMenuRef.current = activeMenuRef.current === label ? null : label;
  };

  // Right-click context menu
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && selection.toString().length > 0) {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY });
      }
    };
    document.addEventListener('contextmenu', handleContextMenu);
    return () => document.removeEventListener('contextmenu', handleContextMenu);
  }, []);

  return (
    <>
      <div
        ref={menuBarRef}
        style={{
          height: '28px',
          display: 'flex',
          alignItems: 'center',
          padding: '0 8px',
          background: 'var(--color-paper)',
          borderBottom: '1px solid var(--color-line-soft)',
          gap: '0px',
          userSelect: 'none',
        }}
      >
        {Object.entries(menus).map(([label, items]) => (
          <div key={label} style={{ position: 'relative' }}>
            <button
              onClick={() => toggleMenu(label)}
              onMouseEnter={() => {
                if (activeMenuRef.current && activeMenuRef.current !== label) {
                  setMenusOpen({ [label]: true });
                }
              }}
              style={{
                padding: '4px 12px',
                fontSize: '13px',
                color: menusOpen[label] ? 'var(--color-ink)' : 'var(--color-ink)',
                background: menusOpen[label] ? 'var(--color-surface-sunken)' : 'transparent',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                height: '24px',
              }}
            >
              {label}
            </button>
            {menusOpen[label] && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '2px',
                  background: 'var(--color-paper)',
                  border: '1px solid var(--color-line-soft)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  padding: '4px 0',
                  minWidth: '180px',
                  zIndex: 2000,
                }}
              >
                {items.map((item, index) => {
                  if (item.divider) {
                    return (
                      <div
                        key={index}
                        style={{
                          height: '1px',
                          background: 'var(--color-line-soft)',
                          margin: '4px 8px',
                        }}
                      />
                    );
                  }
                  return (
                    <div
                      key={item.label}
                      onClick={() => {
                        if (item.action) item.action();
                        setMenusOpen({});
                        activeMenuRef.current = null;
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 12px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        color: 'var(--color-ink)',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-sunken)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span>{item.label}</span>
                      {item.shortcut && (
                        <span style={{ color: 'var(--color-muted)', fontSize: '12px', marginLeft: '24px' }}>
                          {item.shortcut}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
      {showShortcuts && <ShortcutSettings onClose={() => setShowShortcuts(false)} />}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}
