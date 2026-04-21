import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Heading1,
  Heading2,
  Heading3,
  Quote,
  Minus,
  List,
  ListOrdered,
  CheckSquare,
  Table,
  Code,
  Image,
  Link,
  GitBranch,
} from 'lucide-react';

export function SlashMenu() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [filter, setFilter] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  const SLASH_ITEMS = [
    { id: 'h1', label: t('slashMenu.heading1'), icon: Heading1, group: 'text' },
    { id: 'h2', label: t('slashMenu.heading2'), icon: Heading2, group: 'text' },
    { id: 'h3', label: t('slashMenu.heading3'), icon: Heading3, group: 'text' },
    { id: 'quote', label: t('slashMenu.quote'), icon: Quote, group: 'text' },
    { id: 'divider', label: t('slashMenu.divider'), icon: Minus, group: 'text' },
    { id: 'bullet', label: t('slashMenu.bulletList'), icon: List, group: 'list' },
    { id: 'ordered', label: t('slashMenu.orderedList'), icon: ListOrdered, group: 'list' },
    { id: 'todo', label: t('slashMenu.todoList'), icon: CheckSquare, group: 'list' },
    { id: 'table', label: t('slashMenu.table'), icon: Table, group: 'insert' },
    { id: 'code', label: t('slashMenu.codeBlock'), icon: Code, group: 'insert' },
    { id: 'image', label: t('slashMenu.image'), icon: Image, group: 'insert' },
    { id: 'link', label: t('slashMenu.link'), icon: Link, group: 'insert' },
    { id: 'mermaid', label: t('slashMenu.mermaid'), icon: GitBranch, group: 'diagram' },
  ];

  const filteredItems = SLASH_ITEMS.filter((item) =>
    item.label.toLowerCase().includes(filter.toLowerCase())
  );

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!visible) {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const textNode = range.startContainer;
          if (textNode.nodeType === Node.TEXT_NODE) {
            const text = textNode.textContent || '';
            const cursorPos = range.startOffset;
            const textBefore = text.slice(0, cursorPos);
            if (textBefore === '' || textBefore.endsWith('\n')) {
              e.preventDefault();
              setVisible(true);
              setFilter('');
              setSelectedIndex(0);
            }
          }
        }
      }
      return;
    }

    if (e.key === 'Escape') {
      setVisible(false);
      e.preventDefault();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filteredItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        insertBlock(filteredItems[selectedIndex].id);
      }
      setVisible(false);
    } else if (e.key === 'Backspace') {
      if (filter.length > 0) {
        setFilter((prev) => prev.slice(0, -1));
        setSelectedIndex(0);
        e.preventDefault();
      } else {
        setVisible(false);
      }
    } else if (e.key === ' ' || e.key === '#') {
      setVisible(false);
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      setFilter((prev) => prev + e.key);
      setSelectedIndex(0);
    }
  }, [visible, filter, filteredItems, selectedIndex]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const insertBlock = (id: string) => {
    const editor = document.querySelector('.ProseMirror');
    if (!editor) return;

    const blockContent: Record<string, string> = {
      h1: '# ',
      h2: '## ',
      h3: '### ',
      quote: '> ',
      divider: '\n---\n',
      bullet: '- ',
      ordered: '1. ',
      todo: '- [ ] ',
      table: t('slashMenu.tableTemplate'),
      code: '```\n\n```',
      image: '![image]()',
      link: '[text](url)',
      mermaid: '```mermaid\nflowchart LR\n  A --> B\n```',
    };

    const content = blockContent[id] || '';
    document.execCommand('insertText', false, content);
  };

  if (!visible) return null;

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '280px',
        maxHeight: '360px',
        background: 'var(--color-paper)',
        border: '1px solid var(--color-line-soft)',
        borderRadius: 'var(--radius-md)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        overflow: 'hidden',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--color-line-soft)',
          fontSize: '12px',
          color: 'var(--color-muted)',
        }}
      >
        <input
          type="text"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setSelectedIndex(0);
          }}
          placeholder={t('slashMenu.filterPlaceholder')}
          style={{
            width: '100%',
            border: 'none',
            background: 'transparent',
            fontSize: '13px',
            color: 'var(--color-ink)',
            outline: 'none',
          }}
          autoFocus
        />
      </div>
      <div style={{ maxHeight: '300px', overflow: 'auto' }}>
        {filteredItems.map((item, index) => {
          const Icon = item.icon;
          return (
            <div
              key={item.id}
              onClick={() => {
                insertBlock(item.id);
                setVisible(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 12px',
                gap: '12px',
                height: '36px',
                background: index === selectedIndex ? 'var(--color-surface-sunken)' : 'transparent',
                cursor: 'pointer',
              }}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <Icon size={16} style={{ color: 'var(--color-muted)' }} />
              <span style={{ fontSize: '13px', color: 'var(--color-ink)' }}>
                {item.label}
              </span>
            </div>
          );
        })}
        {filteredItems.length === 0 && (
          <div
            style={{
              padding: '12px',
              textAlign: 'center',
              color: 'var(--color-muted)',
              fontSize: '13px',
            }}
          >
            {t('slashMenu.noMatch')}
          </div>
        )}
      </div>
    </div>
  );
}
