import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // File operations
  readFile: (filePath: string) => ipcRenderer.invoke('read_file', filePath),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('write_file', filePath, content),
  pickFolder: () => ipcRenderer.invoke('pick_folder'),
  listDir: (dirPath: string) => ipcRenderer.invoke('list_dir', dirPath),
  createFile: (filePath: string) => ipcRenderer.invoke('create_file', filePath),
  deletePath: (targetPath: string) => ipcRenderer.invoke('delete_path', targetPath),
  renamePath: (oldPath: string, newPath: string) => ipcRenderer.invoke('rename_path', oldPath, newPath),
  showSaveDialog: (options: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => ipcRenderer.invoke('show_save_dialog', options),
  saveImage: (workspaceRoot: string, data: number[], ext: string) => ipcRenderer.invoke('save_image', workspaceRoot, data, ext),
  getImageUrl: (relativePath: string) => ipcRenderer.invoke('get_image_url', relativePath),
  // Window controls
  windowMinimize: () => ipcRenderer.invoke('window_minimize'),
  windowMaximize: () => ipcRenderer.invoke('window_maximize'),
  windowUnmaximize: () => ipcRenderer.invoke('window_unmaximize'),
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
});