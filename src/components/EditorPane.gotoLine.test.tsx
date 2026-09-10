// @vitest-environment jsdom
// kernel gotoLine 回归:行号 clamp 到 [1, 行数]、可选列号 1-based 且
// 超出行长停到行尾、跳转后选区落在目标位置。
import { act, createRef } from 'react';
import type { RefObject } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TypolaEditorKernel } from '../types/editorCore';
import { EditorPane } from './EditorPane';

const mockSettings = {
  editorFontFamily: 'System Default',
  editorFontSize: 14,
  editorTabSize: 4,
  editorWordWrap: true,
  editorLineNumbers: true,
  editorSpellCheck: false,
  editorFormatPainterEnabled: true,
  selectionFloatingBarEnabled: false,
};

vi.mock('../hooks/useSettings', () => ({
  useSettings: () => mockSettings,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(Range.prototype, 'getClientRects', { value: () => [] });

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function mountEditor(source: string): Promise<{
  kernel: RefObject<TypolaEditorKernel | null>;
  view: EditorView;
}> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const kernelRef = createRef<TypolaEditorKernel>();
  let view: EditorView | null = null;
  function Harness() {
    return (
      <EditorPane
        ref={kernelRef}
        source={source}
        onChange={() => {}}
        onEditorReady={(created) => { view = created; }}
      />
    );
  }
  await act(async () => { root!.render(<Harness />); });
  expect(kernelRef.current).not.toBeNull();
  expect(view).not.toBeNull();
  return { kernel: kernelRef, view: view! };
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  document.body.replaceChildren();
});

describe('TypolaEditorKernel.gotoLine', () => {
  it('跳转到指定行(选区落在行首)', async () => {
    const { kernel, view } = await mountEditor('alpha\nbeta\ngamma');
    expect(kernel.current!.gotoLine(2)).toBe(true);
    expect(view.state.selection.main.head).toBe(view.state.doc.line(2).from);
  });

  it('行号越界 clamp:0 → 第 1 行,超大 → 最后一行', async () => {
    const { kernel, view } = await mountEditor('alpha\nbeta\ngamma');
    kernel.current!.gotoLine(0);
    expect(view.state.selection.main.head).toBe(view.state.doc.line(1).from);
    kernel.current!.gotoLine(999);
    expect(view.state.selection.main.head).toBe(view.state.doc.line(3).from);
  });

  it('支持 1-based 列号,超出行长停到行尾', async () => {
    const { kernel, view } = await mountEditor('hello\nworld');
    kernel.current!.gotoLine(2, 3);
    expect(view.state.selection.main.head).toBe(view.state.doc.line(2).from + 2);
    kernel.current!.gotoLine(1, 999);
    expect(view.state.selection.main.head).toBe(view.state.doc.line(1).to);
  });
});
