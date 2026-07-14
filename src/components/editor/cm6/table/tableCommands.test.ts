// @vitest-environment jsdom
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { GFM } from '@lezer/markdown';
import { afterEach, describe, expect, it } from 'vitest';
import { deleteMarkdownTableAt, markdownTableBeforeCursor, selectedMarkdownTable } from './tableCommands';

describe('deleteMarkdownTableAt', () => {
  let view: EditorView | null = null;

  afterEach(() => {
    view?.destroy();
    view = null;
    document.body.innerHTML = '';
  });

  it('deletes the complete GFM table and keeps surrounding paragraphs separated', () => {
    const doc = 'before\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\nafter';
    view = new EditorView({
      state: EditorState.create({
        doc,
        extensions: [markdown({ base: markdownLanguage, extensions: [GFM] })],
      }),
      parent: document.body,
    });

    expect(deleteMarkdownTableAt(view, doc.indexOf('1 | 2'))).toBe(true);
    expect(view.state.doc.toString()).toBe('before\n\nafter');
  });

  it('does nothing outside a table', () => {
    view = new EditorView({
      state: EditorState.create({
        doc: 'plain text',
        extensions: [markdown({ base: markdownLanguage, extensions: [GFM] })],
      }),
      parent: document.body,
    });

    expect(deleteMarkdownTableAt(view, 2)).toBe(false);
    expect(view.state.doc.toString()).toBe('plain text');
  });
});

describe('table boundary behavior', () => {
  let view: EditorView | null = null;

  afterEach(() => {
    view?.destroy();
    view = null;
    document.body.innerHTML = '';
  });

  it('selects the table first and deletes it only after the selection is repeated', () => {
    const doc = '| A | B |\n| --- | --- |\n| 1 | 2 |\n\nafter';
    view = new EditorView({
      state: EditorState.create({
        doc,
        extensions: [markdown({ base: markdownLanguage, extensions: [GFM] })],
      }),
      parent: document.body,
    });
    const after = doc.indexOf('after');
    view.dispatch({ selection: { anchor: after } });
    const table = markdownTableBeforeCursor(view.state);
    expect(table).toEqual({ from: 0, to: doc.indexOf('\n\nafter') });

    view.dispatch({ selection: { anchor: table!.from, head: table!.to } });
    expect(selectedMarkdownTable(view.state)).toEqual(table);
    expect(deleteMarkdownTableAt(view, table!.from)).toBe(true);
    expect(view.state.doc.toString()).toBe('after');
  });
});