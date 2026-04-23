import { contextBridge, ipcRenderer } from 'electron';
import type { AppLanguage } from '../src/shared/language';
import type { NativeMenuAction } from '../src/shared/menu';
import type {
  TerminalCreateRequest,
  TerminalCreateResult,
  TerminalExitPayload,
  TerminalResizeRequest,
  TerminalWriteRequest,
} from '../src/shared/terminal';

contextBridge.exposeInMainWorld('electronAPI', {
  // File operations
  readFile: (filePath: string) => ipcRenderer.invoke('read_file', filePath),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('write_file', filePath, content),
  pickFolder: () => ipcRenderer.invoke('pick_folder'),
  pickFile: (options?: { filters?: { name: string; extensions: string[] }[] }) =>
    ipcRenderer.invoke('pick_file', options),
  listDir: (dirPath: string) => ipcRenderer.invoke('list_dir', dirPath),
  createFile: (filePath: string) => ipcRenderer.invoke('create_file', filePath),
  deletePath: (targetPath: string) => ipcRenderer.invoke('delete_path', targetPath),
  renamePath: (oldPath: string, newPath: string) => ipcRenderer.invoke('rename_path', oldPath, newPath),
  showSaveDialog: (options: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => ipcRenderer.invoke('show_save_dialog', options),
  saveImage: (workspaceRoot: string, data: number[], ext: string) => ipcRenderer.invoke('save_image', workspaceRoot, data, ext),
  getImageUrl: (relativePath: string) => ipcRenderer.invoke('get_image_url', relativePath),
  workspaceSearch: (
    workspaceRoot: string,
    query: string,
    options: {
      caseSensitive: boolean;
      wholeWord: boolean;
      useRegex: boolean;
      includeGlob: string;
      excludeGlob: string;
      skipPaths?: string[];
    }
  ) => ipcRenderer.invoke('workspace_search', workspaceRoot, query, options),
  previewWorkspaceReplace: (
    workspaceRoot: string,
    query: string,
    replacementText: string,
    options: {
      caseSensitive: boolean;
      wholeWord: boolean;
      useRegex: boolean;
      includeGlob: string;
      excludeGlob: string;
      skipPaths?: string[];
    }
  ) => ipcRenderer.invoke('preview_workspace_replace', workspaceRoot, query, replacementText, options),
  applyWorkspaceReplace: (changes: Array<{ filePath: string; nextContent: string }>) =>
    ipcRenderer.invoke('apply_workspace_replace', changes),
  getRecentFiles: () => ipcRenderer.invoke('get_recent_files'),
  addRecentFile: (filePath: string) => ipcRenderer.invoke('add_recent_file', filePath),
  clearRecentFiles: () => ipcRenderer.invoke('clear_recent_files'),
  onRecentFilesChanged: (
    callback: (entries: Array<{ path: string; addedAt: number }>) => void
  ) => {
    const handler = (
      _: Electron.IpcRendererEvent,
      entries: Array<{ path: string; addedAt: number }>
    ) => callback(entries);
    ipcRenderer.on('recent-files-changed', handler);
    return () => ipcRenderer.removeListener('recent-files-changed', handler);
  },
  onOpenRecentFile: (callback: (filePath: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, filePath: string) => callback(filePath);
    ipcRenderer.on('open-recent-file', handler);
    return () => ipcRenderer.removeListener('open-recent-file', handler);
  },
  exportDocument: (payload: {
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
  }) => ipcRenderer.invoke('export_document', payload),
  setLanguagePreference: (language: AppLanguage) => ipcRenderer.invoke('set_language_preference', language),
  termCreate: (request: TerminalCreateRequest): Promise<TerminalCreateResult> =>
    ipcRenderer.invoke('term_create', request),
  termWrite: (request: TerminalWriteRequest) => ipcRenderer.invoke('term_write', request),
  termResize: (request: TerminalResizeRequest) => ipcRenderer.invoke('term_resize', request),
  termKill: (termId: number) => ipcRenderer.invoke('term_kill', termId),
  termClear: (termId: number) => ipcRenderer.invoke('term_clear', termId),
  readClipboardText: () => ipcRenderer.invoke('clipboard_read_text'),
  writeClipboardText: (text: string) => ipcRenderer.invoke('clipboard_write_text', text),
  openExternal: (url: string) => ipcRenderer.invoke('open_external', url),
  // Window controls
  windowMinimize: () => ipcRenderer.invoke('window_minimize'),
  windowMaximize: () => ipcRenderer.invoke('window_maximize'),
  windowUnmaximize: () => ipcRenderer.invoke('window_unmaximize'),
  windowToggleMaximize: () => ipcRenderer.invoke('window_toggle_maximize'),
  windowClose: () => ipcRenderer.invoke('window_close'),
  windowIsMaximized: () => ipcRenderer.invoke('window_is_maximized'),
  // File watcher
  watchFile: (filePath: string) => ipcRenderer.invoke('watch_file', filePath),
  unwatchFile: (filePath: string) => ipcRenderer.invoke('unwatch_file', filePath),
  // Event listeners
  onFileChanged: (callback: (data: { path: string }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { path: string }) => callback(data);
    ipcRenderer.on('file-changed', handler);
    return () => ipcRenderer.removeListener('file-changed', handler);
  },
  onMaximizedChange: (callback: (isMaximized: boolean) => void) => {
    const handler = (_: Electron.IpcRendererEvent, isMaximized: boolean) => callback(isMaximized);
    ipcRenderer.on('maximized-change', handler);
    return () => ipcRenderer.removeListener('maximized-change', handler);
  },
  onTerminalData: (termId: number, callback: (data: string) => void) => {
    const channel = `term_data_${termId}`;
    const handler = (_: Electron.IpcRendererEvent, data: string) => callback(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  onTerminalExit: (termId: number, callback: (data: TerminalExitPayload) => void) => {
    const channel = `term_exit_${termId}`;
    const handler = (_: Electron.IpcRendererEvent, data: TerminalExitPayload) => callback(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  onMenuAction: (callback: (action: NativeMenuAction) => void) => {
    const handler = (_: Electron.IpcRendererEvent, action: NativeMenuAction) => callback(action);
    ipcRenderer.on('menu-action', handler);
    return () => ipcRenderer.removeListener('menu-action', handler);
  },
});
