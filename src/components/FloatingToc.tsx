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
  openRequest?: number;
  onPinnedChange: (pinned: boolean) => void;
  onAlwaysPinnedChange: (alwaysPinned: boolean) => void;
  onNavigate: (item: TocItem, index: number) => void;
};

export function FloatingToc({
  items,
  activeIndex,
  pinned,
  alwaysPinned,
  openRequest,
  onPinnedChange,
  onAlwaysPinnedChange,
  onNavigate,
}: FloatingTocProps) {
  const settings = useSettings();
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);
  const [expanded, setExpanded] = useState(false);
  const lastOpenRequestRef = useRef(openRequest);
  // Collapsed subtree roots, keyed by TocItem.flatIndex. Transient per
  // session: switching files clears the set (effect below) and unmounting
  // the panel drops it on the floor.
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());
  // Track the last activeIndex we already auto-expanded for, so the effect
  // doesn't re-run on every render and clobber a collapse the user just made
  // (see review #1 on PR #173).
  const lastExpandedForActiveRef = useRef<number>(-1);
  // Track the previous items identity so we can clear collapsed when the
  // user switches documents (see review #2).
  const lastItemsRef = useRef(items);
  const panelVisible = pinned || expanded;
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

  // Active heading must stay visible. If a tracked active heading lives
  // under a collapsed ancestor, force-expand the chain. We only run this
  // when activeIndex actually changes (tracked via ref) — never on a
  // collapsed-set change — so the user's manual collapse of the active
  // ancestor is preserved. See review #1 on PR #173.
  useEffect(() => {
    if (activeIndex < 0 || activeIndex >= items.length) return;
    if (lastExpandedForActiveRef.current === activeIndex) return;
    lastExpandedForActiveRef.current = activeIndex;
    const chain = findAncestorChain(tree, activeIndex);
    if (!chain) return;
    const toExpand = chain.slice(0, -1); // skip the active node itself
    if (toExpand.length === 0) return;
    setCollapsed((prev) => {
      if (toExpand.every((i) => !prev.has(i))) return prev;
      const next = new Set(prev);
      for (const i of toExpand) next.delete(i);
      return next;
    });
  }, [activeIndex, items.length, tree]);

  // File switch clears the collapsed set so flatIndex keys from the previous
  // document don't accidentally fold the new one. Review #2 on PR #173.
  useEffect(() => {
    if (lastItemsRef.current === items) return;
    lastItemsRef.current = items;
    lastExpandedForActiveRef.current = -1;
    setCollapsed(new Set());
  }, [items]);

  useEffect(() => {
    if (openRequest === undefined || lastOpenRequestRef.current === openRequest) return;
    lastOpenRequestRef.current = openRequest;
    setExpanded(true);
  }, [openRequest]);

  if (items.length === 0) return null;

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
      onPointerEnter={() => {
        if (!pinned) setExpanded(true);
      }}
    >
      {!pinned && <div className="floating-toc-edge-trigger" aria-hidden="true" />}

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
            const itemId = `toc-item-${item.id}`;
            // WAI-ARIA disclosure hint: name the chevron after the heading it
            // controls so screen readers don't read "collapse subheadings
            // button" N times in a row. Review #5 on PR #173.
            const chevronLabel = hasSubtree
              ? `${isCollapsed ? expandLabel : collapseLabel} · ${item.text}`
              : undefined;
            return (
              <div
                key={item.id}
                className={`floating-toc-row toc-h${item.level} ${flatIndex === activeIndex ? 'active' : ''}`}
                style={{ '--toc-depth': Math.min(Math.max(item.level - 1, 0), 5) } as CSSProperties}
              >
                {hasSubtree ? (
                  <button
                    type="button"
                    className="floating-toc-chevron"
                    aria-label={chevronLabel}
                    aria-expanded={!isCollapsed}
                    aria-controls={itemId}
                    onClick={() => toggleCollapsed(flatIndex)}
                  >
                    {isCollapsed
                      ? <ChevronRight size={12} aria-hidden="true" />
                      : <ChevronDown size={12} aria-hidden="true" />}
                  </button>
                ) : (
                  // Leaf placeholder: preserves the chevron column width so
                  // sibling rows stay aligned. WAI-ARIA forbids aria-hidden on
                  // a focusable element, so we don't render a button at all
                  // (review #4 on PR #173).
                  <span className="floating-toc-chevron is-leaf" aria-hidden="true" />
                )}
                <button
                  type="button"
                  id={itemId}
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
