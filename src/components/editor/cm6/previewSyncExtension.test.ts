import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { previewSyncExtension } from './previewSyncExtension';

describe('previewSyncExtension', () => {
  let view: EditorView | null = null;

  afterEach(() => {
    if (view && !view.destroyed) view.destroy();
    view = null;
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('re-analyzes and reports immediately after a document change', async () => {
    const onChange = vi.fn();
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    view = new EditorView({
      state: EditorState.create({
        doc: '# A\n\n正文',
        extensions: [previewSyncExtension({ onChange })],
      }),
      parent,
    });

    view.dispatch({ changes: { from: view.state.doc.length, insert: '\n\n# B' } });
    await Promise.resolve();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith({ index: 0, withinRatio: 0 });
  });

  it('throttles viewport updates before the next animation frame', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    view = new EditorView({
      state: EditorState.create({
        doc: Array.from({ length: 40 }, (_, index) => `## ${index}`).join('\n\n'),
        extensions: [previewSyncExtension({ onChange })],
      }),
      parent,
    });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 0;
    });

    view.scrollDOM.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(199);
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
