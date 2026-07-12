// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorContextMenu } from './EditorContextMenu';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

describe('EditorContextMenu image actions (insert / replace / open / copy-path)', () => {
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

  const clickLabel = (label: string): HTMLButtonElement => {
    const target = Array.from(host.querySelectorAll('.editor-ctx-item'))
      .find((b) => (b.firstChild as HTMLElement)?.textContent === label) as HTMLButtonElement;
    expect(target).toBeTruthy();
    return target;
  };

  it('插入图片 always shown when menu opens', () => {
    act(() => {
      root.render(
        <EditorContextMenu open x={0} y={0} hasSelection={false} onPick={() => {}} onClose={() => {}} />,
      );
    });
    expect(clickLabel('插入图片')).toBeTruthy();
  });

  it('替换/打开文件/复制路径 only shown when hasImage', () => {
    act(() => {
      root.render(
        <EditorContextMenu
          open
          x={0}
          y={0}
          hasSelection={false}
          hasImage={false}
          onPick={() => {}}
          onClose={() => {}}
        />,
      );
    });
    for (const label of ['替换图片', '打开文件', '复制路径']) {
      const found = Array.from(host.querySelectorAll('.editor-ctx-item'))
        .find((b) => (b.firstChild as HTMLElement)?.textContent === label);
      expect(found).toBeUndefined();
    }

    act(() => root.unmount());
    host.innerHTML = '';
    root = createRoot(host);
    act(() => {
      root.render(
        <EditorContextMenu
          open
          x={0}
          y={0}
          hasSelection={false}
          hasImage
          onPick={() => {}}
          onClose={() => {}}
        />,
      );
    });
    expect(clickLabel('替换图片')).toBeTruthy();
    expect(clickLabel('打开文件')).toBeTruthy();
    expect(clickLabel('复制路径')).toBeTruthy();
  });

  it('click 插入图片 → onPick({type:"image-insert"})', () => {
    const onPick = vi.fn();
    act(() => {
      root.render(
        <EditorContextMenu open x={0} y={0} hasSelection={false} onPick={onPick} onClose={() => {}} />,
      );
    });
    act(() => { clickLabel('插入图片').click(); });
    expect(onPick).toHaveBeenCalledWith({ type: 'image-insert' });
  });

  it('click 替换图片 → onPick({type:"image-replace"})', () => {
    const onPick = vi.fn();
    act(() => {
      root.render(
        <EditorContextMenu open x={0} y={0} hasSelection={false} hasImage onPick={onPick} onClose={() => {}} />,
      );
    });
    act(() => { clickLabel('替换图片').click(); });
    expect(onPick).toHaveBeenCalledWith({ type: 'image-replace' });
  });

  it('click 打开文件 → onPick({type:"image-open"})', () => {
    const onPick = vi.fn();
    act(() => {
      root.render(
        <EditorContextMenu open x={0} y={0} hasSelection={false} hasImage onPick={onPick} onClose={() => {}} />,
      );
    });
    act(() => { clickLabel('打开文件').click(); });
    expect(onPick).toHaveBeenCalledWith({ type: 'image-open' });
  });

  it('click 复制路径 → onPick({type:"image-copy-path"})', () => {
    const onPick = vi.fn();
    act(() => {
      root.render(
        <EditorContextMenu open x={0} y={0} hasSelection={false} hasImage onPick={onPick} onClose={() => {}} />,
      );
    });
    act(() => { clickLabel('复制路径').click(); });
    expect(onPick).toHaveBeenCalledWith({ type: 'image-copy-path' });
  });
});
