import { useState, useEffect, useRef, useCallback } from 'react';
import { Bold, Italic, Strikethrough, Code, Link, ChevronDown, Heading1, Heading2, Heading3, Heading4, Heading5, Heading6, Pilcrow } from 'lucide-react';

interface ToolbarState {
  visible: boolean;
  position: { x: number; y: number };
}

const HEADING_OPTIONS = [
  { id: 'p', label: '正文', icon: Pilcrow, shortcut: 'Ctrl+0' },
  { id: 'h1', label: '标题 1', icon: Heading1, shortcut: 'Ctrl+1' },
  { id: 'h2', label: '标题 2', icon: Heading2, shortcut: 'Ctrl+2' },
  { id: 'h3', label: '标题 3', icon: Heading3, shortcut: 'Ctrl+3' },
  { id: 'h4', label: '标题 4', icon: Heading4, shortcut: '' },
  { id: 'h5', label: '标题 5', icon: Heading5, shortcut: '' },
  { id: 'h6', label: '标题 6', icon: Heading6, shortcut: '' },
];

const FORMAT_OPTIONS = [
  { id: 'bold', icon: Bold, command: 'bold', title: '粗体 (Ctrl+B)' },
  { id: 'italic', icon: Italic, command: 'italic', title: '斜体 (Ctrl+I)' },
  { id: 'strike', icon: Strikethrough, command: 'strikethrough', title: '删除线' },
  { id: 'code', icon: Code, command: 'code', title: '行内代码' },
  { id: 'link', icon: Link, command: 'link', title: '链接 (Ctrl+K)' },
];

function HeadingDropdown({ onSelect, onClose }: { onSelect: (id: string) => void; onClose: () => void }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        marginTop: '4px',
        background: 'var(--color-paper)',
        border: '1px solid var(--color-line-soft)',
        borderRadius: 'var(--radius-md)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        padding: '4px',
        minWidth: '140px',
        zIndex: 1001,
      }}
    >
      {HEADING_OPTIONS.map((opt) => {
        const Icon = opt.icon;
        return (
          <button
            key={opt.id}
            onClick={() => {
              onSelect(opt.id);
              onClose();
            }}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 8px',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-ink)',
              fontSize: '13px',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-sunken)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <Icon size={14} style={{ color: 'var(--color-muted)' }} />
            <span style={{ flex: 1 }}>{opt.label}</span>
            <span style={{ fontSize: '11px', color: 'var(--color-muted)' }}>{opt.shortcut}</span>
          </button>
        );
      })}
    </div>
  );
}

