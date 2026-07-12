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

describe('EditorPane.revealRange', () => {
  it('clamps stale anchor to current document bounds (issue #180 review)', async () => {
    // 模拟检视意见 anchor 来自更早版本的文档,当前文档已被缩短,from/to 越界。
    // 期望 revealRange 不抛 RangeError,并把范围夹回 [0, docLen]。
    const ref = await mountEditor('short');
    const docLen = ref.current!.getMarkdown().length;

    expect(() => {
      act(() => {
        ref.current!.revealRange(50, 200, { preserveFocus: true });
      });
    }).not.toThrow();

    // 文档本身不应被 revealRange 修改。
    expect(ref.current!.getMarkdown()).toBe('short');
    expect(docLen).toBe(5);
  });

  it('clamps negative from to 0', async () => {
    const ref = await mountEditor('short');

    expect(() => {
      act(() => {
        ref.current!.revealRange(-10, 3, { preserveFocus: true });
      });
    }).not.toThrow();
    expect(ref.current!.getMarkdown()).toBe('short');
  });

  it('keeps valid range unchanged', async () => {
    const ref = await mountEditor('hello world');

    expect(() => {
      act(() => {
        ref.current!.revealRange(0, 5, { preserveFocus: true });
      });
    }).not.toThrow();
    expect(ref.current!.getMarkdown()).toBe('hello world');
  });
});
