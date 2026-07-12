import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveLocalImages } from '../../../services/localImageResolver';
import { imageAssetExtension } from './imageAssetExtension';

vi.mock('../../../services/localImageResolver', () => ({
  resolveLocalImages: vi.fn(),
}));

const flushFrame = () => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

describe('imageAssetExtension', () => {
  let view: EditorView | undefined;

  afterEach(() => {
    view?.destroy();
    view = undefined;
    vi.clearAllMocks();
  });

  it('resolves images inserted by a live-preview widget', async () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    view = new EditorView({
      state: EditorState.create({
        extensions: [imageAssetExtension({ filePath: () => 'C:\\docs\\note.md' })],
      }),
      parent,
    });

    const image = document.createElement('img');
    image.src = './photo.png';
    view.contentDOM.append(image);
    await Promise.resolve();
    await flushFrame();

    expect(resolveLocalImages).toHaveBeenLastCalledWith(view.contentDOM, 'C:\\docs\\note.md');
    parent.remove();
  });
});
