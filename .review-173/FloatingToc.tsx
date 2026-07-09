import { ChevronDown, ChevronRight, Pin, PinOff, X } from 'lucide-react';
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import type { TocItem } from '../types/document';
import { useSettings } from '../hooks/useSettings';
import { translate } from '../services/i18n';
import {
  buildTocTree,
  filterCollapsed,
  findAncestorChain,
} from '../services/tocTree';

type FloatingTocProps = {
  items: TocItem[];
  activeIndex: number;
  pinned: boolean;
  alwaysPinned: boolean;
  onPinnedChange: (pinned: boolean) => void;
  onAlwaysPinnedChange: (alwaysPinned: boolean) => void;
  onNavigate: (item: TocItem, index: number) => void;
};

export function FloatingToc({
  items,
  activeIndex,
  pinned,
  alwaysPinned,
  onPinnedChange,
  onAlwaysPinnedChange,
  onNavigate,
}: FloatingTocProps) {
  const settings = useSettings();
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);
  const [expanded, setExpanded] = useState(false);
  const railRef = useRef<HTMLButtonElement>(null);
  const suppressRailFocusRef = useRef(false);
  // Collapsed subtree roots, keyed by TocItem.flatIndex. Transient per session
  // (Q2): unmounting the panel (close + reopen) or switching files resets.
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());
  const panelVisible = pinned || expanded;
  const railLabel = t('openTocHint');
  const pinLabel = pinned ? t('unpinTocHint') : t('pinTocHint');
  const closeLabel = t('closeTocHint');
  const alwaysPinnedLabel = t('tocAlwaysPinnedLabel');
  const collapseLabel = t('tocCollapse');
  const expandLabel = t('tocExpand');

  const tree = useMemo(() => buildTocTree(items), [items]);
  const visibleItems = useMemo(
    () => filterCollapsed(tree, collapsed),
    [tree, collapsed],
  );

  // The chevron column is only meaningful for headings that have descendants.
  // For leaves we render a hidden placeholder so indentation stays consistent
  // across rows (Q4 / risk 4). Computed before the early return so the hook
  // order is stable when `items` flips between empty / non-empty.
  const subtreeIndex = useMemo(() => {
    const hasChildren = new Set<number>();
    const visit = (nodes: ReturnType<typeof buildTocTree>) => {
      nodes.forEach((node) => {
        if (node.children.length > 0) hasChildren.add(node.flatIndex);
        visit(node.children);
      });
    };
    visit(tree);
    return hasChildren;
  }, [tree]);

  // Active heading must stay visible. If a tracked active heading lives under
  // a collapsed ancestor, force-expand the chain (mirrors the search-match
  // auto-expand in AppLayout.handleSearchNavigate).
  useEffect(() => {
    if (activeIndex < 0 || activeIndex >= items.length) return;
    const chain = findAncestorChain(tree, activeIndex);
    if (!chain) return;
    const toExpand = chain.slice(0, -1); // skip the active node itself
    if (toExpand.every((i) => !collapsed.has(i))) return;
    setCollapsed((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const i of toExpand) {
        if (next.delete(i)) changed = true;
      }
      return changed ? next : prev;
    });
  }, [activeIndex, collapsed, items.length, tree]);

  if (items.length === 0) return null;

  const handleRailFocus = () => {
    if (suppressRailFocusRef.current) {
      suppressRailFocusRef.current = false;
      return;
    }
    setExpanded(true);
  };

  const focusRailAfterCollapse = () => {
    suppressRailFocusRef.current = true;
    if (typeof window === 'undefined') return;

    window.requestAnimationFrame(() => {
      railRef.current?.focus({ preventScroll: true });
    });
  };

  const handlePinToggle = () => {
    if (pinned) {
      onPinnedChange(false);
      setExpanded(true);
      return;
    }

    setExpanded(false);
    onPinnedChange(true);
  };

  const handleClose = () => {
    setExpanded(false);
    if (pinned) onPinnedChange(false);
    focusRailAfterCollapse();
  };

  const toggleCollapsed = (flatIndex: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(flatIndex)) {
        next.delete(flatIndex);
      } else {
        next.add(flatIndex);
      }
      return next;
    });
  };

  return (
    <aside
      className={`floating-toc ${pinned ? 'pinned' : ''} ${expanded ? 'expanded' : ''}`}
      aria-label={t('floatingTocLabel')}
      onPointerLeave={() => {
        if (!pinned) setExpanded(false);
      }}
    >
      <button
        ref={railRef}
        type="button"
        className="floating-toc-rail"
        aria-label={railLabel}
        aria-controls="floating-toc-panel"
        aria-expanded={panelVisible}
        title={railLabel}
        onPointerEnter={() => setExpanded(true)}
        onFocus={handleRailFocus}
        onClick={() => setExpanded(true)}
      >
        {items.map((item, index) => (
          <span
            key={`${item.id}-rail`}
            className={`floating-toc-tick level-${Math.min(item.level, 6)} ${index === activeIndex ? 'active' : ''}`}
            style={{ '--toc-depth': Math.min(Math.max(item.level - 1, 0), 5) } as CSSProperties}
            aria-hidden="true"
          />
        ))}
      </button>

      <div id="floating-toc-panel" className="floating-toc-panel" aria-hidden={!panelVisible}>
        <div className="floating-toc-header">
          <span>{t('tocTitle')}</span>
          <div className="floating-toc-header-actions">
            <button
              type="button"
              className="floating-toc-action floating-toc-pin-toggle"
              aria-label={pinLabel}
              aria-pressed={pinned}
              title={pinLabel}
              onClick={handlePinToggle}
            >
              {pinned ? <PinOff size={14} aria-hidden="true" /> : <Pin size={14} aria-hidden="true" />}
            </button>
            <button
              type="button"
              className="floating-toc-action floating-toc-close"
              aria-label={closeLabel}
              title={closeLabel}
              onClick={handleClose}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
        {pinned && (
          <button
            type="button"
            className="floating-toc-preference"
            aria-pressed={alwaysPinned}
            onClick={() => onAlwaysPinnedChange(!alwaysPinned)}
          >
            <span>{alwaysPinnedLabel}</span>
            <span className="floating-toc-switch" aria-hidden="true" />
          </button>
        )}
        <nav className="floating-toc-list" aria-label={t('documentTocLabel')}>
          {visibleItems.map(({ item, flatIndex }) => {
            const hasSubtree = subtreeIndex.has(flatIndex);
            const isCollapsed = collapsed.has(flatIndex);
            return (
              <div
                key={item.id}
                className={`floating-toc-row toc-h${item.level} ${flatIndex === activeIndex ? 'active' : ''}`}
                style={{ '--toc-depth': Math.min(Math.max(item.level - 1, 0), 5) } as CSSProperties}
              >
                <button
                  type="button"
                  className={`floating-toc-chevron ${hasSubtree ? '' : 'is-leaf'}`}
                  aria-label={hasSubtree ? (isCollapsed ? expandLabel : collapseLabel) : undefined}
                  aria-expanded={hasSubtree ? !isCollapsed : undefined}
                  aria-hidden={!hasSubtree}
                  tabIndex={hasSubtree ? 0 : -1}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (hasSubtree) toggleCollapsed(flatIndex);
                  }}
                >
                  {hasSubtree && (isCollapsed ? <ChevronRight size={12} aria-hidden="true" /> : <ChevronDown size={12} aria-hidden="true" />)}
                </button>
                <button
                  type="button"
                  className="floating-toc-item"
                  aria-current={flatIndex === activeIndex ? 'location' : undefined}
                  onClick={() => onNavigate(item, flatIndex)}
                >
                  <span>{item.text}</span>
                </button>
              </div>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
