// @vitest-environment jsdom
import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('UnsavedChangesDialog 可访问性', () => {
  let host: HTMLDivElement;
  let root: Root;
  let trigger: HTMLButtonElement;

  beforeEach(() => {
    localStorage.clear();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('限制 Tab 焦点、支持 Escape，并在关闭后恢复焦点和解除背景 inert', async () => {
    const onChoice = vi.fn();
    await act(async () => {
      root.render(
        <div>
          <button
            ref={(node) => {
              if (node) {
                trigger = node;
                node.focus();
              }
            }}
            type="button"
            data-testid="trigger"
          >
            触发关闭
          </button>
          <UnsavedChangesDialog
            open
            message="有多个文档未保存"
            allowSaveAll
            allowDiscardAll
            onChoice={onChoice}
          />
        </div>,
      );
    });

    const first = host.querySelector<HTMLButtonElement>('[data-action="discard-all"]')!;
    const last = host.querySelector<HTMLButtonElement>('[data-action="save-all"]')!;
    expect(document.activeElement).toBe(last);
    expect(trigger.hasAttribute('inert')).toBe(true);

    trigger.focus();
    expect(document.activeElement).toBe(last);

    first.focus();
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true }));
    });
    expect(document.activeElement).toBe(last);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    });
    expect(document.activeElement).toBe(first);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onChoice).toHaveBeenCalledWith('cancel');

    await act(async () => {
      root.render(<div><button ref={(node) => { if (node) trigger = node; }} type="button" data-testid="trigger">触发关闭</button></div>);
    });
    expect(document.activeElement).toBe(trigger);
    expect(trigger.hasAttribute('inert')).toBe(false);
  });
});
