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