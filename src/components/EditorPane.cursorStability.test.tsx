// @vitest-environment jsdom
// 光标稳定性回归：复现「编辑文字/代码块内编辑时光标乱飞」的三个机制 ——
// 1) 受控打字回流不应触发 StateEffect.reconfigure（每次 reconfigure 都会全量重建
//    ViewPlugin/widget DOM，真实浏览器中表现为 IME 组合输入被打断、代码块/公式
//    widget 闪跳、光标视觉乱飞）；
// 2) 外部整篇替换（AI 候选稿/agent 写盘重载）时光标应按 ChangeSet 映射保留；
// 3) 切换文档后再切回，光标应恢复为该文档上次的状态。
import { act, createRef, useState } from 'react';
import type { RefObject } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { StateEffect } from '@codemirror/state';
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

type HarnessHandle = {
  value: string;
  filePath: string;
  setValue: (next: string) => void;
  setFilePath: (next: string) => void;
  view: EditorView | null;
  reconfigureCount: () => number;
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;

/** 挂载受控 EditorPane（模拟 AppLayout 的 value 回流），并劫持 view.dispatch 统计 reconfigure。 */
async function mountControlled(initial: string, initialPath = '/tmp/a.md'): Promise<{ kernel: RefObject<TypolaEditorKernel | null>; handle: HarnessHandle }> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const kernelRef = createRef<TypolaEditorKernel>();
  const handle: HarnessHandle = {
    value: initial,
    filePath: initialPath,
    setValue: () => {},
    setFilePath: () => {},
    view: null,
    reconfigureCount: () => 0,
  };
  let reconfigureCount = 0;

  function Harness() {
    const [value, setValue] = useState(initial);
    const [filePath, setFilePath] = useState(initialPath);
    handle.value = value;
    handle.filePath = filePath;
    handle.setValue = setValue;
    handle.setFilePath = setFilePath;
    return (
      <EditorPane
        ref={kernelRef}
        source={value}
        onChange={setValue}
        filePath={filePath}
        onEditorReady={(view) => {
          if (handle.view) return;
          handle.view = view;
          handle.reconfigureCount = () => reconfigureCount;
          const originalDispatch = view.dispatch.bind(view);
          view.dispatch = (tr) => {
            const effects = tr.effects == null ? [] : Array.isArray(tr.effects) ? tr.effects : [tr.effects];
            if (effects.some((effect) => effect.is(StateEffect.reconfigure))) reconfigureCount += 1;
            originalDispatch(tr);
          };
        }}
      />
    );
  }
  await act(async () => { root!.render(<Harness />); });
  expect(kernelRef.current).not.toBeNull();
  expect(handle.view).not.toBeNull();
  return { kernel: kernelRef, handle };
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  document.body.replaceChildren();
});

describe('EditorPane 光标稳定性', () => {
  it('受控打字回流不触发 reconfigure（不打断 IME/widget）', async () => {
    const { handle } = await mountControlled('hello world');
    const view = handle.view!;
    const baseline = handle.reconfigureCount();

    // 模拟用户在 pos 5 打一个字：CM6 dispatch → onChange → 受控 setState 回流
    act(() => {
      view.dispatch({ changes: { from: 5, to: 5, insert: 'X' }, selection: { anchor: 6 } });
    });
    await act(async () => { await Promise.resolve(); });
    expect(handle.value).toBe('helloX world');
    expect(handle.reconfigureCount()).toBe(baseline);

    // 连续再打两字，仍然不应 reconfigure
    act(() => {
      view.dispatch({ changes: { from: 6, to: 6, insert: 'Y' }, selection: { anchor: 7 } });
    });
    await act(async () => { await Promise.resolve(); });
    act(() => {
      view.dispatch({ changes: { from: 7, to: 7, insert: 'Z' }, selection: { anchor: 8 } });
    });
    await act(async () => { await Promise.resolve(); });
    expect(handle.value).toBe('helloXYZ world');
    expect(handle.reconfigureCount()).toBe(baseline);
  });

  it('代码块内打字选区稳定且不触发 reconfigure', async () => {
    const doc = '前文\n```js\nconst a = 1;\n```\n后文';
    const { handle } = await mountControlled(doc);
    const view = handle.view!;
    const baseline = handle.reconfigureCount();

    // 光标放到代码块内容行（"const a = 1;" 的 c 前）
    const blockStart = doc.indexOf('const');
    act(() => {
      view.dispatch({ selection: { anchor: blockStart } });
    });
    await act(async () => { await Promise.resolve(); });

    // 在代码块内连续打字（走完整受控回路）
    for (const char of ['v', 'a', 'r']) {
      const pos = view.state.selection.main.head;
      act(() => {
        view.dispatch({ changes: { from: pos, to: pos, insert: char }, selection: { anchor: pos + 1 } });
      });
      await act(async () => { await Promise.resolve(); });
    }

    expect(view.state.doc.toString()).toContain('varconst a = 1;');
    // 选区应紧跟刚输入的文本之后（没有飞走）
    expect(view.state.selection.main.head).toBe(blockStart + 3);
    expect(handle.reconfigureCount()).toBe(baseline);
  });

  it('外部整篇替换时光标按内容映射保留（AI/agent 回写）', async () => {
    const { handle } = await mountControlled('aaaa\nbbbb\ncccc');
    const view = handle.view!;

    // 光标放在 bbbb 的 b 前（第二行行首）
    const bPos = 'aaaa\n'.length;
    act(() => {
      view.dispatch({ selection: { anchor: bPos } });
    });
    await act(async () => { await Promise.resolve(); });

    // 外部整篇替换：头部插入两行新内容
    await act(async () => {
      handle.setValue('NEW1\nNEW2\naaaa\nbbbb\ncccc');
    });

    // 光标应被映射到 bbbb 前（原 pos + 插入长度 10），而不是飞到文档开头
    expect(view.state.doc.toString()).toBe('NEW1\nNEW2\naaaa\nbbbb\ncccc');
    expect(view.state.selection.main.head).toBe('NEW1\nNEW2\n'.length + 'aaaa\n'.length);
  });

  it('切换文档后切回，恢复该文档的选区位置', async () => {
    const docA = 'alpha\nbeta\ngamma';
    const docB = 'one\ntwo';
    const { handle } = await mountControlled(docA, '/tmp/a.md');
    const view = handle.view!;

    // 文档 A：光标放到 beta 前
    const betaPos = 'alpha\n'.length;
    act(() => {
      view.dispatch({ selection: { anchor: betaPos } });
    });
    await act(async () => { await Promise.resolve(); });

    // 切到文档 B
    await act(async () => {
      handle.setFilePath('/tmp/b.md');
      handle.setValue(docB);
    });
    expect(view.state.doc.toString()).toBe(docB);

    // 切回文档 A：光标应恢复到 beta 前
    await act(async () => {
      handle.setFilePath('/tmp/a.md');
      handle.setValue(docA);
    });
    expect(view.state.doc.toString()).toBe(docA);
    expect(view.state.selection.main.head).toBe(betaPos);
  });
});
