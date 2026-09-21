// @vitest-environment jsdom
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
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
      state: EditorState.create({ doc: ['第一行\\', '第二行'].join('\n'), extensions: [markdown(), hardBreakExtension()] }),
    });

    expect(view.contentDOM.querySelector('br.cm6-hard-break')).not.toBeNull();
  });

  it('keeps escaped backslashes and fenced code literal', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const doc = ['foo\\\\', 'bar', '', '```', 'foo\\', 'bar', '```'].join('\n');
    view = new EditorView({
      parent,
      state: EditorState.create({ doc, selection: { anchor: doc.length }, extensions: [markdown(), hardBreakExtension()] }),
    });

    expect(view.contentDOM.querySelectorAll('br.cm6-hard-break')).toHaveLength(0);
  });
});
