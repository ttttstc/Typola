import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileTree } from '../src/components/FileTree';
import { useEditorStore } from '../src/store/editor';
import { useWorkspaceStore } from '../src/store/workspace';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) => {
      const dictionary: Record<string, string> = {
        'common.cancel': 'Cancel',
        'common.confirm': 'Confirm',
        'common.delete': 'Delete',
        'common.rename': 'Rename',
        'fileTree.files': 'Files',
        'fileTree.loading': 'Loading...',
        'fileTree.addProject': 'Add Project',
        'fileTree.removeProject': 'Remove Project',
        'fileTree.noProjects': 'No Projects',
        'fileTree.renameHint': 'Press Enter to confirm or Esc to cancel.',
        'fileTree.renameEmpty': 'Name cannot be empty.',
        'fileTree.renameInvalid': 'Names cannot include / or \\.',
        'fileTree.renameFailed': 'Rename failed. Please try again.',
        'statusBar.saving': 'Saving...',
      };

      if (key === 'fileTree.renamePrompt') {
        return `Enter a new name for "${options?.name}":`;
      }

      if (key === 'fileTree.renameConflict') {
        return `"${options?.name}" already exists. Choose a different name.`;
      }

      if (key === 'fileTree.confirmDelete') {
        return `Delete "${options?.name}"?`;
      }

      if (key === 'fileTree.confirmRemoveProject') {
        return `Remove project "${options?.name}"?`;
      }

      return dictionary[key] ?? key;
    },
  }),
}));

describe('FileTree', () => {
  const rootPath = 'C:\\workspace';
  const longFileName = 'very-long-file-name-that-should-still-be-visible-on-hover.md';
  const longFilePath = `${rootPath}\\${longFileName}`;

  beforeEach(() => {
    cleanup();
    useEditorStore.getState().reset();
    useWorkspaceStore.setState({
      workspaceRoots: [
        {
          path: rootPath,
          name: 'workspace',
          expanded: true,
          fileTree: [
            { name: longFileName, path: longFilePath, isDir: false },
            { name: 'second.md', path: `${rootPath}\\second.md`, isDir: false },
          ],
        },
      ],
      activeRootPath: rootPath,
      workspaceRoot: rootPath,
      fileTree: [
        { name: longFileName, path: longFilePath, isDir: false },
        { name: 'second.md', path: `${rootPath}\\second.md`, isDir: false },
      ],
    });

    window.confirm = vi.fn(() => true);
    window.electronAPI = {
      applyWorkspaceReplace: vi.fn(() => Promise.resolve({ updated: 0 })),
      createFile: vi.fn(() => Promise.resolve()),
      deletePath: vi.fn(() => Promise.resolve()),
      exportDocument: vi.fn(() => Promise.resolve({ canceled: true })),
      getImageUrl: vi.fn(() => Promise.resolve('file:///test.png')),
      listDir: vi.fn(() =>
        Promise.resolve([
          {
            name: 'renamed.md',
            path: `${rootPath}\\renamed.md`,
            isDir: false,
          },
        ])
      ),
      onFileChanged: vi.fn(() => () => {}),
      onMaximizedChange: vi.fn(() => () => {}),
      onMenuAction: vi.fn(() => () => {}),
      onTerminalData: vi.fn(() => () => {}),
      onTerminalExit: vi.fn(() => () => {}),
      openExternal: vi.fn(() => Promise.resolve()),
      pickFolder: vi.fn(() => Promise.resolve(null)),
      previewWorkspaceReplace: vi.fn(() => Promise.resolve([])),
      readClipboardText: vi.fn(() => Promise.resolve('')),
      readFile: vi.fn(() => Promise.reject(new Error('not found'))),
      renamePath: vi.fn(() => Promise.resolve()),
      saveImage: vi.fn(() => Promise.resolve('.resources/test.png')),
      setLanguagePreference: vi.fn(() => Promise.resolve('en')),
      showSaveDialog: vi.fn(() => Promise.resolve(null)),
      termClear: vi.fn(() => Promise.resolve()),
      termCreate: vi.fn(() =>
        Promise.resolve({
          termId: 1,
          cwd: rootPath,
          shellPath: 'powershell.exe',
          processName: 'powershell.exe',
        })
      ),
      termKill: vi.fn(() => Promise.resolve()),
      termResize: vi.fn(() => Promise.resolve()),
      termWrite: vi.fn(() => Promise.resolve()),
      unwatchFile: vi.fn(() => Promise.resolve()),
      watchFile: vi.fn(() => Promise.resolve()),
      windowClose: vi.fn(() => Promise.resolve()),
      windowIsMaximized: vi.fn(() => Promise.resolve(false)),
      windowMaximize: vi.fn(() => Promise.resolve()),
      windowMinimize: vi.fn(() => Promise.resolve()),
      windowToggleMaximize: vi.fn(() => Promise.resolve(true)),
      windowUnmaximize: vi.fn(() => Promise.resolve()),
      workspaceSearch: vi.fn(() => Promise.resolve([])),
      writeClipboardText: vi.fn(() => Promise.resolve()),
      writeFile: vi.fn(() => Promise.resolve()),
    };
  });

  afterEach(() => {
    cleanup();
  });

  it('shows the full file name on hover for truncated entries', () => {
    render(<FileTree />);

    expect(screen.getByTitle(longFileName)).toBeInTheDocument();
  });

  it('renames files with the in-app dialog and updates open tabs', async () => {
    useEditorStore.getState().addOpenFile(longFilePath);
    useEditorStore.getState().setLoadedContent('draft', longFilePath);

    render(<FileTree />);

    fireEvent.contextMenu(screen.getByText(longFileName));
    fireEvent.click(screen.getByText('Rename'));

    const input = screen.getByDisplayValue(longFileName);
    fireEvent.change(input, { target: { value: 'renamed.md' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(window.electronAPI.renamePath).toHaveBeenCalledWith(longFilePath, `${rootPath}\\renamed.md`);
    });
    await waitFor(() => {
      expect(useEditorStore.getState().currentFile).toBe(`${rootPath}\\renamed.md`);
    });
    expect(window.electronAPI.listDir).toHaveBeenCalledWith(rootPath);
  });
});
