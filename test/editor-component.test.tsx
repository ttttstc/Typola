import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Editor, MilkdownEditor } from '../src/components/Editor';
import { useEditorStore } from '../src/store/editor';

const {
  listenerCtxToken,
  editorInstances,
  prosePluginsCtxToken,
  replaceAllMock,
  markdownUpdatedListeners,
  setupCodeHighlightMock,
  setupImageHandlerMock,
  setupMermaidHandlerMock,
} = vi.hoisted(() => ({
  listenerCtxToken: Symbol('listenerCtx'),
  editorInstances: [] as Array<{
    action: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  }>,
  prosePluginsCtxToken: Symbol('prosePluginsCtx'),
  replaceAllMock: vi.fn(() => vi.fn()),
  markdownUpdatedListeners: [] as Array<(ctx: unknown, markdown: string) => void>,
  setupCodeHighlightMock: vi.fn(() => () => {}),
  setupImageHandlerMock: vi.fn(() => () => {}),
  setupMermaidHandlerMock: vi.fn(() => () => {}),
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
  setupCodeHighlight: setupCodeHighlightMock,
}));

vi.mock('../src/editor/plugins/image', () => ({
  setupImageHandler: setupImageHandlerMock,
}));

vi.mock('../src/editor/plugins/mermaid', () => ({
  setupMermaidHandler: setupMermaidHandlerMock,
}));

vi.mock('../src/components/FloatingToolbar', () => ({
  FloatingToolbar: () => <div data-testid="floating-toolbar" />,
}));

vi.mock('../src/components/SearchBar', () => ({
  SearchBar: () => <div data-testid="search-bar" />,
}));

vi.mock('../src/components/SlashMenu', () => ({
  SlashMenu: () => <div data-testid="slash-menu" />,
}));

vi.mock('@milkdown/plugin-listener', () => ({
  listener: {},
  listenerCtx: listenerCtxToken,
}));

vi.mock('@milkdown/utils', () => ({
  replaceAll: replaceAllMock,
}));

