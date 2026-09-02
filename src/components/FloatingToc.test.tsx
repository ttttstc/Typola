// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TocItem } from '../types/document';
import { FloatingToc } from './FloatingToc';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../services/i18n', () => ({
  translate: () => '',
}));

const updateSettingsMock = vi.fn();
vi.mock('../services/settingsService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/settingsService')>();
  return {
    ...actual,
    updateSettings: (...args: Parameters<typeof actual.updateSettings>) => updateSettingsMock(...args),
  };
});

let mockSettings: { locale: string; tocPanelWidth: number } = { locale: 'en-US', tocPanelWidth: 260 };
vi.mock('../hooks/useSettings', () => ({
  useSettings: () => mockSettings,
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

describe('FloatingToc — 拖拽调宽与悬停提示 (issue #264)', () => {
  const originalRaf = window.requestAnimationFrame;
  const originalCancelRaf = window.cancelAnimationFrame;

  beforeEach(() => {
    mockSettings = { locale: 'en-US', tocPanelWidth: 260 };
    updateSettingsMock.mockClear();
    // jsdom 的 rAF 是异步定时器。用微任务模拟"下一帧",act(await) 会冲刷。
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      queueMicrotask(() => callback(0));
      return 1;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = (() => undefined) as typeof window.cancelAnimationFrame;
  });

  afterEach(() => {
    window.requestAnimationFrame = originalRaf;
    window.cancelAnimationFrame = originalCancelRaf;
  });

  function fire(target: EventTarget, type: string, clientX: number): void {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX, button: 0 }));
  }

  it('仅固定态渲染右缘分隔条,悬停提示显示完整标题', async () => {
    const pinned = await mountFloatingToc(makeItems(), 0, true);
    const resizer = pinned.host.querySelector<HTMLElement>('.floating-toc-resizer');
    expect(resizer).toBeTruthy();
    expect(resizer?.getAttribute('role')).toBe('separator');
    // 长标题被截断时,标题按钮通过 title 提供完整文本。
    const firstItem = pinned.host.querySelector<HTMLButtonElement>('.floating-toc-item');
    expect(firstItem?.getAttribute('title')).toBe('A');
    pinned.cleanup();

    const floating = await mountFloatingToc(makeItems(), 0, false);
    expect(floating.host.querySelector('.floating-toc-resizer')).toBeNull();
    floating.cleanup();
  });

  it('拖动分隔条更新宽度并在松手时持久化到设置', async () => {
    const h = await mountFloatingToc(makeItems(), 0, true);
    const aside = h.host.querySelector<HTMLElement>('.floating-toc');
    expect(aside?.style.width).toBe('260px');

    const resizer = h.host.querySelector<HTMLElement>('.floating-toc-resizer');
    await act(async () => {
      resizer!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 260, button: 0 }));
    });
    await act(async () => { fire(window, 'pointermove', 320); });
    expect(aside?.style.width).toBe('320px');
    // 拖拽中不落盘。
    expect(updateSettingsMock).not.toHaveBeenCalled();

    await act(async () => { fire(window, 'pointerup', 320); });
    expect(updateSettingsMock).toHaveBeenCalledWith({ tocPanelWidth: 320 });
    expect(aside?.style.width).toBe('260px'); // 回落到 settings 值(mock 未变)
    h.cleanup();
  });

  it('拖出边界时宽度收进 [200, 480]', async () => {
    const h = await mountFloatingToc(makeItems(), 0, true);
    const aside = h.host.querySelector<HTMLElement>('.floating-toc');
    const resizer = h.host.querySelector<HTMLElement>('.floating-toc-resizer');
    await act(async () => {
      resizer!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 260, button: 0 }));
    });
    await act(async () => { fire(window, 'pointermove', 50); });
    expect(aside?.style.width).toBe('200px');
    await act(async () => { fire(window, 'pointermove', 2000); });
    expect(aside?.style.width).toBe('480px');
    await act(async () => { fire(window, 'pointerup', 2000); });
    expect(updateSettingsMock).toHaveBeenCalledWith({ tocPanelWidth: 480 });
    h.cleanup();
  });
});
