// @vitest-environment jsdom
// 打字机模式回归:selection 变化时把光标行滚到视口约 40% 处;
// 偏差小于阈值不滚动;用户 wheel 主动滚动后的抑制窗口内不抢滚动;
// 鼠标拖选(非空选区)不干预。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { typewriterExtension } from './typewriterExtension';

function createView(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [typewriterExtension()],
    }),
    parent,
  });
  // jsdom 无布局:固定 scroller 尺寸与坐标测量。
  Object.defineProperty(view.scrollDOM, 'clientHeight', { value: 400, configurable: true });
  vi.spyOn(view.scrollDOM, 'getBoundingClientRect').mockReturnValue({
    top: 0, left: 0, right: 800, bottom: 400, width: 800, height: 400, x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect);
  return view;
}

function mockCursorCoords(view: EditorView, top: number): void {
  vi.spyOn(view, 'coordsAtPos').mockReturnValue({ left: 0, right: 10, top, bottom: top + 20 } as ReturnType<EditorView['coordsAtPos']>);
}

let view: EditorView | null = null;

afterEach(() => {
  if (view && !view.destroyed) {
    const parent = view.dom.parentElement;
    view.destroy();
    parent?.remove();
  }
  view = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('typewriterExtension', () => {
  it('selection 变化(空选区)时把光标行滚动到视口 40% 处', () => {
    view = createView('line1\nline2\nline3');
    mockCursorCoords(view, 500);
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    // 目标 = 500 - 400 * 0.4 = 340
    expect(view.scrollDOM.scrollTop).toBe(340);
  });

  it('偏差小于阈值时不滚动,避免抖动', () => {
    view = createView('line1\nline2\nline3');
    mockCursorCoords(view, 100);
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    // 目标 = 100 - 160 = -60 → clamp 0,与当前 scrollTop 0 偏差 0 → 不滚动
    expect(view.scrollDOM.scrollTop).toBe(0);
  });

  it('用户 wheel 主动滚动后的抑制窗口内不干预', () => {
    view = createView('line1\nline2\nline3');
    mockCursorCoords(view, 500);
    view.scrollDOM.dispatchEvent(new WheelEvent('wheel'));
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    expect(view.scrollDOM.scrollTop).toBe(0);
  });

  it('鼠标拖选进行中(非空选区)不干预', () => {
    view = createView('line1\nline2\nline3');
    mockCursorCoords(view, 500);
    view.dispatch({ selection: { anchor: 0, head: 6 } });
    expect(view.scrollDOM.scrollTop).toBe(0);
  });

  it('打字(docChanged)时同样跟随滚动', () => {
    view = createView('line1\nline2\nline3');
    mockCursorCoords(view, 500);
    view.dispatch({ changes: { from: 0, insert: 'x' }, selection: { anchor: 1 } });
    expect(view.scrollDOM.scrollTop).toBe(340);
  });
});
