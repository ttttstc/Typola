import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditorStore } from '../store/editor';
import { extractOutlineHeadings } from '../shared/outline';

export function Outline() {
  const { t } = useTranslation();
  const content = useEditorStore((state) => state.content);
  const items = useMemo(() => extractOutlineHeadings(content), [content]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const scrollToHeading = (index: number) => {
    const headings = document.querySelectorAll<HTMLElement>('.ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6');
    const target = headings[index];
    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveIndex(index);
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
          items.map((item, index) => (
            <div
              key={`${item.level}-${item.text}-${index}`}
              onClick={() => scrollToHeading(index)}
              style={{
                padding: '4px 12px',
                paddingLeft: `${12 + (item.level - 1) * 12}px`,
                fontSize: '13px',
                cursor: 'pointer',
                borderRadius: 'var(--radius-sm)',
                background: activeIndex === index ? 'var(--color-surface-sunken)' : 'transparent',
                color: activeIndex === index ? 'var(--color-ink)' : 'var(--color-muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                margin: '2px 4px',
              }}
              onMouseEnter={(event) => {
                if (activeIndex !== index) {
                  event.currentTarget.style.background = 'var(--color-surface-sunken)';
                }
              }}
              onMouseLeave={(event) => {
                if (activeIndex !== index) {
                  event.currentTarget.style.background = 'transparent';
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
