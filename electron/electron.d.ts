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
  listDir: (path: string) => Promise<FileEntry[]>;
  createFile: (path: string) => Promise<void>;
  deletePath: (path: string) => Promise<void>;
  renamePath: (oldPath: string, newPath: string) => Promise<void>;
  showSaveDialog: (options: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => Promise<string | null>;
  saveImage: (workspaceRoot: string, data: number[], ext: string) => Promise<string>;
  getImageUrl: (relativePath: string) => Promise<string>;
  windowMinimize: () => Promise<void>;
  windowMaximize: () => Promise<void>;
  windowClose: () => Promise<void>;
  windowIsMaximized: () => Promise<boolean>;
  watchFile: (path: string) => Promise<void>;
  unwatchFile: (path: string) => Promise<void>;
  onFileChanged: (callback: (data: { path: string }) => void) => () => void;
  onMaximizedChange: (callback: (isMaximized: boolean) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
