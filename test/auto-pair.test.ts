import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it, beforeEach } from 'vitest';
import { createAutoPairPlugin } from '../src/editor/plugins/autoPair';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'text*',
      parseDOM: [{ tag: 'p' }],
      toDOM: () => ['p', 0],
    },
    text: { group: 'inline' },
  },
});

function createView(text: string, cursor?: number) {
  const doc = schema.node('doc', null, [
    schema.node('paragraph', null, text ? [schema.text(text)] : []),
  ]);
  const state = EditorState.create({
    doc,
    schema,
    plugins: [createAutoPairPlugin()],
    selection: TextSelection.create(doc, cursor ?? (text.length + 1)),
  });

  const place = document.createElement('div');
  document.body.appendChild(place);
  return new EditorView(place, { state });
}

describe('autoPairPlugin', () => {
  let view: EditorView | null = null;
  const defaultTr = () => view!.state.tr;

  beforeEach(() => {
    if (view) {
      view.destroy();
      view = null;
    }
  });

  it('inserts a closing bracket when typing an opener', () => {
    view = createView('');
    const handled = view.someProp('handleTextInput', (fn) =>
      fn(view!, 1, 1, '(', defaultTr)
    );
    expect(handled).toBe(true);
    expect(view.state.doc.textContent).toBe('()');
    expect(view.state.selection.from).toBe(2);
  });

  it('skips typing a closer when the next char already matches', () => {
    view = createView('()', 2);
    const handled = view.someProp('handleTextInput', (fn) =>
      fn(view!, 2, 2, ')', defaultTr)
    );
    expect(handled).toBe(true);
    expect(view.state.doc.textContent).toBe('()');
    expect(view.state.selection.from).toBe(3);
  });

  it('wraps a selection with paired characters', () => {
    view = createView('hello');
    const state = view.state;
    view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, 1, 6)));
    const handled = view.someProp('handleTextInput', (fn) =>
      fn(view!, 1, 6, '(', defaultTr)
    );
    expect(handled).toBe(true);
    expect(view.state.doc.textContent).toBe('(hello)');
  });

  it('does not pair a quote after a word character', () => {
    view = createView('don');
    const handled = view.someProp('handleTextInput', (fn) =>
      fn(view!, 4, 4, "'", defaultTr)
    );
    // someProp short-circuits on truthy, so an unhandled input returns undefined.
    expect(handled).toBeFalsy();
  });
});
