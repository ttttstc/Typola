// @vitest-environment jsdom
import { act, createRef, useState } from 'react';
import type { RefObject } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EditorView } from '@codemirror/view';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { TypolaEditorKernel } from '../types/editorCore';
import { EditorPane } from './EditorPane';

vi.mock('../hooks/useSettings', () => ({
  useSettings: () => ({
    editorFontFamily: 'System Default',
    editorFontSize: 14,
    editorTabSize: 4,
    editorWordWrap: true,
    editorLineNumbers: true,
    editorSpellCheck: false,
    editorFormatPainterEnabled: true,
    selectionFloatingBarEnabled: false,
  }),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(Range.prototype, 'getClientRects', { value: () => [] });

let root: Root | null = null;
let host: HTMLDivElement | null = null;

// jsdom 没有真实布局,posAtCoords 恒返回 null —— 按需映射坐标驱动右键落点逻辑。
let posAtCoordsMock: (coords: { x: number; y: number }) => number | null = () => null;
beforeAll(() => {
  vi.spyOn(EditorView.prototype, 'posAtCoords').mockImplementation(
    (coords: { x: number; y: number }) => posAtCoordsMock(coords),
  );
});

type MountOptions = {
  onEditorReady?: (view: EditorView) => void;
};

async function mountEditor(source: string, options: MountOptions = {}): Promise<RefObject<TypolaEditorKernel | null>> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const ref = createRef<TypolaEditorKernel>();
  function Harness() {
    const [value, setValue] = useState(source);
    return <EditorPane ref={ref} source={value} onChange={setValue} filePath="/tmp/test.md" onEditorReady={options.onEditorReady} />;
  }
  await act(async () => { root!.render(<Harness />); });
  expect(ref.current).not.toBeNull();
  return ref;
}

function findMenuItem(label: string): HTMLButtonElement {
  const item = Array.from(host!.querySelectorAll('.editor-ctx-item'))
    .find((b) => (b.firstChild as HTMLElement)?.textContent === label) as HTMLButtonElement | undefined;
  expect(item).toBeTruthy();
  return item!;
}

function fireContextMenu(target: Element, x = 100, y = 100): void {
  act(() => {
    target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
  });
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  posAtCoordsMock = () => null;
  document.body.replaceChildren();
});

describe('EditorPane.replaceRanges', () => {
  it('applies disjoint changes in one transaction', async () => {
    const ref = await mountEditor('alpha beta');

    let replaced = false;
    act(() => { replaced = ref.current!.replaceRanges([
      { from: 0, to: 5, insert: 'one' },
      { from: 6, to: 10, insert: 'two' },
    ]); });
    expect(replaced).toBe(true);
    expect(ref.current!.getMarkdown()).toBe('one two');
  });

  it('rejects overlapping changes without mutating the document', async () => {
    const ref = await mountEditor('alpha beta');

    let replaced = true;
    act(() => { replaced = ref.current!.replaceRanges([
      { from: 0, to: 5, insert: 'one' },
      { from: 3, to: 7, insert: 'two' },
    ]); });
    expect(replaced).toBe(false);
    expect(ref.current!.getMarkdown()).toBe('alpha beta');
  });

  it('clamps out-of-range changes to document bounds', async () => {
    const ref = await mountEditor('alpha');

    let replaced = false;
    act(() => { replaced = ref.current!.replaceRanges([{ from: -4, to: 99, insert: 'all' }]); });
    expect(replaced).toBe(true);
    expect(ref.current!.getMarkdown()).toBe('all');
  });

  it('rejects an empty change list', async () => {
    const ref = await mountEditor('alpha');

    expect(ref.current!.replaceRanges([])).toBe(false);
    expect(ref.current!.getMarkdown()).toBe('alpha');
  });
});

describe('EditorPane 行号右键', () => {
  it('在行号沟槽右键打开统一菜单并提供关闭入口', async () => {
    await mountEditor('第一行\n第二行');
    const gutter = host!.querySelector<HTMLElement>('.cm-gutters');
    expect(gutter).not.toBeNull();

    await act(async () => {
      gutter!.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 12,
        clientY: 24,
      }));
    });

    expect(host!.querySelector('.editor-ctx-menu')).not.toBeNull();
    expect(host!.textContent).toContain('隐藏行号');
  });
});

