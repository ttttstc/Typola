import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { createMarkdownExtensions } from './createMarkdownExtensions';
import { createLivePreviewExtensions } from './createLivePreviewExtensions';

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({ svg: '<svg data-testid="mermaid-svg"></svg>' })),
  },
}));

function createView(doc: string, livePreview: boolean): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({
    state: EditorState.create({
      doc,
      extensions: createMarkdownExtensions({
        fontFamily: 'monospace',
        fontSize: 14,
        tabSize: 4,
        wordWrap: true,
        extraExtensions: livePreview ? createLivePreviewExtensions() : undefined,
      }),
    }),
    parent,
  });
}

function moveCursorToEnd(view: EditorView): void {
  view.dispatch({ selection: { anchor: view.state.doc.length } });
}

function destroyView(view: EditorView): void {
  const parent = view.dom.parentElement;
  view.destroy();
  parent?.remove();
}

describe('createMarkdownExtensions live preview', () => {
  let view: EditorView | null = null;

  afterEach(() => {
    if (view && !view.destroyed) destroyView(view);
    view = null;
    document.body.innerHTML = '';
  });

  it('keeps source mode plain when livePreview is disabled', () => {
    view = createView('- [x] done\n\n![img](https://example.com/a.png)', false);

    expect(view.contentDOM.querySelector('.cm-atomic-task-checkbox')).toBeNull();
    expect(view.contentDOM.querySelector('.cm-atomic-image')).toBeNull();
  });

  it('renders task list, table, and image widgets when livePreview is enabled', () => {
    view = createView([
      '- [x] done',
      '',
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |',
      '',
      '![img](https://example.com/a.png)',
    ].join('\n'), true);
    moveCursorToEnd(view);

    expect(view.contentDOM.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
    expect(view.contentDOM.querySelector('.cm-atomic-table')).not.toBeNull();
    expect(view.contentDOM.querySelector<HTMLImageElement>('.cm-atomic-image img')?.src).toBe('https://example.com/a.png');
  });

  it('renders bare inline math with KaTeX outside the cursor range', () => {
    view = createView('Energy $E=mc^2$ here', true);
    moveCursorToEnd(view);

    const inlineMath = view.contentDOM.querySelector<HTMLElement>('.typola-cm6-math-inline');
    expect(inlineMath).not.toBeNull();
    expect(inlineMath?.querySelector('.katex')).not.toBeNull();
  });

  it('renders dollar block math and fenced math blocks', () => {
    view = createView([
      '$$',
      'a^2+b^2=c^2',
      '$$',
      '',
      '```math',
      '\\int_0^1 x dx',
      '```',
      '',
      'After',
    ].join('\n'), true);
    moveCursorToEnd(view);

    expect(view.contentDOM.querySelectorAll('.typola-cm6-math-block').length).toBe(2);
  });

  it('renders mermaid fenced blocks as widgets', () => {
    view = createView([
      '```mermaid',
      'graph TD',
      '  A --> B',
      '```',
      '',
      'After',
    ].join('\n'), true);
    moveCursorToEnd(view);

    expect(view.contentDOM.querySelector('.typola-cm6-mermaid')).not.toBeNull();
  });
});
