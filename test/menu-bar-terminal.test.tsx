import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MenuBar } from '../src/components/MenuBar';
import * as formatting from '../src/editor/formatting';
import { useEditorStore } from '../src/store/editor';
import { useTerminalStore } from '../src/store/terminal';
import { useUIStore } from '../src/store/ui';
import { useWorkspaceStore } from '../src/store/workspace';
import { DEFAULT_TERMINAL_HEIGHT, DEFAULT_TERMINAL_SETTINGS } from '../src/shared/terminal';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    initReactI18next: {
      type: '3rdParty',
      init: () => {},
    },
    useTranslation: () => ({
      t: (key: string) => {
        const dictionary: Record<string, string> = {
          'menu.file': 'File',
          'menu.edit': 'Edit',
          'menu.paragraph': 'Paragraph',
          'menu.format': 'Format',
          'menu.view': 'View',
          'menu.settings': 'Settings',
          'menu.terminal': 'Terminal',
          'menu.toggleLanguage': 'Toggle language',
          'menu.currentFontSize': 'Font Size',
          'menu.darkMode': 'Dark Mode',
          'menu.lightMode': 'Light Mode',
          'fileTree.untitled': 'Untitled',
          'table.insertRowAbove': 'Insert Row Above',
          'table.insertLineBreak': 'Insert Line Break',
        };

        return dictionary[key] ?? key;
      },
    }),
  };
});

vi.mock('../src/editor/formatting', () => ({
  addTableColumnAfter: vi.fn(),
  addTableColumnBefore: vi.fn(),
  addTableRowAfter: vi.fn(),
  addTableRowBefore: vi.fn(),
  applyBlockFormat: vi.fn(),
  applyInlineFormat: vi.fn(),
  applyLink: vi.fn(),
  deleteCurrentTable: vi.fn(),
  deleteCurrentTableColumn: vi.fn(),
  deleteCurrentTableRow: vi.fn(),
  exitCurrentTable: vi.fn(),
  getActiveLinkHref: vi.fn(() => null),
  hasEditorSelection: vi.fn(() => false),
  isEditorTarget: vi.fn(() => false),
  isSelectionInsideTable: vi.fn(() => false),
  isTableTarget: vi.fn(() => false),
  insertTableLineBreak: vi.fn(),
  rememberEditorSelection: vi.fn(),
  redoEditor: vi.fn(),
  selectAllEditor: vi.fn(),
  setCurrentTableColumnAlignment: vi.fn(),
  undoEditor: vi.fn(),
}));

