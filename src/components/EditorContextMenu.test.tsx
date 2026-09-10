// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorContextMenu, TableContextMenu } from './EditorContextMenu';

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
    for (const expected of ['编辑链接', '升级引用', '降级引用', '清除格式', '编辑语言', '插入表格', '公式块']) {
      expect(labelTexts.has(expected)).toBe(true);
    }
  });

  it('click 公式块 → onPick({type:"math-block"})', () => {
    const onPick = vi.fn();
    act(() => {
      root.render(
        <EditorContextMenu
          open
          x={0}
          y={0}
          hasSelection={false}
          onPick={onPick}
          onClose={() => {}}
        />,
      );
    });
    const insert = Array.from(host.querySelectorAll('.editor-ctx-item'))
      .find((button) => (button.firstChild as HTMLElement)?.textContent === '公式块') as HTMLButtonElement;
    expect(insert).toBeTruthy();
    act(() => { insert.click(); });
    expect(onPick).toHaveBeenCalledWith({ type: 'math-block' });
  });

  it('click 插入表格 → onPick default 2×3 table action', () => {
    const onPick = vi.fn();
    act(() => {
      root.render(
        <EditorContextMenu
          open
          x={0}
          y={0}
          hasSelection={false}
          onPick={onPick}
          onClose={() => {}}
        />,
      );
    });
    const insert = Array.from(host.querySelectorAll('.editor-ctx-item'))
      .find((button) => (button.firstChild as HTMLElement)?.textContent === '插入表格') as HTMLButtonElement;
    expect(insert).toBeTruthy();
    act(() => { insert.click(); });
    expect(onPick).toHaveBeenCalledWith({ type: 'table-insert', rows: 2, cols: 3 });
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
describe('TableContextMenu', () => {
  it('shows only table actions and exposes complete table deletion', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const onPick = vi.fn();
    act(() => {
      root.render(<TableContextMenu open x={0} y={0} onPick={onPick} onClose={() => {}} />);
    });

    const labels = Array.from(host.querySelectorAll('.editor-ctx-item'))
      .map((item) => item.textContent?.trim());
    expect(labels).toContain('在上方插入行');
    expect(labels).toContain('删除列');
    expect(labels).toContain('删除表格');
    expect(labels).not.toContain('加粗');

    const deleteTable = Array.from(host.querySelectorAll<HTMLButtonElement>('.editor-ctx-item'))
      .find((item) => item.textContent?.trim() === '删除表格');
    act(() => deleteTable?.click());
    expect(onPick).toHaveBeenCalledWith('table-delete');
    act(() => root.unmount());
    host.remove();
  });
});

describe('EditorContextMenu quick format actions', () => {
  it('exposes common formatting commands and dispatches them directly', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const onPick = vi.fn();
    act(() => {
      root.render(<EditorContextMenu open x={0} y={0} hasSelection onPick={onPick} onClose={() => {}} />);
    });

    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>('.editor-ctx-quick-format-button'));
    expect(buttons).toHaveLength(8);
    expect(buttons.map((button) => button.textContent)).toEqual(['B', 'I', '</>', '↗', '❝', '1.', '•', '☑']);
    act(() => { buttons[0].click(); });
    expect(onPick).toHaveBeenCalledWith({ type: 'bold' });
    act(() => root.unmount());
    host.remove();
  });
});