export function FloatingToolbar() {
  const [state, setState] = useState<ToolbarState>({
    visible: false,
    position: { x: 0, y: 0 },
  });
  const [showHeadingDropdown, setShowHeadingDropdown] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const updateToolbar = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      setState((prev) => ({ ...prev, visible: false }));
      setShowHeadingDropdown(false);
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    if (rect.width === 0) {
      setState((prev) => ({ ...prev, visible: false }));
      setShowHeadingDropdown(false);
      return;
    }

    const toolbarHeight = 32;
    const toolbarWidth = 280;
    let x = rect.left + rect.width / 2 - toolbarWidth / 2 + window.scrollX;
    let y = rect.top - toolbarHeight - 8 + window.scrollY;

    if (x < 0) x = 0;
    if (x + toolbarWidth > window.innerWidth) x = window.innerWidth - toolbarWidth;

    if (y < 0) {
      y = rect.bottom + 8 + window.scrollY;
    }

    setState({
      visible: true,
      position: { x, y },
    });
  }, []);

  useEffect(() => {
    const handleSelectionChange = () => {
      updateToolbar();
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [updateToolbar]);

  useEffect(() => {
    const handleScroll = () => updateToolbar();
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [updateToolbar]);

  const handleButtonClick = (command: string) => {
    if (command === 'link') {
      const url = prompt('输入链接地址:');
      if (url) {
        document.execCommand('createLink', false, url);
      }
    } else if (command === 'heading') {
      setShowHeadingDropdown(!showHeadingDropdown);
    } else {
      document.execCommand(command, false);
    }
  };

  const handleHeadingSelect = (level: string) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    // Find the block container (paragraph or heading)
    let node = selection.anchorNode;
    while (node && node.parentElement && !node.parentElement.classList.contains('ProseMirror')) {
      node = node.parentElement;
    }

    if (!node) return;

    // Find the actual paragraph/heading element
    let block = selection.anchorNode?.parentElement;
    while (block && !block.classList.contains('ProseMirror')) {
      if (block.tagName === 'P' || /^H[1-6]$/.test(block.tagName)) {
        break;
      }
      block = block.parentElement;
    }

    if (!block) return;

    const editor = document.querySelector('.ProseMirror');
    if (!editor) return;

    // Get the position in the document
    const editorContent = editor as HTMLElement;

    if (level === 'p') {
      // Convert to paragraph
      if (/^H[1-6]$/.test(block.tagName)) {
        const text = block.textContent || '';
        const p = document.createElement('p');
        p.textContent = text;
        block.parentNode?.replaceChild(p, block);
      }
    } else {
      // Convert to heading
      const tagName = level.toUpperCase();
      if (block.tagName !== tagName) {
        const text = block.textContent || '';
        const heading = document.createElement(tagName);
        heading.textContent = text;
        block.parentNode?.replaceChild(heading, block);
      }
    }

    // Trigger content update
    const event = new Event('input', { bubbles: true });
    editorContent.dispatchEvent(event);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setShowHeadingDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!state.visible) return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        document.execCommand('bold', false);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
        e.preventDefault();
        document.execCommand('italic', false);
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 's') {
        e.preventDefault();
        document.execCommand('strikethrough', false);
      } else if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        document.execCommand('code', false);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const url = prompt('输入链接地址:');
        if (url) {
          document.execCommand('createLink', false, url);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        handleHeadingSelect('p');
      } else if ((e.ctrlKey || e.metaKey) && e.key === '1') {
        e.preventDefault();
        handleHeadingSelect('h1');
      } else if ((e.ctrlKey || e.metaKey) && e.key === '2') {
        e.preventDefault();
        handleHeadingSelect('h2');
      } else if ((e.ctrlKey || e.metaKey) && e.key === '3') {
        e.preventDefault();
        handleHeadingSelect('h3');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.visible]);

  if (!state.visible) return null;

  return (
    <div
      ref={toolbarRef}
      style={{
        position: 'absolute',
        left: state.position.x,
        top: state.position.y,
        display: 'flex',
        alignItems: 'center',
        padding: '4px',
        background: 'var(--color-paper)',
        border: '1px solid var(--color-line-soft)',
        borderRadius: 'var(--radius-md)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
        zIndex: 1000,
        animation: 'fadeIn 120ms ease-out',
      }}
    >
      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(4px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}
      </style>

      {/* Heading dropdown */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => handleButtonClick('heading')}
          title="段落格式"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 8px',
            height: '24px',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--color-ink)',
            fontSize: '12px',
            fontWeight: 500,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-sunken)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <Pilcrow size={14} />
          <ChevronDown size={12} />
        </button>
        {showHeadingDropdown && (
          <HeadingDropdown
            onSelect={handleHeadingSelect}
            onClose={() => setShowHeadingDropdown(false)}
          />
        )}
      </div>

      <div style={{ width: '1px', height: '16px', background: 'var(--color-line-soft)', margin: '0 4px' }} />

      {FORMAT_OPTIONS.map((btn) => {
        const Icon = btn.icon;
        return (
          <button
            key={btn.id}
            onClick={() => handleButtonClick(btn.command)}
            title={btn.title}
            style={{
              width: '28px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-ink)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-sunken)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <Icon size={14} />
          </button>
        );
      })}
    </div>
  );
}
