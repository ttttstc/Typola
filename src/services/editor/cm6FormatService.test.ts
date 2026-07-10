// @vitest-environment jsdom
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyCm6Format } from './cm6FormatService';

function createView(doc: string, from = 0, to = doc.length) {
  const host = document.createElement('div');
  document.body.append(host);
  const view = new EditorView({
    state: EditorState.create({ doc, selection: { anchor: from, head: to } }),
    parent: host,
  });
  return { host, view };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('applyCm6Format', () => {
  it.each([
    ['bold', '**', '**'],
    ['italic', '*', '*'],
  ] as const)('toggles existing %s markers for selected text and cursor', (type, open, close) => {
    const doc = `${open}文字${close}`;
    const { view } = createView(doc, open.length, open.length + 2);

    applyCm6Format(view, { type });
    expect(view.state.doc.toString()).toBe('文字');

    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: doc }, selection: { anchor: open.length + 1 } });
    applyCm6Format(view, { type });
    expect(view.state.doc.toString()).toBe('文字');
    view.destroy();
  });

  it('changes quote depth through a CM6 transaction', () => {
    const { view } = createView('> text', 0, 0);

    applyCm6Format(view, { type: 'quote-up' });
    expect(view.state.doc.toString()).toBe('>> text');

    applyCm6Format(view, { type: 'quote-down' });
    expect(view.state.doc.toString()).toBe('> text');
    view.destroy();
  });

  it('edits selected Markdown links and code block languages', () => {
    const link = '[Typola](https://old.example)';
    const { view } = createView(link);
    vi.spyOn(window, 'prompt').mockReturnValueOnce('https://new.example').mockReturnValueOnce('ts');

    applyCm6Format(view, { type: 'link-edit' });
    expect(view.state.doc.toString()).toBe('[Typola](https://new.example)');

    const block = '```\nconst x = 1;\n```';
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: block }, selection: { anchor: 0, head: block.length } });
    applyCm6Format(view, { type: 'codeblock-lang' });
    expect(view.state.doc.toString()).toBe('```ts\nconst x = 1;\n```');
    view.destroy();
  });

  it('clears selected inline and list markup', () => {
    const text = '- **strong**\n- `code`';
    const { view } = createView(text);

    applyCm6Format(view, { type: 'clear-format' });
    expect(view.state.doc.toString()).toBe('strong\ncode');
    view.destroy();
  });
});
