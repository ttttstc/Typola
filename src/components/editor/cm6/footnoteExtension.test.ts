// @vitest-environment jsdom
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';
import { footnoteExtension } from './footnoteExtension';

describe('footnoteExtension', () => {
  let view: EditorView | null = null;
  afterEach(() => { view?.destroy(); view = null; document.body.replaceChildren(); });

  it('folds definitions and renders references', () => {
    const parent = document.createElement('div'); document.body.append(parent);
    view = new EditorView({ parent, state: EditorState.create({ doc: '正文[^1]\n\n[^1]: 说明', extensions: footnoteExtension() }) });
    expect(view.contentDOM.querySelector('.cm6-footnote-ref')).not.toBeNull();
    expect(view.contentDOM.querySelector('.cm6-footnote-definition')).not.toBeNull();
  });

  it('returns definition source when selection enters it', () => {
    const parent = document.createElement('div'); document.body.append(parent);
    view = new EditorView({ parent, state: EditorState.create({ doc: '[^x]: [escaped] text', extensions: footnoteExtension() }) });
    view.dispatch({ selection: { anchor: 2 } });
    expect(view.contentDOM.textContent).toContain('[^x]: [escaped] text');
  });
});
