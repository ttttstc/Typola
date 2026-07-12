// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TocItem } from '../types/document';
import { FloatingToc } from './FloatingToc';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../services/i18n', () => ({
  translate: () => '',
}));
vi.mock('../hooks/useSettings', () => ({
  useSettings: () => ({ locale: 'en-US' }),
}));

function makeItems(): TocItem[] {
  return [
    { level: 1, text: 'A', id: 'a' },
    { level: 2, text: 'A.1', id: 'a1' },
    { level: 2, text: 'A.2', id: 'a2' },
    { level: 1, text: 'B', id: 'b' },
    { level: 2, text: 'B.1', id: 'b1' },
  ];
}

type Harness = {
  host: HTMLDivElement;
  root: Root;
  cleanup: () => void;
  setActive: (idx: number) => Promise<void>;
  setItems: (items: TocItem[]) => Promise<void>;
  clickChevron: (headingText: string) => Promise<void>;
  requestOpen: () => Promise<void>;
  itemLabels: () => string[];
};

async function mountFloatingToc(initialItems: TocItem[], initialActive = 0, pinned = true): Promise<Harness> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  let currentItems = initialItems;
  let currentActive = initialActive;
  let openRequest = 0;

  const render = () => (
    <FloatingToc
      items={currentItems}
      activeIndex={currentActive}
      pinned={pinned}
      alwaysPinned={false}
      openRequest={openRequest}
      onPinnedChange={vi.fn()}
      onAlwaysPinnedChange={vi.fn()}
      onNavigate={vi.fn()}
    />
  );
  await act(async () => { root.render(render()); });

  return {
    host,
    root,
    cleanup: () => { root.unmount(); host.remove(); },
    setActive: async (idx) => {
      currentActive = idx;
      await act(async () => { root.render(render()); });
    },
    setItems: async (items) => {
      currentItems = items;
      await act(async () => { root.render(render()); });
    },
    clickChevron: async (headingText) => {
      const chevron = host.querySelector<HTMLButtonElement>(
        `button.floating-toc-chevron[aria-label*="${headingText}"]`,
      );
      if (!chevron) throw new Error(`chevron for "${headingText}" not found`);
      await act(async () => { chevron.click(); });
    },
    requestOpen: async () => {
      openRequest += 1;
      await act(async () => { root.render(render()); });
    },
    itemLabels: () => Array.from(host.querySelectorAll('.floating-toc-item span')).map((n) => n.textContent ?? ''),
  };
}

describe('FloatingToc — active parent auto-expand (review #6)', () => {
  const items = makeItems();
  let h: Harness;

  afterEach(() => h.cleanup());

  it('expands the ancestor chain when activeIndex jumps into a collapsed subtree', async () => {
    h = await mountFloatingToc(items, 0);
    // Collapsing A hides only A.1 / A.2 (B and B.1 stay because B is a sibling).
    await h.clickChevron('A');
    expect(h.itemLabels()).toEqual(['A', 'B', 'B.1']);

    // Jumping activeIndex to A.1 (which is under the now-collapsed A) must
    // auto-expand A.
    await h.setActive(1);
    expect(h.itemLabels()).toEqual(['A', 'A.1', 'A.2', 'B', 'B.1']);
  });

  it('does NOT re-expand a node the user just collapsed (review #1)', async () => {
    // active=1 (A.1) is already under A. The effect ref-gates on activeIndex
    // changes, so collapsing A right after mount must stick.
    h = await mountFloatingToc(items, 1);
    await h.clickChevron('A');
    expect(h.itemLabels()).toEqual(['A', 'B', 'B.1']);
  });

  it('ignores activeIndex out of range without touching collapsed state', async () => {
    h = await mountFloatingToc(items, -1);
    expect(h.itemLabels()).toEqual(['A', 'A.1', 'A.2', 'B', 'B.1']);
    await h.clickChevron('A');
    expect(h.itemLabels()).toEqual(['A', 'B', 'B.1']);
  });
});

describe('FloatingToc — file switch clears collapsed (review #2)', () => {
  const itemsA: TocItem[] = [
    { level: 1, text: 'A0', id: 'a0' },
    { level: 2, text: 'A1', id: 'a1' },
  ];
  const itemsB: TocItem[] = [
    { level: 1, text: 'B0', id: 'b0' },
    { level: 2, text: 'B1', id: 'b1' },
  ];

  it('drops the collapsed set when the items array identity changes', async () => {
    const h = await mountFloatingToc(itemsA, 0);
    await h.clickChevron('A0');
    expect(h.itemLabels()).toEqual(['A0']);
    await h.setItems(itemsB);
    expect(h.itemLabels()).toEqual(['B0', 'B1']);
    h.cleanup();
  });
});

describe('FloatingToc — chevron accessibility (reviews #4 and #5)', () => {
  const items: TocItem[] = [
    { level: 1, text: 'Parent', id: 'p' },
    { level: 2, text: 'Child', id: 'c' },
    { level: 1, text: 'Standalone', id: 'x' },
  ];

  it('leaves have a placeholder span, not a focusable button (review #4)', async () => {
    const h = await mountFloatingToc(items, 0);
    const rows = h.host.querySelectorAll('.floating-toc-row');
    const standaloneRow = rows[rows.length - 1];
    const placeholder = standaloneRow?.querySelector('.floating-toc-chevron.is-leaf');
    expect(placeholder).toBeTruthy();
    expect(placeholder?.tagName).toBe('SPAN');
    expect(placeholder?.getAttribute('aria-hidden')).toBe('true');
    h.cleanup();
  });

  it('chevron aria-label names the heading it controls (review #5)', async () => {
    const h = await mountFloatingToc(items, 0);
    const chevron = h.host.querySelector<HTMLButtonElement>('button.floating-toc-chevron');
    expect(chevron).toBeTruthy();
    expect(chevron?.getAttribute('aria-label')).toMatch(/Parent/);
    expect(chevron?.getAttribute('aria-controls')).toBe('toc-item-p');
    h.cleanup();
  });
});

describe('FloatingToc — edge drawer trigger', () => {
  it('opens when the toolbar issues an open request without pinning the outline', async () => {
    const h = await mountFloatingToc(makeItems(), 0, false);
    expect(h.host.querySelector('.floating-toc-rail')).toBeNull();
    expect(h.host.querySelector('.floating-toc-edge-trigger')).toBeTruthy();
    expect(h.host.querySelector('.floating-toc')?.classList.contains('expanded')).toBe(false);
    await h.requestOpen();
    expect(h.host.querySelector('.floating-toc')?.classList.contains('expanded')).toBe(true);
    h.cleanup();
  });
});
