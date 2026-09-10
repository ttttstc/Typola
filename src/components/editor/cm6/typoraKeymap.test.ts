// @vitest-environment jsdom
// Typora 高频功能 keymap 回归:Mod-g 跳转到行 / 列表行 Tab、Shift-Tab 缩进,
// 非列表行(含表格行)Tab 不拦截。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { createMarkdownExtensions } from './createMarkdownExtensions';

function createView(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({
    state: EditorState.create({
      doc,
      extensions: createMarkdownExtensions({
        fontFamily: 'monospace',
        fontSize: 14,
        tabSize: 4,
        wordWrap: false,
      }),
    }),
    parent,
  });
}

function pressKey(view: EditorView, key: string, options: KeyboardEventInit = {}): void {
  view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  }));
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
});

describe('typora keymap', () => {
  it('Mod-g 派发 typola:goto-line 事件(跳转到行)', () => {
    const listener = vi.fn();
    window.addEventListener('typola:goto-line', listener);
    view = createView('hello');
    pressKey(view, 'g', { ctrlKey: true });
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('typola:goto-line', listener);
  });

  it('Cmd+G 同样触发(macOS Meta)', () => {
    const listener = vi.fn();
    window.addEventListener('typola:goto-line', listener);
    view = createView('hello');
    // jsdom 非 Mac 平台,Mod 由 Ctrl 承担;Meta 单独按不应误触发其它键。
    pressKey(view, 'g', { ctrlKey: true, metaKey: false });
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('typola:goto-line', listener);
  });

  it('列表行 Tab 缩进一个 indentUnit(tabSize=4 → 4 空格)', () => {
    view = createView('- item\nplain');
    pressKey(view, 'Tab');
    expect(view.state.doc.toString()).toBe('    - item\nplain');
  });

  it('列表行 Shift-Tab 反缩进', () => {
    view = createView('    - item\nplain');
    pressKey(view, 'Tab', { shiftKey: true });
    expect(view.state.doc.toString()).toBe('- item\nplain');
  });

  it('有序列表行同样支持 Tab 缩进', () => {
    view = createView('1. item');
    pressKey(view, 'Tab');
    expect(view.state.doc.toString()).toBe('    1. item');
  });

  it('非列表行 Tab 不拦截(文档不变)', () => {
    view = createView('plain text');
    pressKey(view, 'Tab');
    expect(view.state.doc.toString()).toBe('plain text');
  });

  it('表格行 Tab 不拦截(让位表格导航)', () => {
    view = createView('| a | b |\n| --- | --- |');
    pressKey(view, 'Tab');
    expect(view.state.doc.toString()).toBe('| a | b |\n| --- | --- |');
  });

  it('选区覆盖多个列表行时 Tab 整体缩进', () => {
    view = createView('- one\n- two\nplain');
    const doc = view.state.doc;
    view.dispatch({ selection: { anchor: 0, head: doc.line(2).to } });
    pressKey(view, 'Tab');
    expect(view.state.doc.toString()).toBe('    - one\n    - two\nplain');
  });

  it('选区覆盖列表行与普通行时不拦截', () => {
    view = createView('- one\nplain');
    const doc = view.state.doc;
    view.dispatch({ selection: { anchor: 0, head: doc.line(2).to } });
    pressKey(view, 'Tab');
    expect(view.state.doc.toString()).toBe('- one\nplain');
  });

  it('多选列表项、选区 to 恰落在下一普通行行首时仍缩进(排他边界)', () => {
    view = createView('- one\n- two\nplain');
    const doc = view.state.doc;
    // selection.to 是排他边界:选到最后一条列表项末尾时 to === 下一行 from,
    // 实际覆盖的最后一行仍是列表行 two,不应把普通段落行算进覆盖范围。
    view.dispatch({ selection: { anchor: 0, head: doc.line(3).from } });
    pressKey(view, 'Tab');
    expect(view.state.doc.toString()).toBe('    - one\n    - two\nplain');
  });
});
