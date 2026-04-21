import { create } from 'zustand';
import { SearchOptions } from '../shared/search';
import { useUIStore } from './ui';

export interface WorkspaceSearchMatch {
  lineNumber: number;
  column: number;
  lineText: string;
  matchText: string;
  contextBefore: string[];
  contextAfter: string[];
}

export interface WorkspaceSearchResult {
  filePath: string;
  relativePath: string;
  matches: WorkspaceSearchMatch[];
  totalMatches: number;
}

export interface WorkspaceReplacePreview {
  filePath: string;
  relativePath: string;
  replacementCount: number;
  nextContent: string;
  changes: Array<{
    lineNumber: number;
    beforeLine: string;
    afterLine: string;
    matchText: string;
    replacementText: string;
  }>;
}

interface SearchState {
  fileSearchOpen: boolean;
  fileSearchQuery: string;
  fileReplaceQuery: string;
  fileSearchOptions: SearchOptions;
  fileSearchMatchCount: number;
  fileSearchActiveIndex: number;
  workspaceSearchQuery: string;
  workspaceReplaceQuery: string;
  workspaceSearchOptions: SearchOptions;
  workspaceIncludeGlob: string;
  workspaceExcludeGlob: string;
  workspaceResults: WorkspaceSearchResult[];
  workspaceReplacePreview: WorkspaceReplacePreview[];
  workspaceSearchLoading: boolean;
  workspaceReplaceLoading: boolean;
  searchFileOpen: (open?: boolean) => void;
  closeFileSearch: () => void;
  setFileSearchQuery: (query: string) => void;
  setFileReplaceQuery: (query: string) => void;
  setFileSearchOptions: (patch: Partial<SearchOptions>) => void;
  setFileSearchMetrics: (matchCount: number, activeIndex: number) => void;
  moveFileSearchIndex: (delta: number) => void;
  openFileSearchWithQuery: (query: string) => void;
  openFileSearchMatch: (config: {
    query: string;
    activeIndex: number;
    options?: SearchOptions;
  }) => void;
  setWorkspaceSearchQuery: (query: string) => void;
  setWorkspaceReplaceQuery: (query: string) => void;
  setWorkspaceSearchOptions: (patch: Partial<SearchOptions>) => void;
  setWorkspaceGlobFilters: (patch: { includeGlob?: string; excludeGlob?: string }) => void;
  setWorkspaceResults: (results: WorkspaceSearchResult[]) => void;
  setWorkspaceReplacePreview: (preview: WorkspaceReplacePreview[]) => void;
  setWorkspaceSearchLoading: (loading: boolean) => void;
  setWorkspaceReplaceLoading: (loading: boolean) => void;
  clearWorkspacePreview: () => void;
}

function getDefaultSearchOptions() {
  const state = useUIStore.getState();
  return {
    caseSensitive: state.searchDefaults.caseSensitive,
    wholeWord: state.searchDefaults.wholeWord,
    useRegex: state.searchDefaults.useRegex,
  };
}

export const useSearchStore = create<SearchState>((set) => ({
  fileSearchOpen: false,
  fileSearchQuery: '',
  fileReplaceQuery: '',
  fileSearchOptions: getDefaultSearchOptions(),
  fileSearchMatchCount: 0,
  fileSearchActiveIndex: 0,
  workspaceSearchQuery: '',
  workspaceReplaceQuery: '',
  workspaceSearchOptions: getDefaultSearchOptions(),
  workspaceIncludeGlob: useUIStore.getState().searchDefaults.includeGlob,
  workspaceExcludeGlob: useUIStore.getState().searchDefaults.excludeGlob,
  workspaceResults: [],
  workspaceReplacePreview: [],
  workspaceSearchLoading: false,
  workspaceReplaceLoading: false,
  searchFileOpen: (open = true) =>
    set({
      fileSearchOpen: open,
      fileSearchOptions: getDefaultSearchOptions(),
    }),
  closeFileSearch: () =>
    set({
      fileSearchOpen: false,
      fileSearchQuery: '',
      fileReplaceQuery: '',
      fileSearchMatchCount: 0,
      fileSearchActiveIndex: 0,
      fileSearchOptions: getDefaultSearchOptions(),
    }),
  setFileSearchQuery: (query) =>
    set({
      fileSearchQuery: query,
      fileSearchActiveIndex: 0,
    }),
  setFileReplaceQuery: (query) => set({ fileReplaceQuery: query }),
  setFileSearchOptions: (patch) =>
    set((state) => ({
      fileSearchOptions: {
        ...state.fileSearchOptions,
        ...patch,
      },
      fileSearchActiveIndex: 0,
    })),
  setFileSearchMetrics: (matchCount, activeIndex) =>
    set({
      fileSearchMatchCount: matchCount,
      fileSearchActiveIndex: activeIndex,
    }),
  moveFileSearchIndex: (delta) =>
    set((state) => {
      if (state.fileSearchMatchCount === 0) {
        return { fileSearchActiveIndex: 0 };
      }

      const nextIndex =
        (state.fileSearchActiveIndex + delta + state.fileSearchMatchCount) % state.fileSearchMatchCount;

      return {
        fileSearchActiveIndex: nextIndex,
      };
    }),
  openFileSearchWithQuery: (query) =>
    set({
      fileSearchOpen: true,
      fileSearchQuery: query,
      fileSearchActiveIndex: 0,
    }),
  openFileSearchMatch: ({ query, activeIndex, options }) =>
    set({
      fileSearchOpen: true,
      fileSearchQuery: query,
      fileSearchActiveIndex: Math.max(0, activeIndex),
      fileSearchOptions: options ?? getDefaultSearchOptions(),
    }),
  setWorkspaceSearchQuery: (query) =>
    set({
      workspaceSearchQuery: query,
      workspaceReplacePreview: [],
    }),
  setWorkspaceReplaceQuery: (query) => set({ workspaceReplaceQuery: query }),
  setWorkspaceSearchOptions: (patch) =>
    set((state) => ({
      workspaceSearchOptions: {
        ...state.workspaceSearchOptions,
        ...patch,
      },
      workspaceReplacePreview: [],
    })),
  setWorkspaceGlobFilters: (patch) =>
    set((state) => ({
      workspaceIncludeGlob: patch.includeGlob ?? state.workspaceIncludeGlob,
      workspaceExcludeGlob: patch.excludeGlob ?? state.workspaceExcludeGlob,
      workspaceReplacePreview: [],
    })),
  setWorkspaceResults: (results) => set({ workspaceResults: results }),
  setWorkspaceReplacePreview: (preview) => set({ workspaceReplacePreview: preview }),
  setWorkspaceSearchLoading: (loading) => set({ workspaceSearchLoading: loading }),
  setWorkspaceReplaceLoading: (loading) => set({ workspaceReplaceLoading: loading }),
  clearWorkspacePreview: () => set({ workspaceReplacePreview: [] }),
}));

export function syncWorkspaceSearchDefaultsFromSettings() {
  const defaults = useUIStore.getState().searchDefaults;
  useSearchStore.setState((state) => ({
    workspaceSearchOptions: {
      ...state.workspaceSearchOptions,
      caseSensitive: defaults.caseSensitive,
      wholeWord: defaults.wholeWord,
      useRegex: defaults.useRegex,
    },
    workspaceIncludeGlob: defaults.includeGlob,
    workspaceExcludeGlob: defaults.excludeGlob,
  }));
}