describe('MenuBar terminal entry', () => {
  beforeEach(() => {
    cleanup();
    useEditorStore.getState().reset();
    useTerminalStore.getState().reset();
    useWorkspaceStore.getState().setWorkspaceRoot('C:\\workspace');
    useWorkspaceStore.getState().setFileTree([]);
    useUIStore.setState({
      theme: 'light',
      language: 'en',
      fontSize: 14,
      settingsOpen: false,
      settingsActiveTab: 'general',
      terminalVisible: false,
      terminalHeight: DEFAULT_TERMINAL_HEIGHT,
      terminalSettings: { ...DEFAULT_TERMINAL_SETTINGS },
      exportSettings: {
        pdfPageSize: 'A4',
        pdfMargin: 'normal',
        pdfPrintBackground: true,
        pdfHeaderFooter: false,
        htmlImageMode: 'relative',
      },
    });

    window.electronAPI = {
      applyWorkspaceReplace: vi.fn(() => Promise.resolve({ updated: 0 })),
      createFile: vi.fn(() => Promise.resolve()),
      deletePath: vi.fn(() => Promise.resolve()),
      exportDocument: vi.fn(() => Promise.resolve({ canceled: true })),
      getImageUrl: vi.fn(() => Promise.resolve('file:///test.png')),
      getRecentFiles: vi.fn(() => Promise.resolve([])),
      addRecentFile: vi.fn(() => Promise.resolve([])),
      clearRecentFiles: vi.fn(() => Promise.resolve([])),
      onRecentFilesChanged: vi.fn(() => () => {}),
      onOpenRecentFile: vi.fn(() => () => {}),
      notifyRendererReady: vi.fn(),
      listDir: vi.fn(() => Promise.resolve([])),
      pathExists: vi.fn(() => Promise.resolve(false)),
      onFileChanged: vi.fn(() => () => {}),
      onMaximizedChange: vi.fn(() => () => {}),
      onMenuAction: vi.fn(() => () => {}),
      onTerminalData: vi.fn(() => () => {}),
      onTerminalExit: vi.fn(() => () => {}),
      openExternal: vi.fn(() => Promise.resolve()),
      pickFolder: vi.fn(() => Promise.resolve(null)),
      previewWorkspaceReplace: vi.fn(() => Promise.resolve([])),
      readClipboardText: vi.fn(() => Promise.resolve('')),
      readFile: vi.fn(() => Promise.resolve('')),
      renamePath: vi.fn(() => Promise.resolve()),
      saveImage: vi.fn(() => Promise.resolve('.resources/test.png')),
      setLanguagePreference: vi.fn(() => Promise.resolve('en')),
      showSaveDialog: vi.fn(() => Promise.resolve(null)),
      termClear: vi.fn(() => Promise.resolve()),
      termCreate: vi.fn(() =>
        Promise.resolve({
          termId: 1,
          cwd: 'C:\\workspace',
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
      windowUnmaximize: vi.fn(() => Promise.resolve()),
      windowToggleMaximize: vi.fn(() => Promise.resolve(true)),
      workspaceSearch: vi.fn(() => Promise.resolve([])),
      writeClipboardText: vi.fn(() => Promise.resolve()),
      writeFile: vi.fn(() => Promise.resolve()),
    };

    vi.mocked(formatting.hasEditorSelection).mockReturnValue(false);
    vi.mocked(formatting.isEditorTarget).mockReturnValue(false);
    vi.mocked(formatting.isSelectionInsideTable).mockReturnValue(false);
    vi.mocked(formatting.isTableTarget).mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
  });

  it('opens the terminal panel from the top navigation button', async () => {
    render(<MenuBar />);

    fireEvent.click(screen.getByRole('button', { name: 'Terminal' }));

    await waitFor(() => {
      expect(useUIStore.getState().terminalVisible).toBe(true);
    });
    expect(window.electronAPI.termCreate).toHaveBeenCalledWith({
      cwd: 'C:\\workspace',
      shell: null,
      cols: 80,
      rows: 24,
    });
    expect(useTerminalStore.getState().tabs).toHaveLength(1);
  });

  it('signals renderer readiness after registering the open-file listener', () => {
    const onOpenRecentFile = vi.fn(() => () => {});
    const notifyRendererReady = vi.fn();

    window.electronAPI.onOpenRecentFile = onOpenRecentFile;
    window.electronAPI.notifyRendererReady = notifyRendererReady;

    render(<MenuBar />);

    expect(onOpenRecentFile).toHaveBeenCalledTimes(1);
    expect(notifyRendererReady).toHaveBeenCalledTimes(1);
    expect(notifyRendererReady.mock.invocationCallOrder[0]).toBeGreaterThan(
      onOpenRecentFile.mock.invocationCallOrder[0]
    );
  });

  it('shows table actions from the editor context menu even without a text selection', async () => {
    vi.mocked(formatting.isEditorTarget).mockReturnValue(true);
    vi.mocked(formatting.isTableTarget).mockReturnValue(true);
    vi.mocked(formatting.hasEditorSelection).mockReturnValue(false);

    render(<MenuBar />);

    fireEvent.contextMenu(document, { target: document.body, clientX: 80, clientY: 40 });

    expect(await screen.findByText('Insert Row Above')).toBeInTheDocument();
    expect(screen.getByText('Insert Line Break')).toBeInTheDocument();
  });
});
