// @vitest-environment jsdom
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { afterEach, describe, expect, it } from 'vitest';
import { htmlPreviewExtension } from './htmlPreviewExtension';

describe('htmlPreviewExtension', () => {
  let view: EditorView | null = null;

  afterEach(() => {
    view?.destroy();
    view = null;
    document.body.replaceChildren();
  });

  it('renders an inline sup when the caret is at the end of the document', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const doc = 'H<sub>2</sub>O 与 E=mc<sup>2</sup>';
    view = new EditorView({
      parent,
      state: EditorState.create({ doc, selection: { anchor: doc.length }, extensions: [markdown(), htmlPreviewExtension()] }),
    });

    expect(view.contentDOM.querySelector('sup')?.textContent).toBe('2');
  });

  it('hides raw HTML comments and script text while keeping normal text', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const doc = '<!-- 这是注释 --><script>alert("xss")</script>正常段落';
    view = new EditorView({
      parent,
      state: EditorState.create({ doc, selection: { anchor: doc.length }, extensions: [markdown(), htmlPreviewExtension()] }),
    });

    const text = view.contentDOM.textContent ?? '';
    expect(text).not.toContain('这是注释');
    expect(text).not.toContain('alert');
    expect(text).toContain('正常段落');
  });

  it('renders markdown highlight nested inside raw HTML', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const doc = '<sub>==重点==</sub>';
    view = new EditorView({
      parent,
      state: EditorState.create({ doc, selection: { anchor: doc.length }, extensions: [markdown(), htmlPreviewExtension()] }),
    });

    expect(view.contentDOM.querySelector('.typola-cm6-html mark')?.textContent).toBe('重点');
  });

  it('keeps HTML-looking examples literal inside fenced code', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const doc = '```html\n<script>alert("demo")</script>\n```';
    view = new EditorView({
      parent,
      state: EditorState.create({ doc, selection: { anchor: doc.length }, extensions: [markdown(), htmlPreviewExtension()] }),
    });

    expect(view.contentDOM.querySelector('.typola-cm6-html')).toBeNull();
    expect(view.contentDOM.textContent).toContain('alert("demo")');
  });
});
