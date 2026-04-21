import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

interface OutlineItem {
  id: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
}

export function Outline() {
  const { t } = useTranslation();
  const [items, setItems] = useState<OutlineItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const extractHeadings = useCallback(() => {
    const headings: OutlineItem[] = [];
    const editor = document.querySelector('.ProseMirror');
    if (!editor) {
      return headings;
    }

    // Find all heading elements - Milkdown uses h1, h2, h3, h4, h5, h6 tags
    const headingElements = editor.querySelectorAll('h1, h2, h3, h4, h5, h6');

    headingElements.forEach((node, index) => {
      const tagName = node.tagName.toLowerCase();
      const level = parseInt(tagName.replace('h', '')) as 1 | 2 | 3 | 4 | 5 | 6;
      const text = node.textContent?.trim() || '';
      const id = node.id || `heading-${index}`;

      if (!node.id) {
        node.id = id;
      }

      if (text) {
        headings.push({ id, level, text });
      }
    });

    setItems(headings);
    return headings;
  }, []);

  useEffect(() => {
    // Initial extraction after editor is ready
    const timer = setTimeout(extractHeadings, 200);

    // Poll for editor readiness
    let pollCount = 0;
    const pollTimer = setInterval(() => {
      const editor = document.querySelector('.ProseMirror');
      if (editor && pollCount < 20) {
        extractHeadings();
        pollCount++;
      }
      if (pollCount >= 20) {
        clearInterval(pollTimer);
      }
    }, 100);

    return () => {
      clearTimeout(timer);
      clearInterval(pollTimer);
    };
  }, [extractHeadings]);

  // Listen for content changes
  useEffect(() => {
    const handleContentChange = () => {
      setTimeout(extractHeadings, 100);
    };

    window.addEventListener('editor-content-changed', handleContentChange);

    // Also poll periodically
    const pollInterval = setInterval(extractHeadings, 1000);

    return () => {
      window.removeEventListener('editor-content-changed', handleContentChange);
      clearInterval(pollInterval);
    };
  }, [extractHeadings]);

  // Watch for DOM mutations
  useEffect(() => {
    const editor = document.querySelector('.ProseMirror');
    if (!editor) return;

    const observer = new MutationObserver(() => {
      setTimeout(extractHeadings, 50);
    });

    observer.observe(editor, {
      childList: true,
      subtree: true,
      characterData: true
    });

    return () => observer.disconnect();
  }, [extractHeadings]);

  const scrollToHeading = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveId(id);
    }
  };

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-paper)',
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--color-line-soft)',
        }}
      >
        <span
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--color-muted)',
            textTransform: 'uppercase',
          }}
        >
          {t('outline.title')}
        </span>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
        {items.length === 0 ? (
          <div
            style={{
              padding: '12px',
              textAlign: 'center',
              color: 'var(--color-muted)',
              fontSize: '13px',
            }}
          >
            {t('outline.empty')}
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              onClick={() => scrollToHeading(item.id)}
              style={{
                padding: '4px 12px',
                paddingLeft: `${12 + (item.level - 1) * 12}px`,
                fontSize: '13px',
                cursor: 'pointer',
                borderRadius: 'var(--radius-sm)',
                background: activeId === item.id ? 'var(--color-surface-sunken)' : 'transparent',
                color: activeId === item.id ? 'var(--color-ink)' : 'var(--color-muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                margin: '2px 4px',
              }}
              onMouseEnter={(e) => {
                if (activeId !== item.id) {
                  e.currentTarget.style.background = 'var(--color-surface-sunken)';
                }
              }}
              onMouseLeave={(e) => {
                if (activeId !== item.id) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              {item.text}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
