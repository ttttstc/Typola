// @vitest-environment jsdom
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { GFM } from '@lezer/markdown';
import { afterEach, describe, expect, it } from 'vitest';
import { deleteMarkdownTableAt } from './tableCommands';

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
