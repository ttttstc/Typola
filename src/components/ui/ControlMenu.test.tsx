// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MoreHorizontal } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ControlMenu } from './ControlMenu';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('ControlMenu', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('supports menu semantics, arrow navigation and Escape focus return', () => {
    const first = vi.fn();
    const second = vi.fn();
    act(() => root.render(
      <ControlMenu
        label="更多"
        icon={<MoreHorizontal />}
        items={[
          { id: 'first', label: '第一项', onSelect: first },
          { id: 'second', label: '第二项', onSelect: second },
        ]}
      />,
    ));
    const trigger = host.querySelector<HTMLButtonElement>('button[aria-label="更多"]')!;
    act(() => trigger.click());
    const menu = document.querySelector<HTMLElement>('.control-menu')!;
    const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(items).toHaveLength(2);

    act(() => {
      items[0].focus();
      items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(document.activeElement).toBe(items[1]);

    act(() => {
      menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(document.querySelector('.control-menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('uses radio semantics for mutually exclusive selections', () => {
    act(() => root.render(
      <ControlMenu
        label="Provider"
        icon={<MoreHorizontal />}
        items={[
          {
            id: 'claude',
            label: 'Claude',
            active: true,
            selection: 'radio',
            onSelect: () => undefined,
          },
          {
            id: 'gemini',
            label: 'Gemini',
            active: false,
            selection: 'radio',
            onSelect: () => undefined,
          },
        ]}
      />,
    ));

    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="Provider"]')!.click());
    const items = document.querySelectorAll('[role="menuitemradio"]');
    expect(items).toHaveLength(2);
    expect(items[0].getAttribute('aria-checked')).toBe('true');
    expect(items[1].getAttribute('aria-checked')).toBe('false');
  });
});
