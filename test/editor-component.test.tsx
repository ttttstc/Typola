import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MilkdownEditor } from '../src/components/Editor';
import { useEditorStore } from '../src/store/editor';

const { listenerCtxToken, editorInstances } = vi.hoisted(() => ({
  listenerCtxToken: Symbol('listenerCtx'),
  editorInstances: [] as Array<{ destroy: ReturnType<typeof vi.fn> }>,
}));

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    initReactI18next: {
      type: '3rdParty',
      init: () => {},
    },
    useTranslation: () => ({
      t: (key: string) => key,
    }),
  };
});

vi.mock('../src/editor/plugins/highlight', () => ({
  setupCodeHighlight: vi.fn(() => () => {}),
}));

vi.mock('../src/editor/plugins/image', () => ({
  setupImageHandler: vi.fn(() => () => {}),
}));

vi.mock('../src/editor/plugins/mermaid', () => ({
  setupMermaidHandler: vi.fn(() => () => {}),
}));

vi.mock('@milkdown/plugin-listener', () => ({
  listener: {},
  listenerCtx: listenerCtxToken,
}));

vi.mock('@milkdown/core', () => ({
  Editor: {
    make() {
      const instance = {
        config(fn: (ctx: { set: ReturnType<typeof vi.fn>; get: (token: symbol) => { markdownUpdated: ReturnType<typeof vi.fn> } | undefined }) => void) {
          fn({
            set: vi.fn(),
            get: (token: symbol) =>
              token === listenerCtxToken
                ? {
                    markdownUpdated: vi.fn(),
                  }
                : undefined,
          });
          return instance;
        },
        use() {
          return instance;
        },
        create() {
          return instance;
        },
        destroy: vi.fn(),
      };

      editorInstances.push(instance);
      return instance;
    },
  },
  rootCtx: Symbol('rootCtx'),
  defaultValueCtx: Symbol('defaultValueCtx'),
}));

vi.mock('@milkdown/preset-commonmark', () => ({
  commonmark: {},
}));

vi.mock('@milkdown/preset-gfm', () => ({
  gfm: {},
}));

vi.mock('@milkdown/plugin-history', () => ({
  history: {},
}));

describe('MilkdownEditor', () => {
  let readFileMock: ReturnType<typeof vi.fn>;
  let watchFileMock: ReturnType<typeof vi.fn>;
  let unwatchFileMock: ReturnType<typeof vi.fn>;
  let fileChangedHandler: ((data: { path: string }) => void) | null;

  beforeEach(() => {
    cleanup();
    useEditorStore.getState().reset();
    editorInstances.length = 0;
    fileChangedHandler = null;

    readFileMock = vi.fn((filePath: string) => Promise.resolve(`disk:${filePath}`));
    watchFileMock = vi.fn(() => Promise.resolve());
    unwatchFileMock = vi.fn(() => Promise.resolve());

    window.confirm = vi.fn(() => true);
    window.electronAPI = {
      readFile: readFileMock,
      writeFile: vi.fn(() => Promise.resolve()),
      pickFolder: vi.fn(() => Promise.resolve(null)),
      listDir: vi.fn(() => Promise.resolve([])),
      createFile: vi.fn(() => Promise.resolve()),
      deletePath: vi.fn(() => Promise.resolve()),
      renamePath: vi.fn(() => Promise.resolve()),
      showSaveDialog: vi.fn(() => Promise.resolve(null)),
      saveImage: vi.fn(() => Promise.resolve('.resources/test.png')),
      getImageUrl: vi.fn(() => Promise.resolve('file:///test.png')),
      windowMinimize: vi.fn(() => Promise.resolve()),
      windowMaximize: vi.fn(() => Promise.resolve()),
      windowUnmaximize: vi.fn(() => Promise.resolve()),
      windowClose: vi.fn(() => Promise.resolve()),
      windowIsMaximized: vi.fn(() => Promise.resolve(false)),
      watchFile: watchFileMock,
      unwatchFile: unwatchFileMock,
      onFileChanged: vi.fn((callback: (data: { path: string }) => void) => {
        fileChangedHandler = callback;
        return () => {
          if (fileChangedHandler === callback) {
            fileChangedHandler = null;
          }
        };
      }),
      onMaximizedChange: vi.fn(() => () => {}),
    };
  });

  afterEach(() => {
    cleanup();
  });

  it('restores dirty content without re-reading the file when switching back to a tab', async () => {
    readFileMock.mockImplementation((filePath: string) =>
      Promise.resolve(filePath === 'A.md' ? 'disk A' : 'disk B')
    );

    act(() => {
      useEditorStore.getState().addOpenFile('A.md');
    });

    render(<MilkdownEditor />);

    await waitFor(() => expect(readFileMock).toHaveBeenCalledWith('A.md'));

    act(() => {
      useEditorStore.getState().setContent('draft A');
      useEditorStore.getState().addOpenFile('B.md');
    });

    await waitFor(() => expect(readFileMock).toHaveBeenCalledWith('B.md'));
    const readsBeforeSwitchBack = readFileMock.mock.calls.length;

    act(() => {
      useEditorStore.getState().setCurrentFile('A.md');
    });

    await waitFor(() => expect(useEditorStore.getState().content).toBe('draft A'));
    expect(useEditorStore.getState().isDirty).toBe(true);
    expect(readFileMock).toHaveBeenCalledTimes(readsBeforeSwitchBack);
  });

  it('watches the active file and reloads it after an external change', async () => {
    act(() => {
      useEditorStore.getState().addOpenFile('note.md');
    });

    render(<MilkdownEditor />);

    await waitFor(() => expect(watchFileMock).toHaveBeenCalledWith('note.md'));
    await waitFor(() => expect(readFileMock).toHaveBeenCalledWith('note.md'));

    readFileMock.mockResolvedValueOnce('changed on disk');

    act(() => {
      fileChangedHandler?.({ path: 'note.md' });
    });

    await waitFor(() => expect(readFileMock).toHaveBeenCalledTimes(2));
    expect(useEditorStore.getState().content).toBe('changed on disk');
  });

  it('stops watching the previous file when the active tab changes', async () => {
    act(() => {
      useEditorStore.getState().addOpenFile('first.md');
    });

    render(<MilkdownEditor />);

    await waitFor(() => expect(watchFileMock).toHaveBeenCalledWith('first.md'));

    act(() => {
      useEditorStore.getState().addOpenFile('second.md');
    });

    await waitFor(() => expect(unwatchFileMock).toHaveBeenCalledWith('first.md'));
    await waitFor(() => expect(watchFileMock).toHaveBeenCalledWith('second.md'));
  });
});
