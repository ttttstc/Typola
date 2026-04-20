"use strict";

// electron/preload.ts
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("electronAPI", {
  // File operations
  readFile: (filePath) => import_electron.ipcRenderer.invoke("read_file", filePath),
  writeFile: (filePath, content) => import_electron.ipcRenderer.invoke("write_file", filePath, content),
  pickFolder: () => import_electron.ipcRenderer.invoke("pick_folder"),
  listDir: (dirPath) => import_electron.ipcRenderer.invoke("list_dir", dirPath),
  createFile: (filePath) => import_electron.ipcRenderer.invoke("create_file", filePath),
  deletePath: (targetPath) => import_electron.ipcRenderer.invoke("delete_path", targetPath),
  renamePath: (oldPath, newPath) => import_electron.ipcRenderer.invoke("rename_path", oldPath, newPath),
  showSaveDialog: (options) => import_electron.ipcRenderer.invoke("show_save_dialog", options),
  saveImage: (workspaceRoot, data, ext) => import_electron.ipcRenderer.invoke("save_image", workspaceRoot, data, ext),
  // Image URL
  getImageUrl: (relativePath) => import_electron.ipcRenderer.invoke("get_image_url", relativePath),
  // Window controls
  windowMinimize: () => import_electron.ipcRenderer.invoke("window_minimize"),
  windowMaximize: () => import_electron.ipcRenderer.invoke("window_maximize"),
  windowClose: () => import_electron.ipcRenderer.invoke("window_close"),
  windowIsMaximized: () => import_electron.ipcRenderer.invoke("window_is_maximized"),
  // File watcher
  watchFile: (filePath) => import_electron.ipcRenderer.invoke("watch_file", filePath),
  unwatchFile: (filePath) => import_electron.ipcRenderer.invoke("unwatch_file", filePath),
  // Event listeners
  onFileChanged: (callback) => {
    const handler = (_, data) => callback(data);
    import_electron.ipcRenderer.on("file-changed", handler);
    return () => import_electron.ipcRenderer.removeListener("file-changed", handler);
  },
  onMaximizedChange: (callback) => {
    const handler = (_, isMaximized) => callback(isMaximized);
    import_electron.ipcRenderer.on("maximized-change", handler);
    return () => import_electron.ipcRenderer.removeListener("maximized-change", handler);
  }
});
