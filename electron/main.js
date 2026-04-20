"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// electron/main.ts
var import_electron = require("electron");
var path = __toESM(require("path"));
var fs = __toESM(require("fs"));
var mainWindow = null;
var watchedFiles = /* @__PURE__ */ new Map();
var imageCounter = 0;
function createWindow() {
  mainWindow = new import_electron.BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:1420");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
import_electron.ipcMain.handle("read_file", async (_, filePath) => {
  return fs.readFileSync(filePath, "utf-8");
});
import_electron.ipcMain.handle("write_file", async (_, filePath, content) => {
  const dir = path.dirname(filePath);
  const tempFile = path.join(dir, `.tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  fs.writeFileSync(tempFile, content, "utf-8");
  fs.renameSync(tempFile, filePath);
});
import_electron.ipcMain.handle("pick_folder", async () => {
  const result = await import_electron.dialog.showOpenDialog({
    properties: ["openDirectory"]
  });
  return result.canceled ? null : result.filePaths[0];
});
import_electron.ipcMain.handle("list_dir", async (_, dirPath) => {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(dirPath, entry.name);
    const isDir = entry.isDirectory();
    if (isDir) {
      const children = await listDirRecursive(fullPath);
      if (children.length > 0 || hasMarkdownFiles(fullPath)) {
        result.push({ name: entry.name, path: fullPath, isDir: true, children });
      }
    } else if (entry.name.endsWith(".md")) {
      result.push({ name: entry.name, path: fullPath, isDir: false });
    }
  }
  return result.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
});
function hasMarkdownFiles(dirPath) {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.isDirectory() && hasMarkdownFiles(path.join(dirPath, entry.name))) return true;
      if (entry.name.endsWith(".md")) return true;
    }
  } catch {
  }
  return false;
}
function listDirRecursive(dirPath) {
  return new Promise((resolve) => {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const result = [];
      for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;
        const fullPath = path.join(dirPath, entry.name);
        const isDir = entry.isDirectory();
        if (isDir) {
          listDirRecursive(fullPath).then((children) => {
            if (children.length > 0 || hasMarkdownFiles(fullPath)) {
              result.push({ name: entry.name, path: fullPath, isDir: true, children });
            }
          });
        } else if (entry.name.endsWith(".md")) {
          result.push({ name: entry.name, path: fullPath, isDir: false });
        }
      }
      setTimeout(() => {
        resolve(result.sort((a, b) => {
          if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
          return a.name.localeCompare(b.name);
        }));
      }, 0);
    } catch {
      resolve([]);
    }
  });
}
import_electron.ipcMain.handle("create_file", async (_, filePath) => {
  fs.writeFileSync(filePath, "", "utf-8");
});
import_electron.ipcMain.handle("delete_path", async (_, targetPath) => {
  const stat = fs.statSync(targetPath);
  if (stat.isDirectory()) {
    fs.rmSync(targetPath, { recursive: true });
  } else {
    fs.unlinkSync(targetPath);
  }
});
import_electron.ipcMain.handle("rename_path", async (_, oldPath, newPath) => {
  fs.renameSync(oldPath, newPath);
});
import_electron.ipcMain.handle("show_save_dialog", async (_, options) => {
  const result = await import_electron.dialog.showSaveDialog({
    defaultPath: options.defaultPath,
    filters: options.filters || [{ name: "Markdown", extensions: ["md"] }]
  });
  return result.canceled ? null : result.filePath;
});
import_electron.ipcMain.handle("save_image", async (_, workspaceRoot, data, ext) => {
  const resourcesDir = path.join(workspaceRoot, ".resources");
  if (!fs.existsSync(resourcesDir)) {
    fs.mkdirSync(resourcesDir, { recursive: true });
  }
  const filename = `${Date.now()}-${(++imageCounter).toString(36).slice(-8)}.${ext}`;
  const fullPath = path.join(resourcesDir, filename);
  const buffer = Buffer.from(data);
  fs.writeFileSync(fullPath, buffer);
  return `.resources/${filename}`;
});
import_electron.ipcMain.handle("get_image_url", async (_, relativePath) => {
  return "file:///" + relativePath.replace(/\\/g, "/");
});
import_electron.ipcMain.handle("window_minimize", () => {
  mainWindow?.minimize();
});
import_electron.ipcMain.handle("window_maximize", () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
import_electron.ipcMain.handle("window_close", () => {
  mainWindow?.close();
});
import_electron.ipcMain.handle("window_is_maximized", () => {
  return mainWindow?.isMaximized() ?? false;
});
import_electron.ipcMain.handle("watch_file", async (_, filePath) => {
  if (watchedFiles.has(filePath)) return;
  try {
    const watcher = fs.watch(filePath, (eventType) => {
      if (eventType === "change") {
        mainWindow?.webContents.send("file-changed", { path: filePath });
      }
    });
    watchedFiles.set(filePath, watcher);
  } catch (e) {
    console.error("Failed to watch file:", e);
  }
});
import_electron.ipcMain.handle("unwatch_file", async (_, filePath) => {
  const watcher = watchedFiles.get(filePath);
  if (watcher) {
    watcher.close();
    watchedFiles.delete(filePath);
  }
});
import_electron.app.whenReady().then(createWindow);
import_electron.app.on("window-all-closed", () => {
  watchedFiles.forEach((watcher) => watcher.close());
  watchedFiles.clear();
  if (process.platform !== "darwin") {
    import_electron.app.quit();
  }
});
import_electron.app.on("activate", () => {
  if (import_electron.BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
