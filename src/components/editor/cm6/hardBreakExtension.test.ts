// @vitest-environment jsdom
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';
import { hardBreakExtension } from './hardBreakExtension';

describe('hardBreakExtension', () => {
  let view: EditorView | null = null;

  afterEach(() => {
    view?.destroy();
    view = null;
    document.body.replaceChildren();
  });

  it('renders a visible break widget for markdown hard breaks', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    view = new EditorView({
      parent,
      state: EditorState.create({ doc: '第一行\\\n第二行', extensions: hardBreakExtension() }),
    });

    expect(view.contentDOM.querySelector('br.cm6-hard-break')).not.toBeNull();
  });
});
