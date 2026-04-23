import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TerminalPanel } from '../src/components/TerminalPanel';
import { DEFAULT_TERMINAL_HEIGHT, DEFAULT_TERMINAL_SETTINGS } from '../src/shared/terminal';
import { getTerminalTheme } from '../src/shared/terminal-theme';
import { useTerminalStore } from '../src/store/terminal';
import { useUIStore } from '../src/store/ui';

const { terminalInstances, MockTerminal, MockFitAddon } = vi.hoisted(() => {
  const instances: Array<{
    options: Record<string, unknown>;
    rows: number;
    loadAddon: ReturnType<typeof vi.fn>;
    open: ReturnType<typeof vi.fn>;
    onData: ReturnType<typeof vi.fn>;
    onResize: ReturnType<typeof vi.fn>;
    attachCustomKeyEventHandler: ReturnType<typeof vi.fn>;
    hasSelection: ReturnType<typeof vi.fn>;
    getSelection: ReturnType<typeof vi.fn>;
    clearSelection: ReturnType<typeof vi.fn>;
    focus: ReturnType<typeof vi.fn>;
    paste: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
    selectAll: ReturnType<typeof vi.fn>;
    writeln: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }> = [];

  class HoistedMockTerminal {
    options: Record<string, unknown>;
    rows = 24;
    loadAddon = vi.fn();
    open = vi.fn();
    onData = vi.fn();
    onResize = vi.fn();
    attachCustomKeyEventHandler = vi.fn();
    hasSelection = vi.fn(() => false);
    getSelection = vi.fn(() => '');
    clearSelection = vi.fn();
    focus = vi.fn();
    paste = vi.fn();
    clear = vi.fn();
    selectAll = vi.fn();
    writeln = vi.fn();
    write = vi.fn();
    refresh = vi.fn();
    dispose = vi.fn();

    constructor(options: Record<string, unknown>) {
      this.options = { ...options };
      instances.push(this);
    }
  }

  class HoistedMockFitAddon {
    fit = vi.fn();
    dispose = vi.fn();
  }

  return {
    terminalInstances: instances,
    MockTerminal: HoistedMockTerminal,
    MockFitAddon: HoistedMockFitAddon,
  };
});

vi.mock('@xterm/xterm', () => ({
  Terminal: MockTerminal,
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: MockFitAddon,
}));

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: class MockWebLinksAddon {},
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

describe('TerminalPanel theme', () => {
  beforeEach(() => {
    terminalInstances.length = 0;
    useTerminalStore.setState({
      tabs: [
        {
          id: 'terminal-tab-1',
          title: 'workspace',
          cwd: 'C:\\workspace',
          shellPath: 'powershell.exe',
          processName: 'powershell.exe',
          termId: null,
          renamed: false,
          status: 'running',
        },
      ],
      activeTabId: 'terminal-tab-1',
    });
    useUIStore.setState({
      theme: 'light',
      terminalVisible: true,
      terminalHeight: DEFAULT_TERMINAL_HEIGHT,
      terminalSettings: { ...DEFAULT_TERMINAL_SETTINGS },
    });
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
      onTerminalData: vi.fn(() => () => {}),
      onTerminalExit: vi.fn(() => () => {}),
      onMenuAction: vi.fn(() => () => {}),
    };
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useTerminalStore.getState().reset();
  });

  it('returns distinct palettes for light and dark mode', () => {
    expect(getTerminalTheme('light')).toMatchObject({
      background: '#F7F7F7',
      foreground: '#0B0B0B',
      cursor: '#0B0B0B',
    });
    expect(getTerminalTheme('dark')).toMatchObject({
      background: '#141414',
      foreground: '#F2F2F2',
      cursor: '#F2F2F2',
    });
  });

  it('uses the current app theme when creating xterm', () => {
    useUIStore.setState({ theme: 'dark' });
    render(<TerminalPanel />);

    expect(terminalInstances).toHaveLength(1);
    expect(terminalInstances[0].options.theme).toEqual(getTerminalTheme('dark'));
  });
});
