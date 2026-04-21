import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TabBar } from '../src/components/TabBar';
import { useEditorStore } from '../src/store/editor';
import { useWorkspaceStore } from '../src/store/workspace';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) => {
      if (key === 'tabBar.fileModifiedMessage') {
        return `"${options?.name}" has been modified. Do you want to save?`;
      }

      const dictionary: Record<string, string> = {
        'common.close': 'Close',
        'common.discard': 'Discard',
        'common.save': 'Save',
        'fileTree.untitled': 'Untitled',
        'tabBar.fileModified': 'File Modified',
        'tabBar.modified': 'Modified',
      };

      return dictionary[key] ?? key;
    },
  }),
}));

describe('TabBar', () => {
  beforeEach(() => {
    useEditorStore.getState().reset();
    useWorkspaceStore.getState().setWorkspaceRoot(null);
    useWorkspaceStore.getState().setFileTree([]);

    window.electronAPI = {
      applyWorkspaceReplace: vi.fn(() => Promise.resolve({ updated: 0 })),
      createFile: vi.fn(() => Promise.resolve()),
      deletePath: vi.fn(() => Promise.resolve()),
      exportDocument: vi.fn(() => Promise.resolve({ canceled: true })),
      getImageUrl: vi.fn(() => Promise.resolve('file:///test.png')),
      listDir: vi.fn(() => Promise.resolve([])),
      onFileChanged: vi.fn(() => () => {}),
      onMaximizedChange: vi.fn(() => () => {}),
      onMenuAction: vi.fn(() => () => {}),
      pickFolder: vi.fn(() => Promise.resolve(null)),
      previewWorkspaceReplace: vi.fn(() => Promise.resolve([])),
      readFile: vi.fn(() => Promise.resolve('')),
      renamePath: vi.fn(() => Promise.resolve()),
      saveImage: vi.fn(() => Promise.resolve('.resources/test.png')),
      setLanguagePreference: vi.fn(() => Promise.resolve('en')),
      showSaveDialog: vi.fn(() => Promise.resolve(null)),
      unwatchFile: vi.fn(() => Promise.resolve()),
      watchFile: vi.fn(() => Promise.resolve()),
      windowClose: vi.fn(() => Promise.resolve()),
      windowIsMaximized: vi.fn(() => Promise.resolve(false)),
      windowMaximize: vi.fn(() => Promise.resolve()),
      windowMinimize: vi.fn(() => Promise.resolve()),
      windowUnmaximize: vi.fn(() => Promise.resolve()),
      workspaceSearch: vi.fn(() => Promise.resolve([])),
      writeFile: vi.fn(() => Promise.resolve()),
    };
  });

  afterEach(() => {
    cleanup();
  });

  it('prompts with save and discard actions for dirty tabs', async () => {
    const store = useEditorStore.getState();
    store.addOpenFile('C:\\workspace\\note.md');
    store.setLoadedContent('saved', 'C:\\workspace\\note.md');
    store.setContent('draft');

    render(<TabBar />);

    fireEvent.click(screen.getByRole('button', { name: 'Close note.md' }));

    expect(screen.getByText('File Modified')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('discards local changes without writing the file', async () => {
    const store = useEditorStore.getState();
    store.addOpenFile('C:\\workspace\\note.md');
    store.setLoadedContent('saved', 'C:\\workspace\\note.md');
    store.setContent('draft');

    render(<TabBar />);

    fireEvent.click(screen.getByRole('button', { name: 'Close note.md' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    await waitFor(() => {
      expect(useEditorStore.getState().currentFile).toBeNull();
    });
    expect(window.electronAPI.writeFile).not.toHaveBeenCalled();
  });
});
