import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import {
  getInlineMarkdownMarkerRemoval,
  getInlineMarkdownMarkers,
} from '../src/editor/plugins/markdownSyntax';

const schema = new Schema({
  marks: {
    emphasis: {
      parseDOM: [{ tag: 'em' }],
      toDOM: () => ['em', 0],
    },
    inlineCode: {
      code: true,
      parseDOM: [{ tag: 'code' }],
      toDOM: () => ['code', 0],
    },
    link: {
      attrs: { href: {} },
      inclusive: false,
      parseDOM: [{ tag: 'a', getAttrs: (dom) => ({ href: (dom as HTMLAnchorElement).href }) }],
      toDOM: (node) => ['a', { href: node.attrs.href }, 0],
    },
    strike_through: {
      parseDOM: [{ tag: 's' }],
      toDOM: () => ['s', 0],
    },
    strong: {
      parseDOM: [{ tag: 'strong' }],
      toDOM: () => ['strong', 0],
    },
  },
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM: () => ['p', 0],
    },
    text: { group: 'inline' },
  },
});

function createState(marks: Parameters<typeof schema.text>[1], cursor: number) {
  const doc = schema.node('doc', null, [
    schema.node('paragraph', null, [schema.text('Hello', marks)]),
  ]);

  return EditorState.create({
    doc,
    schema,
    selection: TextSelection.create(doc, cursor),
  });
}

describe('markdown syntax markers', () => {
  it('shows inline markdown markers for active bold text', () => {
    const state = createState([schema.marks.strong.create()], 3);
    const markers = getInlineMarkdownMarkers(state);

    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({
      kind: 'bold',
      prefix: '**',
      suffix: '**',
    });
    expect(state.doc.textBetween(markers[0].from, markers[0].to)).toBe('Hello');
  });

  it('includes the destination in active link markers', () => {
    const state = createState([schema.marks.link.create({ href: 'https://example.com' })], 3);
    const markers = getInlineMarkdownMarkers(state);

    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({
      kind: 'link',
      prefix: '[',
      suffix: '](https://example.com)',
    });
  });

  it('removes the active bold marker when backspacing at the text start', () => {
    const state = createState([schema.marks.strong.create()], 1);
    const marker = getInlineMarkdownMarkerRemoval(state, 'Backspace');

    expect(marker?.kind).toBe('bold');
  });

  it('removes the active link marker when deleting at the text end', () => {
    const state = createState([schema.marks.link.create({ href: 'https://example.com' })], 6);
    const marker = getInlineMarkdownMarkerRemoval(state, 'Delete');

    expect(marker?.kind).toBe('link');
  });
});
