import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Bold, Italic, Strikethrough, Code, Link, ChevronDown, Heading1, Heading2, Heading3, Heading4, Heading5, Heading6, Pilcrow } from 'lucide-react';
import {
  applyBlockFormat,
  applyInlineFormat,
  applyLink,
  getActiveLinkHref,
  hasEditorSelection,
  isInlineFormatActive,
  rememberEditorSelection,
} from '../editor/formatting';

interface ToolbarState {
  visible: boolean;
  position: { x: number; y: number };
}

const HEADING_OPTIONS = (t: (key: string) => string) => [
  { id: 'p', label: t('floatingToolbar.body'), icon: Pilcrow, shortcut: 'Ctrl+0' },
  { id: 'h1', label: t('floatingToolbar.heading1'), icon: Heading1, shortcut: 'Ctrl+1' },
  { id: 'h2', label: t('floatingToolbar.heading2'), icon: Heading2, shortcut: 'Ctrl+2' },
  { id: 'h3', label: t('floatingToolbar.heading3'), icon: Heading3, shortcut: 'Ctrl+3' },
  { id: 'h4', label: t('floatingToolbar.heading4'), icon: Heading4, shortcut: '' },
  { id: 'h5', label: t('floatingToolbar.heading5'), icon: Heading5, shortcut: '' },
  { id: 'h6', label: t('floatingToolbar.heading6'), icon: Heading6, shortcut: '' },
];

const FORMAT_OPTIONS = (t: (key: string) => string) => [
  { id: 'bold', icon: Bold, command: 'bold', title: t('floatingToolbar.bold') },
  { id: 'italic', icon: Italic, command: 'italic', title: t('floatingToolbar.italic') },
  { id: 'strike', icon: Strikethrough, command: 'strikethrough', title: t('floatingToolbar.strikethrough') },
  { id: 'code', icon: Code, command: 'code', title: t('floatingToolbar.inlineCode') },
  { id: 'link', icon: Link, command: 'link', title: t('floatingToolbar.link') },
];

function HeadingDropdown({ onSelect, onClose, t }: { onSelect: (id: string) => void; onClose: () => void; t: (key: string) => string }) {
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
      {HEADING_OPTIONS(t).map((opt) => {
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
  const { t } = useTranslation();
  const [state, setState] = useState<ToolbarState>({
    visible: false,
    position: { x: 0, y: 0 },
  });
  const [showHeadingDropdown, setShowHeadingDropdown] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const updateToolbar = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed || !hasEditorSelection()) {
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
      rememberEditorSelection();
      const url = window.prompt(t('editor.enterLinkUrl'), getActiveLinkHref() ?? 'https://');
      if (url !== null) {
        applyLink(url);
      }
    } else if (command === 'heading') {
      setShowHeadingDropdown(!showHeadingDropdown);
    } else {
      const formatMap = {
        bold: 'bold',
        italic: 'italic',
        strikethrough: 'strikethrough',
        code: 'inline-code',
      } as const;

      const format = formatMap[command as keyof typeof formatMap];
      if (format) {
        applyInlineFormat(format);
      }
    }
  };

  const handleHeadingSelect = (level: string) => {
    const formatMap = {
      p: 'paragraph',
      h1: 'heading-1',
      h2: 'heading-2',
      h3: 'heading-3',
      h4: 'heading-4',
      h5: 'heading-5',
      h6: 'heading-6',
    } as const;

    const format = formatMap[level as keyof typeof formatMap];
    if (format) {
      applyBlockFormat(format);
    }
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

  if (!state.visible) return null;

  return (
    <div
      ref={toolbarRef}
      onMouseDown={(event) => {
        event.preventDefault();
        rememberEditorSelection();
      }}
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
          title={t('floatingToolbar.paragraphFormat')}
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
            t={t}
          />
        )}
      </div>

      <div style={{ width: '1px', height: '16px', background: 'var(--color-line-soft)', margin: '0 4px' }} />

      {FORMAT_OPTIONS(t).map((btn) => {
        const Icon = btn.icon;
        const active =
          btn.command === 'link'
            ? Boolean(getActiveLinkHref())
            : isInlineFormatActive(
                btn.command === 'bold'
                  ? 'bold'
                  : btn.command === 'italic'
                    ? 'italic'
                    : btn.command === 'strikethrough'
                      ? 'strikethrough'
                      : 'inline-code'
              );

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
              background: active ? 'var(--color-surface-sunken)' : 'transparent',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-sunken)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = active ? 'var(--color-surface-sunken)' : 'transparent')}
          >
            <Icon size={14} />
          </button>
        );
      })}
    </div>
  );
}
