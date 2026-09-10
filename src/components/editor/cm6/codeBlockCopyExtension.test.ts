// @vitest-environment jsdom
// 代码块复制按钮回归:FencedCode 块在光标不在块内时出现复制按钮,
// 光标进入块内隐藏;mermaid/math 围栏跳过;点击写入代码文本并短暂
// 显示"已复制"。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { codeBlockCopyExtension } from './codeBlockCopyExtension';

function createView(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({
    state: EditorState.create({
      doc,
      extensions: [markdown({ base: markdownLanguage }), codeBlockCopyExtension()],
    }),
    parent,
  });
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

describe('codeBlockCopyExtension', () => {
  it('光标不在代码块内时在 fence 行渲染复制按钮', () => {
    view = createView('```js\nconst a = 1;\n```\n\nafter');
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    const button = view.contentDOM.querySelector('button.typola-cm6-code-copy');
    expect(button).not.toBeNull();
    expect(button?.getAttribute('title')).toBe('复制代码');
  });

  it('光标进入代码块后按钮隐藏,离开后恢复', () => {
    const doc = '```js\nconst a = 1;\n```\n\nafter';
    view = createView(doc);
    const codeStart = doc.indexOf('const');
    view.dispatch({ selection: { anchor: codeStart + 2 } });
    expect(view.contentDOM.querySelector('button.typola-cm6-code-copy')).toBeNull();

    view.dispatch({ selection: { anchor: view.state.doc.length } });
    expect(view.contentDOM.querySelector('button.typola-cm6-code-copy')).not.toBeNull();
  });

  it('mermaid/math 围栏块跳过,普通代码块仍渲染', () => {
    view = createView('```mermaid\ngraph TD\n```\n\n```math\nx=1\n```\n\n```js\ncode\n```');
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    expect(view.contentDOM.querySelectorAll('button.typola-cm6-code-copy').length).toBe(1);
  });

  it('点击按钮复制块内代码(不含 fence 行)并短暂显示"已复制"', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    view = createView('```js\nconst a = 1;\n```\n\nafter');
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    const button = view.contentDOM.querySelector<HTMLButtonElement>('button.typola-cm6-code-copy');
    expect(button).not.toBeNull();
    button!.click();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(writeText).toHaveBeenCalledWith('const a = 1;');
    expect(button!.classList.contains('is-copied')).toBe(true);
    expect(button!.textContent).toContain('已复制');
  });
});
