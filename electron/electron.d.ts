import type { NativeMenuAction } from '../src/shared/menu';
import type {
  TerminalCreateRequest,
  TerminalCreateResult,
  TerminalExitPayload,
  TerminalResizeRequest,
  TerminalWriteRequest,
} from '../src/shared/terminal';

export interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
}

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

export interface ExportPayload {
  type: 'pdf' | 'html';
  title: string;
  html: string;
  currentFilePath: string | null;
  theme: 'light' | 'dark';
  pdf: {
    pageSize: 'A4' | 'Letter';
    margin: 'compact' | 'normal' | 'wide';
    printBackground: boolean;
    displayHeaderFooter: boolean;
  };
  htmlOptions: {
    imageMode: 'relative' | 'base64' | 'external';
  };
}

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileEntry[];
}

export interface ElectronAPI {
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  pickFolder: () => Promise<string | null>;
  pickFile: (options?: {
    filters?: { name: string; extensions: string[] }[];
  }) => Promise<string | null>;
  listDir: (path: string) => Promise<FileEntry[]>;
  createFile: (path: string) => Promise<void>;
  deletePath: (path: string) => Promise<void>;
  renamePath: (oldPath: string, newPath: string) => Promise<void>;
  showSaveDialog: (options: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => Promise<string | null>;
  saveImage: (workspaceRoot: string, data: number[], ext: string) => Promise<string>;
  getImageUrl: (relativePath: string) => Promise<string>;
  workspaceSearch: (
    workspaceRoot: string,
    query: string,
    options: SearchOptions & {
      includeGlob: string;
      excludeGlob: string;
      skipPaths?: string[];
    }
  ) => Promise<WorkspaceSearchResult[]>;
  previewWorkspaceReplace: (
    workspaceRoot: string,
    query: string,
    replacementText: string,
    options: SearchOptions & {
      includeGlob: string;
      excludeGlob: string;
      skipPaths?: string[];
    }
  ) => Promise<WorkspaceReplacePreview[]>;
  applyWorkspaceReplace: (
    changes: Array<{ filePath: string; nextContent: string }>
  ) => Promise<{ updated: number }>;
  exportDocument: (
    payload: ExportPayload
  ) => Promise<{ canceled: boolean; path?: string }>;
  setLanguagePreference: (language: 'zh' | 'en') => Promise<'zh' | 'en'>;
  termCreate: (request: TerminalCreateRequest) => Promise<TerminalCreateResult>;
  termWrite: (request: TerminalWriteRequest) => Promise<void>;
  termResize: (request: TerminalResizeRequest) => Promise<void>;
  termKill: (termId: number) => Promise<void>;
  termClear: (termId: number) => Promise<void>;
  readClipboardText: () => Promise<string>;
  writeClipboardText: (text: string) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  windowMinimize: () => Promise<void>;
  windowMaximize: () => Promise<void>;
  windowUnmaximize: () => Promise<void>;
  windowClose: () => Promise<void>;
  windowIsMaximized: () => Promise<boolean>;
  watchFile: (path: string) => Promise<void>;
  unwatchFile: (path: string) => Promise<void>;
  onFileChanged: (callback: (data: { path: string }) => void) => () => void;
  onMaximizedChange: (callback: (isMaximized: boolean) => void) => () => void;
  onTerminalData: (termId: number, callback: (data: string) => void) => () => void;
  onTerminalExit: (termId: number, callback: (data: TerminalExitPayload) => void) => () => void;
  onMenuAction: (callback: (action: NativeMenuAction) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