describe('EditorPane 右键落点(P0-A/P0-D)', () => {
  it('右键落点在选区外时光标移到落点,段落命令作用于右键所在行', async () => {
    const ref = await mountEditor('第一段\n第二段');
    const content = host!.querySelector<HTMLElement>('.cm-content')!;
    // 初始光标在文档开头(0),右键落点映射到"第二段"行内(pos=4)。
    posAtCoordsMock = () => 4;
    fireContextMenu(content);

    expect(host!.querySelector('.editor-ctx-menu')).not.toBeNull();
    const h2 = host!.querySelector<HTMLButtonElement>('.editor-ctx-heading-row button[title="二级标题 (Ctrl+2)"]');
    expect(h2).toBeTruthy();
    await act(async () => { h2!.click(); });
    expect(ref.current!.getMarkdown()).toBe('第一段\n## 第二段');
  });

  it('右键落点在已有选区内时保留选区,剪切/复制仍可用', async () => {
    let view: EditorView | null = null;
    await mountEditor('hello world', { onEditorReady: (v) => { view = v; } });
    const content = host!.querySelector<HTMLElement>('.cm-content')!;
    act(() => { view!.dispatch({ selection: { anchor: 0, head: 5 } }); });
    posAtCoordsMock = () => 3;
    fireContextMenu(content);

    expect(host!.querySelector('.editor-ctx-menu')).not.toBeNull();
    expect(view!.state.selection.main.from).toBe(0);
    expect(view!.state.selection.main.to).toBe(5);
    expect(findMenuItem('剪切').disabled).toBe(false);
    expect(findMenuItem('复制').disabled).toBe(false);
  });

  it('右键 mermaid widget(含 svg)时提供"复制为 SVG"并把 svg 源码写入剪贴板', async () => {
    await mountEditor('graph');
    const content = host!.querySelector<HTMLElement>('.cm-content')!;
    // jsdom 不跑真实 mermaid 渲染,手动塞一个带 svg 的 widget 结构。
    const widget = document.createElement('div');
    widget.className = 'typola-cm6-mermaid';
    widget.innerHTML = '<svg><g/></svg>';
    content.append(widget);
    posAtCoordsMock = () => 0;

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    fireContextMenu(widget);

    const copyItem = findMenuItem('复制为 SVG');
    await act(async () => { copyItem.click(); });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(String(writeText.mock.calls[0]?.[0])).toContain('<svg');
  });

  it('右键非 mermaid 区域不显示"复制为 SVG"', async () => {
    await mountEditor('正文');
    const content = host!.querySelector<HTMLElement>('.cm-content')!;
    posAtCoordsMock = () => 0;
    fireContextMenu(content);
    const found = Array.from(host!.querySelectorAll('.editor-ctx-item'))
      .find((b) => (b.firstChild as HTMLElement)?.textContent === '复制为 SVG');
    expect(found).toBeUndefined();
  });
});

describe('EditorPane 菜单"粘贴"智能链路(P1-F)', () => {
  afterEach(() => {
    delete (navigator as { clipboard?: unknown }).clipboard;
  });

  it('TSV 剪贴板内容经菜单"粘贴"转换为 Markdown 表格', async () => {
    const ref = await mountEditor('正文');
    const content = host!.querySelector<HTMLElement>('.cm-content')!;
    posAtCoordsMock = () => 0;
    const read = vi.fn().mockResolvedValue([{
      types: ['text/plain'],
      getType: (type: string) => Promise.resolve(new Blob(['A\tB\n1\t2'], { type })),
    }]);
    Object.defineProperty(navigator, 'clipboard', { value: { read }, configurable: true });

    fireContextMenu(content);
    await act(async () => { findMenuItem('粘贴').click(); });
    await vi.waitFor(() => {
      expect(ref.current!.getMarkdown()).toContain('| A | B |');
    });
  });

  it('结构化 HTML 经菜单"粘贴"转换为 Markdown(加粗保留)', async () => {
    const ref = await mountEditor('正文');
    const content = host!.querySelector<HTMLElement>('.cm-content')!;
    posAtCoordsMock = () => 0;
    const read = vi.fn().mockResolvedValue([{
      types: ['text/html', 'text/plain'],
      getType: (type: string) => Promise.resolve(
        new Blob([type === 'text/html' ? '<p>hello <strong>world</strong></p>' : 'hello world'], { type }),
      ),
    }]);
    Object.defineProperty(navigator, 'clipboard', { value: { read }, configurable: true });

    fireContextMenu(content);
    await act(async () => { findMenuItem('粘贴').click(); });
    await vi.waitFor(() => {
      expect(ref.current!.getMarkdown()).toContain('hello **world**');
    });
  });

  it('clipboard.read 不可用时回退 readText 纯文本插入', async () => {
    const ref = await mountEditor('正文');
    const content = host!.querySelector<HTMLElement>('.cm-content')!;
    posAtCoordsMock = () => 0;
    const readText = vi.fn().mockResolvedValue('纯文本内容');
    Object.defineProperty(navigator, 'clipboard', { value: { readText }, configurable: true });

    fireContextMenu(content);
    await act(async () => { findMenuItem('粘贴').click(); });
    await vi.waitFor(() => {
      expect(ref.current!.getMarkdown()).toContain('纯文本内容');
    });
  });
});
