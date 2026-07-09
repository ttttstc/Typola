// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorContextMenu } from './EditorContextMenu';
import { translate, type I18nKey } from '../services/i18n';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function t(key: I18nKey): string {
  return translate('zh-CN', key);
}

describe('EditorContextMenu new actions (quote-up/down, link-edit, clear-format, codeblock-lang)', () => {
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

  it('renders all new menu items', () => {
    act(() => {
      root.render(
        <EditorContextMenu
          open
          x={0}
          y={0}
          hasSelection
          onPick={() => {}}
          onClose={() => {}}
        />,
      );
    });
    const items = host.querySelectorAll('.editor-ctx-item');
    const labelTexts = new Set(Array.from(items).map((b: Element) => (b.firstChild as HTMLElement)?.textContent ?? ''));
    for (const expected of ['编辑链接', '升级引用', '降级引用', '清除格式', '编辑语言']) {
      expect(labelTexts.has(expected)).toBe(true);
    }
  });

  it('click 升级引用 → onPick({type:"quote-up"})', () => {
    const onPick = vi.fn();
    act(() => {
      root.render(
        <EditorContextMenu
          open
          x={0}
          y={0}
          hasSelection
          onPick={onPick}
          onClose={() => {}}
        />,
      );
    });
    const label = Array.from(host.querySelectorAll('.editor-ctx-item'))
      .find((b) => (b.firstChild as HTMLElement)?.textContent === '升级引用') as HTMLButtonElement;
    expect(label).toBeTruthy();
    act(() => { label.click(); });
    expect(onPick).toHaveBeenCalledWith({ type: 'quote-up' });
  });

  it('click 编辑链接 → onPick({type:"link-edit"})', () => {
    const onPick = vi.fn();
    act(() => {
      root.render(
        <EditorContextMenu
          open
          x={0}
          y={0}
          hasSelection
          onPick={onPick}
          onClose={() => {}}
        />,
      );
    });
    const label = Array.from(host.querySelectorAll('.editor-ctx-item'))
      .find((b) => (b.firstChild as HTMLElement)?.textContent === '编辑链接') as HTMLButtonElement;
    expect(label).toBeTruthy();
    act(() => { label.click(); });
    expect(onPick).toHaveBeenCalledWith({ type: 'link-edit' });
  });

  it('click 清除格式 → onPick({type:"clear-format"})', () => {
    const onPick = vi.fn();
    act(() => {
      root.render(
        <EditorContextMenu
          open
          x={0}
          y={0}
          hasSelection
          onPick={onPick}
          onClose={() => {}}
        />,
      );
    });
    const label = Array.from(host.querySelectorAll('.editor-ctx-item'))
      .find((b) => (b.firstChild as HTMLElement)?.textContent === '清除格式') as HTMLButtonElement;
    expect(label).toBeTruthy();
    act(() => { label.click(); });
    expect(onPick).toHaveBeenCalledWith({ type: 'clear-format' });
  });

  it('renders heading row with header buttons unchanged', () => {
    act(() => {
      root.render(
        <EditorContextMenu
          open
          x={0}
          y={0}
          hasSelection
          onPick={() => {}}
          onClose={() => {}}
        />,
      );
    });
    const headingBtns = host.querySelectorAll('.editor-ctx-heading-row button');
    expect(headingBtns).toHaveLength(7);
  });
});
