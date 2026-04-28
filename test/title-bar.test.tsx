import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TitleBar } from '../src/components/TitleBar';
import { useUIStore } from '../src/store/ui';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    initReactI18next: {
      type: '3rdParty',
      init: () => {},
    },
    useTranslation: () => ({
      t: (key: string, options?: Record<string, string>) => {
        if (key === 'titleBar.switchThemeTo') {
          return `Switch to ${options?.theme} theme`;
        }

        const dictionary: Record<string, string> = {
          'titleBar.lightTheme': 'light',
          'titleBar.darkTheme': 'dark',
          'titleBar.minimize': 'Minimize',
          'titleBar.maximize': 'Maximize',
          'titleBar.restore': 'Restore',
          'titleBar.close': 'Close',
        };

        return dictionary[key] ?? key;
      },
    }),
  };
});

describe('TitleBar', () => {
  beforeEach(() => {
    cleanup();
    useUIStore.setState({ theme: 'light' });

    window.electronAPI = {
      readFile: vi.fn(() => Promise.resolve('')),
      writeFile: vi.fn(() => Promise.resolve()),
      addRecentFile: vi.fn(() => Promise.resolve([])),
      clearRecentFiles: vi.fn(() => Promise.resolve([])),
      pickFolder: vi.fn(() => Promise.resolve(null)),
      pickFile: vi.fn(() => Promise.resolve(null)),
      getRecentFiles: vi.fn(() => Promise.resolve([])),
      listDir: vi.fn(() => Promise.resolve([])),
      pathExists: vi.fn(() => Promise.resolve(false)),
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
      termCreate: vi.fn(),
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
      windowToggleMaximize: vi.fn(() => Promise.resolve(true)),
      windowClose: vi.fn(() => Promise.resolve()),
      windowIsMaximized: vi.fn(() => Promise.resolve(false)),
      watchFile: vi.fn(() => Promise.resolve()),
      unwatchFile: vi.fn(() => Promise.resolve()),
      onFileChanged: vi.fn(() => () => {}),
      onMaximizedChange: vi.fn(() => () => {}),
      onOpenRecentFile: vi.fn(() => () => {}),
      onRecentFilesChanged: vi.fn(() => () => {}),
      notifyRendererReady: vi.fn(),
      onTerminalData: vi.fn(() => () => {}),
      onTerminalExit: vi.fn(() => () => {}),
      onMenuAction: vi.fn(() => () => {}),
    };
  });

  afterEach(() => {
    cleanup();
  });

  it('toggles maximize state through the main process and reflects the returned state', async () => {
    render(<TitleBar />);

    fireEvent.click(screen.getByTitle('Maximize'));

    await waitFor(() => {
      expect(window.electronAPI.windowToggleMaximize).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.getByTitle('Restore')).toBeInTheDocument();
    });
  });
});