describe('EditorContextMenu mermaid 复制为 SVG', () => {
  const setup = (props: { hasMermaidSvg?: boolean }) => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const onPick = vi.fn();
    const onCopyMermaidSvg = vi.fn();
    const onClose = vi.fn();
    act(() => {
      root.render(
        <EditorContextMenu
          open
          x={0}
          y={0}
          hasSelection={false}
          hasMermaidSvg={props.hasMermaidSvg}
          onPick={onPick}
          onCopyMermaidSvg={onCopyMermaidSvg}
          onClose={onClose}
        />,
      );
    });
    const findItem = () => Array.from(host.querySelectorAll('.editor-ctx-item'))
      .find((b) => (b.firstChild as HTMLElement)?.textContent === '复制为 SVG') as HTMLButtonElement | undefined;
    return { host, root, onPick, onCopyMermaidSvg, onClose, findItem };
  };

  it('默认不显示"复制为 SVG"', () => {
    const { host, root, findItem } = setup({});
    expect(findItem()).toBeUndefined();
    act(() => root.unmount());
    host.remove();
  });

  it('hasMermaidSvg 时显示"复制为 SVG",点击回调 onCopyMermaidSvg 并关闭菜单', () => {
    const { host, root, onCopyMermaidSvg, onClose, findItem } = setup({ hasMermaidSvg: true });
    const item = findItem();
    expect(item).toBeTruthy();
    act(() => { item!.click(); });
    expect(onCopyMermaidSvg).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    host.remove();
  });
});

describe('EditorContextMenu 段落子菜单(Typora 对齐项)', () => {
  it('渲染提升/降低标题等级、引用、无序列表、有序列表并分发动作', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const onPick = vi.fn();
    act(() => {
      root.render(<EditorContextMenu open x={0} y={0} hasSelection={false} onPick={onPick} onClose={() => {}} />);
    });

    const findItem = (label: string) => Array.from(host.querySelectorAll('.editor-ctx-item'))
      .find((b) => (b.firstChild as HTMLElement)?.textContent === label) as HTMLButtonElement | undefined;
    for (const label of ['提升标题等级', '降低标题等级', '引用', '无序列表', '有序列表']) {
      expect(findItem(label)).toBeTruthy();
    }
    act(() => { findItem('提升标题等级')!.click(); });
    expect(onPick).toHaveBeenCalledWith({ type: 'heading-up' });
    act(() => { findItem('降低标题等级')!.click(); });
    expect(onPick).toHaveBeenCalledWith({ type: 'heading-down' });
    act(() => { findItem('引用')!.click(); });
    expect(onPick).toHaveBeenCalledWith({ type: 'quote' });
    act(() => { findItem('无序列表')!.click(); });
    expect(onPick).toHaveBeenCalledWith({ type: 'ul' });
    act(() => { findItem('有序列表')!.click(); });
    expect(onPick).toHaveBeenCalledWith({ type: 'ol' });
    act(() => root.unmount());
    host.remove();
  });
});

describe('EditorContextMenu 剪贴板命令', () => {
  const setup = (hasSelection: boolean) => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const onPick = vi.fn();
    act(() => {
      root.render(<EditorContextMenu open x={0} y={0} hasSelection={hasSelection} onPick={onPick} onClose={() => {}} />);
    });
    const findItem = (label: string) => Array.from(host.querySelectorAll('.editor-ctx-item'))
      .find((b) => (b.firstChild as HTMLElement)?.textContent === label) as HTMLButtonElement;
    return { host, root, onPick, findItem };
  };

  it('无选区时剪切/复制禁用,粘贴/全选可用', () => {
    const { host, root, findItem } = setup(false);
    expect(findItem('剪切').disabled).toBe(true);
    expect(findItem('复制').disabled).toBe(true);
    expect(findItem('粘贴').disabled).toBe(false);
    expect(findItem('全选').disabled).toBe(false);
    act(() => root.unmount());
    host.remove();
  });

  it('有选区时点击分发 cut/copy/paste/select-all', () => {
    const { host, root, onPick, findItem } = setup(true);
    expect(findItem('剪切').disabled).toBe(false);
    expect(findItem('复制').disabled).toBe(false);
    act(() => { findItem('剪切').click(); });
    expect(onPick).toHaveBeenCalledWith({ type: 'cut' });
    act(() => { findItem('复制').click(); });
    expect(onPick).toHaveBeenCalledWith({ type: 'copy' });
    act(() => { findItem('粘贴').click(); });
    expect(onPick).toHaveBeenCalledWith({ type: 'paste' });
    act(() => { findItem('全选').click(); });
    expect(onPick).toHaveBeenCalledWith({ type: 'select-all' });
    act(() => root.unmount());
    host.remove();
  });
});