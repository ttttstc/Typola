// @vitest-environment jsdom
import { act, createRef, useState } from 'react';
import type { RefObject } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

async function mountEditor(source: string): Promise<RefObject<TypolaEditorKernel | null>> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const ref = createRef<TypolaEditorKernel>();
  function Harness() {
    const [value, setValue] = useState(source);
    return <EditorPane ref={ref} source={value} onChange={setValue} filePath="/tmp/test.md" />;
  }
  await act(async () => { root!.render(<Harness />); });
  expect(ref.current).not.toBeNull();
  return ref;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
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