vi.mock('@milkdown/core', () => ({
  Editor: {
    make() {
      const instance = {
        config(
          fn: (ctx: {
            get: (token: symbol) => { markdownUpdated: (cb: (ctx: unknown, markdown: string) => void) => void } | undefined;
            set: ReturnType<typeof vi.fn>;
            update: ReturnType<typeof vi.fn>;
          }) => void
        ) {
          fn({
            set: vi.fn(),
            update: vi.fn(),
            get: (token: symbol) =>
              token === listenerCtxToken
                ? {
                    markdownUpdated: (cb) => {
                      markdownUpdatedListeners.push(cb);
                    },
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
        action: vi.fn((callback?: (ctx: unknown) => void) => {
          callback?.({});
          return instance;
        }),
        destroy: vi.fn(),
      };

      editorInstances.push(instance);
      return instance;
    },
  },
  rootCtx: Symbol('rootCtx'),
  defaultValueCtx: Symbol('defaultValueCtx'),
  prosePluginsCtx: prosePluginsCtxToken,
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
    replaceAllMock.mockClear();
    markdownUpdatedListeners.length = 0;
    setupCodeHighlightMock.mockClear();
    setupImageHandlerMock.mockClear();
    setupMermaidHandlerMock.mockClear();
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
      workspaceSearch: vi.fn(() => Promise.resolve([])),
      previewWorkspaceReplace: vi.fn(() => Promise.resolve([])),
      applyWorkspaceReplace: vi.fn(() => Promise.resolve({ updated: 0 })),
      exportDocument: vi.fn(() => Promise.resolve({ canceled: true })),
      setLanguagePreference: vi.fn(() => Promise.resolve('en')),
      termCreate: vi.fn(() =>
        Promise.resolve({ termId: 1, cwd: 'C:\\workspace', shellPath: 'powershell.exe', processName: 'powershell.exe' })
      ),
      termWrite: vi.fn(() => Promise.resolve()),
      termResize: vi.fn(() => Promise.resolve()),
      termKill: vi.fn(() => Promise.resolve()),
      termClear: vi.fn(() => Promise.resolve()),
      readClipboardText: vi.fn(() => Promise.resolve('')),
      writeClipboardText: vi.fn(() => Promise.resolve()),
      openExternal: vi.fn(() => Promise.resolve()),
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
      onTerminalData: vi.fn(() => () => {}),
      onTerminalExit: vi.fn(() => () => {}),
      onMenuAction: vi.fn(() => () => {}),
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

  it('serializes watcher updates when file switches happen faster than IPC resolves', async () => {
    let resolveFirstWatch: (() => void) | null = null;
    watchFileMock.mockImplementation((filePath: string) => {
      if (filePath === 'first.md') {
        return new Promise<void>((resolve) => {
          resolveFirstWatch = resolve;
        });
      }

      return Promise.resolve();
    });

    act(() => {
      useEditorStore.getState().addOpenFile('first.md');
    });

    render(<MilkdownEditor />);

    await waitFor(() => expect(readFileMock).toHaveBeenCalledWith('first.md'));
    await waitFor(() => expect(watchFileMock).toHaveBeenCalledWith('first.md'));

    act(() => {
      useEditorStore.getState().addOpenFile('second.md');
    });

    await waitFor(() => expect(readFileMock).toHaveBeenCalledWith('second.md'));
    expect(unwatchFileMock).not.toHaveBeenCalled();
    expect(watchFileMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirstWatch?.();
      await Promise.resolve();
    });

    await waitFor(() => expect(unwatchFileMock).toHaveBeenCalledWith('first.md'));
    await waitFor(() => expect(watchFileMock).toHaveBeenCalledWith('second.md'));

    expect(watchFileMock.mock.invocationCallOrder[0]).toBeLessThan(
      unwatchFileMock.mock.invocationCallOrder[0]
    );
    expect(unwatchFileMock.mock.invocationCallOrder[0]).toBeLessThan(
      watchFileMock.mock.invocationCallOrder[1]
    );
  });

  it('reuses the same editor instance when switching across many open files', async () => {
    act(() => {
      useEditorStore.getState().addOpenFile('note-0.md');
    });

    render(<MilkdownEditor />);

    await waitFor(() => expect(readFileMock).toHaveBeenCalledWith('note-0.md'));
    const primaryInstance = editorInstances[0];

    for (let index = 1; index < 12; index += 1) {
      const path = `note-${index}.md`;
      act(() => {
        useEditorStore.getState().addOpenFile(path);
      });

      await waitFor(() => expect(readFileMock).toHaveBeenCalledWith(path));
    }

    expect(editorInstances).toHaveLength(1);
    expect(primaryInstance.destroy).not.toHaveBeenCalled();
    expect(primaryInstance.action).toHaveBeenCalledTimes(11);
    expect(replaceAllMock).toHaveBeenCalledTimes(11);
  });

  it('does not reinstall plugin handlers on every tab switch', async () => {
    act(() => {
      useEditorStore.getState().addOpenFile('alpha.md');
    });

    render(<MilkdownEditor />);

    await waitFor(() => expect(readFileMock).toHaveBeenCalledWith('alpha.md'));
    // Allow the queued microtask to drain so the initial install runs.
    await act(async () => {
      await Promise.resolve();
    });

    const initialCodeCalls = setupCodeHighlightMock.mock.calls.length;
    const initialImageCalls = setupImageHandlerMock.mock.calls.length;
    const initialMermaidCalls = setupMermaidHandlerMock.mock.calls.length;
    expect(initialCodeCalls).toBeGreaterThanOrEqual(1);

    for (let index = 0; index < 8; index += 1) {
      const path = `note-${index}.md`;
      act(() => {
        useEditorStore.getState().addOpenFile(path);
      });
      await waitFor(() => expect(readFileMock).toHaveBeenCalledWith(path));
      await act(async () => {
        await Promise.resolve();
      });
    }

    expect(setupCodeHighlightMock).toHaveBeenCalledTimes(initialCodeCalls);
    expect(setupImageHandlerMock).toHaveBeenCalledTimes(initialImageCalls);
    expect(setupMermaidHandlerMock).toHaveBeenCalledTimes(initialMermaidCalls);
  });

  it('drops the debounced markdownUpdated fire that follows a programmatic replace', async () => {
    readFileMock.mockImplementation((filePath: string) => Promise.resolve(`disk:${filePath}`));

    act(() => {
      useEditorStore.getState().addOpenFile('paper.md');
    });

    render(<MilkdownEditor />);

    await waitFor(() => expect(readFileMock).toHaveBeenCalledWith('paper.md'));
    await waitFor(() => expect(useEditorStore.getState().content).toBe('disk:paper.md'));

    // Simulate the debounced listener firing ~200ms after replaceAll. Without
    // the suppression, this would mark the freshly switched tab dirty even
    // though the user never typed anything.
    act(() => {
      markdownUpdatedListeners.forEach((listener) => listener({}, 'disk:paper.md'));
    });

    expect(useEditorStore.getState().isDirty).toBe(false);
    const openPaper = useEditorStore.getState().openFiles.find((file) => file.path === 'paper.md');
    expect(openPaper?.isDirty).toBe(false);
  });

  it('still records user edits after the post-replace listener fire is dropped', async () => {
    act(() => {
      useEditorStore.getState().addOpenFile('draft.md');
    });

    render(<MilkdownEditor />);

    await waitFor(() => expect(readFileMock).toHaveBeenCalledWith('draft.md'));

    // First listener fire: from the programmatic replace, must be dropped.
    act(() => {
      markdownUpdatedListeners.forEach((listener) => listener({}, 'disk:draft.md'));
    });
    expect(useEditorStore.getState().isDirty).toBe(false);

    // Second listener fire: a real user edit, must be recorded.
    act(() => {
      markdownUpdatedListeners.forEach((listener) => listener({}, 'user typed something'));
    });
    expect(useEditorStore.getState().isDirty).toBe(true);
    expect(useEditorStore.getState().content).toBe('user typed something');
  });

  it('uses a flexible editor shell so the terminal panel can stay visible', () => {
    render(<Editor />);

    expect(screen.getByTestId('editor-shell')).toHaveStyle({
      flex: '1 1 0%',
      minHeight: '0',
    });
  });
});
