import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { createMarkdownExtensions } from './createMarkdownExtensions';
import { createLivePreviewExtensions } from './createLivePreviewExtensions';
import { reviewMarkExtension } from './reviewMarkExtension';

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({
      svg: '<svg data-testid="mermaid-svg"><script>alert(1)</script><g><text>ok</text></g></svg>',
    })),
  },
}));

vi.mock('katex', () => ({
  default: {
    renderToString: vi.fn((tex: string, options?: { displayMode?: boolean }) => {
      const className = options?.displayMode ? 'katex-display' : 'katex';
      return `<span class="${className}">${tex}</span>`;
    }),
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

async function waitForElement(selector: string): Promise<Element> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const element = document.querySelector(selector);
    if (element) return element;
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }
  throw new Error(`Timed out waiting for ${selector}`);
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

  it('sanitizes inline raw HTML widgets', () => {
    view = createView('<mark onclick="alert(1)">重点</mark> <sup>2</sup>', true);
    moveCursorToEnd(view);
    const html = view.contentDOM.querySelector('.typola-cm6-html');
    expect(html?.querySelector('mark')?.textContent).toBe('重点');
    expect(html?.querySelector('[onclick]')).toBeNull();
  });

  it.each([
    '<details><summary>x</summary><script>alert(1)</script></details>',
    '<mark onerror="alert(1)">x</mark>',
    '<mark><a href="javascript:alert(1)">x</a></mark>',
  ])('does not expose dangerous HTML nodes: %s', (source) => {
    view = createView(`${source}\nAfter`, true);
    moveCursorToEnd(view);
    const html = view.contentDOM.querySelector('.typola-cm6-html');
    expect(html?.querySelector('script, iframe, [onerror], [onclick], a[href^="javascript:"]')).toBeNull();
  });

  it('renders bare inline math with KaTeX outside the cursor range', async () => {
    view = createView('Energy $E=mc^2$ here', true);
    moveCursorToEnd(view);

    const inlineMath = view.contentDOM.querySelector<HTMLElement>('.typola-cm6-math-inline');
    expect(inlineMath).not.toBeNull();
    await waitForElement('.katex');
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

  it('renders and sanitizes mermaid fenced blocks as widgets', async () => {
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
    await waitForElement('[data-testid="mermaid-svg"]');
    expect(view.contentDOM.querySelector('.typola-cm6-mermaid script')).toBeNull();
  });

  it('marks the CM6 lines containing active review anchors', () => {
    const doc = '# 标题\n\n需要检视的正文\n\n结尾';
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    view = new EditorView({
      state: EditorState.create({
        doc,
        extensions: [reviewMarkExtension({
          filePath: '/tmp/review.md',
          comments: [{
            id: 'review-1',
            filePath: '/tmp/review.md',
            anchor: { filePath: '/tmp/review.md', from: 4, to: 10, originalText: '需要检视的正文' },
            text: '请补充来源',
            createdAt: 0,
          }],
        })],
      }),
      parent,
    });

    expect(view.contentDOM.querySelector('.cm-line.typola-cm-review-mark')?.textContent).toContain('需要检视的正文');
  });
});
