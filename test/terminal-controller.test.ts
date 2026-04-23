import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TERMINAL_HEIGHT, DEFAULT_TERMINAL_SETTINGS } from '../src/shared/terminal';
import { useTerminalStore, ensureTerminalPanelOpen, openNewTerminalTab, closeTerminalTab, toggleTerminalPanel } from '../src/store/terminal';
import { useUIStore } from '../src/store/ui';
import { useWorkspaceStore } from '../src/store/workspace';

describe('terminal controller', () => {
  let termCreateMock: ReturnType<typeof vi.fn>;
  let termKillMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useTerminalStore.getState().reset();
    useWorkspaceStore.getState().setWorkspaceRoot('C:\\workspace');
    useWorkspaceStore.getState().setFileTree([]);
    useUIStore.setState({
      terminalVisible: false,
      terminalHeight: DEFAULT_TERMINAL_HEIGHT,
      terminalSettings: { ...DEFAULT_TERMINAL_SETTINGS },
      settingsOpen: false,
      settingsActiveTab: 'general',
    });

    termCreateMock = vi
      .fn()
      .mockResolvedValueOnce({
        termId: 1,
        cwd: 'C:\\workspace',
        shellPath: 'powershell.exe',
        processName: 'powershell.exe',
      })
      .mockResolvedValueOnce({
        termId: 2,
        cwd: 'C:\\workspace',
        shellPath: 'powershell.exe',
        processName: 'powershell.exe',
      });
    termKillMock = vi.fn(() => Promise.resolve());

    window.electronAPI = {
      readFile: vi.fn(() => Promise.resolve('')),
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
      termCreate: termCreateMock,
      termWrite: vi.fn(() => Promise.resolve()),
      termResize: vi.fn(() => Promise.resolve()),
      termKill: termKillMock,
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
      onTerminalData: vi.fn(() => () => {}),
      onTerminalExit: vi.fn(() => () => {}),
      onMenuAction: vi.fn(() => () => {}),
    };
  });

  it('opens the panel and creates the first terminal in the current workspace', async () => {
    await ensureTerminalPanelOpen();

    expect(useUIStore.getState().terminalVisible).toBe(true);
    expect(termCreateMock).toHaveBeenCalledWith({
      cwd: 'C:\\workspace',
      shell: null,
      cols: 80,
      rows: 24,
    });

    const state = useTerminalStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].termId).toBe(1);
    expect(state.tabs[0].title).toBe('workspace');
    expect(state.activeTabId).toBe(state.tabs[0].id);
  });

  it('opens additional tabs without recreating the first one', async () => {
    await ensureTerminalPanelOpen();
    await openNewTerminalTab();

    const state = useTerminalStore.getState();
    expect(state.tabs).toHaveLength(2);
    expect(termCreateMock).toHaveBeenCalledTimes(2);
    expect(state.activeTabId).toBe(state.tabs[1].id);
  });

  it('hides the panel without killing the running terminal', async () => {
    await ensureTerminalPanelOpen();
    await toggleTerminalPanel();

    expect(useUIStore.getState().terminalVisible).toBe(false);
    expect(termKillMock).not.toHaveBeenCalled();
    expect(useTerminalStore.getState().tabs).toHaveLength(1);
  });

  it('kills the backend process when a tab closes', async () => {
    await ensureTerminalPanelOpen();

    const tabId = useTerminalStore.getState().tabs[0].id;
    await closeTerminalTab(tabId);

    expect(termKillMock).toHaveBeenCalledWith(1);
    expect(useTerminalStore.getState().tabs).toHaveLength(0);
  });
});
