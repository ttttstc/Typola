import { create } from 'zustand';
import { useUIStore } from './ui';
import { useWorkspaceStore } from './workspace';
import { getTerminalTabTitle } from '../shared/terminal';

export type TerminalTabStatus = 'connecting' | 'running' | 'exited';

export interface TerminalTabState {
  id: string;
  title: string;
  cwd: string | null;
  shellPath: string;
  processName: string;
  termId: number | null;
  renamed: boolean;
  status: TerminalTabStatus;
  exitCode?: number;
}

interface TerminalStoreState {
  tabs: TerminalTabState[];
  activeTabId: string | null;
  addTab: (tab: TerminalTabState) => void;
  updateTab: (id: string, patch: Partial<TerminalTabState>) => void;
  removeTab: (id: string) => void;
  setActiveTab: (id: string | null) => void;
  renameTab: (id: string, title: string) => void;
  reset: () => void;
}

let nextTabId = 1;

function createLocalTabId() {
  const id = nextTabId;
  nextTabId += 1;
  return `terminal-tab-${id}`;
}

export const useTerminalStore = create<TerminalStoreState>((set) => ({
  tabs: [],
  activeTabId: null,
  addTab: (tab) =>
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
    })),
  updateTab: (id, patch) =>
    set((state) => ({
      tabs: state.tabs.map((tab) => {
        if (tab.id !== id) {
          return tab;
        }

        const nextTab = {
          ...tab,
          ...patch,
        };

        if (!nextTab.renamed && (patch.cwd !== undefined || patch.shellPath !== undefined)) {
          nextTab.title = getTerminalTabTitle(nextTab.cwd, nextTab.shellPath);
        }

        return nextTab;
      }),
    })),
  removeTab: (id) =>
    set((state) => {
      const removedIndex = state.tabs.findIndex((tab) => tab.id === id);
      const tabs = state.tabs.filter((tab) => tab.id !== id);

      if (state.activeTabId !== id) {
        return { tabs };
      }

      const fallbackTab = tabs[Math.max(0, removedIndex - 1)] ?? tabs[0] ?? null;
      return {
        tabs,
        activeTabId: fallbackTab?.id ?? null,
      };
    }),
  setActiveTab: (id) => set({ activeTabId: id }),
  renameTab: (id, title) =>
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === id
          ? {
              ...tab,
              title: title.trim() || getTerminalTabTitle(tab.cwd, tab.shellPath),
              renamed: Boolean(title.trim()),
            }
          : tab
      ),
    })),
  reset: () => {
    nextTabId = 1;
    set({ tabs: [], activeTabId: null });
  },
}));

export async function createTerminalTab() {
  const terminalSettings = useUIStore.getState().terminalSettings;
  const workspaceRoot = useWorkspaceStore.getState().workspaceRoot;
  const shellPath = terminalSettings.shellPath.trim();
  const requestedShell = shellPath.length > 0 ? shellPath : null;
  const requestedCwd = workspaceRoot;
  const localTabId = createLocalTabId();

  useTerminalStore.getState().addTab({
    id: localTabId,
    title: getTerminalTabTitle(requestedCwd, requestedShell),
    cwd: requestedCwd,
    shellPath: requestedShell ?? '',
    processName: '',
    termId: null,
    renamed: false,
    status: 'connecting',
  });

  try {
    const result = await window.electronAPI.termCreate({
      cwd: requestedCwd,
      shell: requestedShell,
      cols: 80,
      rows: 24,
    });

    useTerminalStore.getState().updateTab(localTabId, {
      cwd: result.cwd,
      shellPath: result.shellPath,
      processName: result.processName,
      termId: result.termId,
      status: 'running',
    });
  } catch {
    useTerminalStore.getState().updateTab(localTabId, {
      status: 'exited',
      exitCode: -1,
    });
  }

  return localTabId;
}

export async function ensureTerminalPanelOpen() {
  const uiStore = useUIStore.getState();
  if (!uiStore.terminalVisible) {
    uiStore.setTerminalVisible(true);
  }

  if (useTerminalStore.getState().tabs.length === 0) {
    await createTerminalTab();
  }
}

export async function toggleTerminalPanel() {
  const uiStore = useUIStore.getState();
  if (uiStore.terminalVisible) {
    uiStore.setTerminalVisible(false);
    return;
  }

  await ensureTerminalPanelOpen();
}

export async function openNewTerminalTab() {
  const uiStore = useUIStore.getState();
  if (!uiStore.terminalVisible) {
    uiStore.setTerminalVisible(true);
  }

  return createTerminalTab();
}

export async function closeTerminalTab(tabId: string) {
  const tab = useTerminalStore.getState().tabs.find((item) => item.id === tabId);
  if (tab?.termId != null) {
    await window.electronAPI.termKill(tab.termId);
  }

  useTerminalStore.getState().removeTab(tabId);
}

export function markTerminalExited(termId: number, exitCode: number) {
  const tab = useTerminalStore.getState().tabs.find((item) => item.termId === termId);
  if (!tab) {
    return;
  }

  useTerminalStore.getState().updateTab(tab.id, {
    status: 'exited',
    exitCode,
  });
}

export function getActiveTerminalTab() {
  const state = useTerminalStore.getState();
  return state.tabs.find((tab) => tab.id === state.activeTabId) ?? null;
}
