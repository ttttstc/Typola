// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PromptDialog } from './PromptDialog';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Harness = {
  host: HTMLDivElement;
  root: Root;
  input: () => HTMLInputElement;
  cleanup: () => void;
};

async function mount(props: Partial<Parameters<typeof PromptDialog>[0]> = {}): Promise<Harness & {
  onSubmit: ReturnType<typeof vi.fn>;
  onCancel: ReturnType<typeof vi.fn>;
}> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  await act(async () => {
    root.render(
      <PromptDialog
        open
        title="存为文件"
        defaultValue="季度汇报图表"
        onSubmit={onSubmit}
        onCancel={onCancel}
        {...props}
      />,
    );
  });
  return {
    host,
    root,
    onSubmit,
    onCancel,
    input: () => {
      const input = host.querySelector('input');
      if (!input) throw new Error('input not found');
      return input;
    },
    cleanup: () => { root.unmount(); host.remove(); },
  };
}

describe('PromptDialog', () => {
  let h: Awaited<ReturnType<typeof mount>> | null = null;
  afterEach(() => { h?.cleanup(); h = null; });

  it('打开时显示默认值', async () => {
    h = await mount();
    expect(h.input().value).toBe('季度汇报图表');
  });

  it('open=false 不渲染', async () => {
    h = await mount({ open: false });
    expect(h.host.querySelector('input')).toBeNull();
  });

  it('提交时 trim 后回传', async () => {
    h = await mount();
    const input = h.input();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, '  新名字  ');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      h!.host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(h.onSubmit).toHaveBeenCalledWith('新名字');
  });

  it('validate 返回错误时阻断提交并显示错误', async () => {
    h = await mount({ validate: (value) => (value.includes('/') ? '含非法字符' : null) });
    const input = h.input();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'a/b');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      h!.host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(h.onSubmit).not.toHaveBeenCalled();
    expect(h.host.querySelector('p')?.textContent).toBe('含非法字符');
  });

  it('Esc 触发取消', async () => {
    h = await mount();
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(h.onCancel).toHaveBeenCalled();
  });
});
