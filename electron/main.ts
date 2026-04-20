import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

let mainWindow: BrowserWindow | null = null;
const watchedFiles = new Map<string, fs.FSWatcher>();
let imageCounter = 0;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:1420');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.handle('read_file', async (_, filePath: string) => {
  return fs.readFileSync(filePath, 'utf-8');
});

ipcMain.handle('write_file', async (_, filePath: string, content: string) => {
  const dir = path.dirname(filePath);
  const tempFile = path.join(dir, `.tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  fs.writeFileSync(tempFile, content, 'utf-8');
  fs.renameSync(tempFile, filePath);
});

ipcMain.handle('pick_folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

function hasMarkdownFiles(dirPath: string): boolean {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.isDirectory() && hasMarkdownFiles(path.join(dirPath, entry.name))) return true;
      if (entry.name.endsWith('.md')) return true;
    }
  } catch {}
  return false;
}

interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileEntry[];
}

function listDirRecursive(dirPath: string): Promise<FileEntry[]> {
  return new Promise((resolve) => {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const result: FileEntry[] = [];
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const fullPath = path.join(dirPath, entry.name);
        const isDir = entry.isDirectory();
        if (isDir) {
          listDirRecursive(fullPath).then((children) => {
            if (children.length > 0 || hasMarkdownFiles(fullPath)) {
              result.push({ name: entry.name, path: fullPath, isDir: true, children });
            }
          });
        } else if (entry.name.endsWith('.md')) {
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

ipcMain.handle('list_dir', async (_, dirPath: string) => {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const result: FileEntry[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(dirPath, entry.name);
    const isDir = entry.isDirectory();
    if (isDir) {
      const children = await listDirRecursive(fullPath);
      if (children.length > 0 || hasMarkdownFiles(fullPath)) {
        result.push({ name: entry.name, path: fullPath, isDir: true, children });
      }
    } else if (entry.name.endsWith('.md')) {
      result.push({ name: entry.name, path: fullPath, isDir: false });
    }
  }
  return result.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
});

ipcMain.handle('create_file', async (_, filePath: string) => {
  fs.writeFileSync(filePath, '', 'utf-8');
});

ipcMain.handle('delete_path', async (_, targetPath: string) => {
  const stat = fs.statSync(targetPath);
  if (stat.isDirectory()) {
    fs.rmSync(targetPath, { recursive: true });
  } else {
    fs.unlinkSync(targetPath);
  }
});

ipcMain.handle('rename_path', async (_, oldPath: string, newPath: string) => {
  fs.renameSync(oldPath, newPath);
});

ipcMain.handle('show_save_dialog', async (_, options: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => {
  const result = await dialog.showSaveDialog({
    defaultPath: options.defaultPath,
    filters: options.filters || [{ name: 'Markdown', extensions: ['md'] }],
  });
  return result.canceled ? null : result.filePath;
});

ipcMain.handle('save_image', async (_, workspaceRoot: string, data: number[], ext: string) => {
  const resourcesDir = path.join(workspaceRoot, '.resources');
  if (!fs.existsSync(resourcesDir)) {
    fs.mkdirSync(resourcesDir, { recursive: true });
  }
  const filename = `${Date.now()}-${(++imageCounter).toString(36).slice(-8)}.${ext}`;
  const fullPath = path.join(resourcesDir, filename);
  const buffer = Buffer.from(data);
  fs.writeFileSync(fullPath, buffer);
  return `.resources/${filename}`;
});

ipcMain.handle('get_image_url', async (_, relativePath: string) => {
  return 'file:///' + relativePath.replace(/\\/g, '/');
});

ipcMain.handle('window_minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('window_maximize', () => {
  mainWindow?.maximize();
});

ipcMain.handle('window_unmaximize', () => {
  mainWindow?.unmaximize();
});

ipcMain.handle('window_close', () => {
  mainWindow?.close();
});

ipcMain.handle('window_is_maximized', () => {
  return mainWindow?.isMaximized() ?? false;
});

ipcMain.handle('watch_file', async (_, filePath: string) => {
  if (watchedFiles.has(filePath)) return;
  try {
    const watcher = fs.watch(filePath, (eventType) => {
      if (eventType === 'change') {
        mainWindow?.webContents.send('file-changed', { path: filePath });
      }
    });
    watchedFiles.set(filePath, watcher);
  } catch (e) {
    console.error('Failed to watch file:', e);
  }
});

ipcMain.handle('unwatch_file', async (_, filePath: string) => {
  const watcher = watchedFiles.get(filePath);
  if (watcher) {
    watcher.close();
    watchedFiles.delete(filePath);
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  watchedFiles.forEach((watcher) => watcher.close());
  watchedFiles.clear();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});