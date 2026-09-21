// @vitest-environment jsdom
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';
import { highlightExtension } from './highlightExtension';

describe('highlightExtension', () => {
  let view: EditorView | null = null;

  afterEach(() => {
    view?.destroy();
    view = null;
    document.body.replaceChildren();
  });

  it('renders ==text== as a mark while keeping the Markdown source', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const doc = '这段 ==高亮== 内容';
    view = new EditorView({
      parent,
      state: EditorState.create({ doc, selection: { anchor: doc.length }, extensions: highlightExtension() }),
    });

    expect(view.state.doc.toString()).toBe(doc);
    expect(view.contentDOM.querySelector('mark')?.textContent).toBe('高亮');
  });
});
