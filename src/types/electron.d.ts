interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
}

interface WorkspaceSearchMatch {
  lineNumber: number;
  column: number;
  lineText: string;
  matchText: string;
  contextBefore: string[];
  contextAfter: string[];
}

interface WorkspaceSearchResult {
  filePath: string;
  relativePath: string;
  matches: WorkspaceSearchMatch[];
  totalMatches: number;
}

interface WorkspaceReplacePreview {
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

interface ExportPayload {
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

interface ElectronAPI {
  // File operations
  readFile: (filePath: string) => Promise<string>;
  writeFile: (filePath: string, content: string) => Promise<void>;
  pickFolder: () => Promise<string | null>;
  listDir: (dirPath: string) => Promise<FileEntry[]>;
  createFile: (filePath: string) => Promise<void>;
  deletePath: (targetPath: string) => Promise<void>;
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
  // Window controls
  windowMinimize: () => Promise<void>;
  windowMaximize: () => Promise<void>;
  windowUnmaximize: () => Promise<void>;
  windowClose: () => Promise<void>;
  windowIsMaximized: () => Promise<boolean>;
  // File watcher
  watchFile: (filePath: string) => Promise<void>;
  unwatchFile: (filePath: string) => Promise<void>;
  // Event listeners
  onFileChanged: (callback: (data: { path: string }) => void) => () => void;
  onMaximizedChange: (callback: (isMaximized: boolean) => void) => () => void;
}

interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileEntry[];
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
