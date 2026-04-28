import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, shell, type MenuItemConstructorOptions } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { buildMarkdownFileTree, pathExists } from './fileTree';
import { matchesWatchedFile, rememberRecentWrite, shouldIgnoreWatchEvent } from './fileWatch';
import { extractOpenDocumentPaths } from './openTargets';
import {
  addRecentFile,
  loadRecentFiles,
  pruneMissingRecentFiles,
  saveRecentFiles,
  type RecentEntry,
} from './recentFiles';
import {
  ExportPayload,
  buildExportDocumentHtml,
  getPdfPrintOptions,
  rewriteHtmlImages,
} from './export';
import { SearchOptions, previewReplaceText, searchText, shouldSearchPath } from '../src/shared/search';
import { resolveLanguage, type AppLanguage } from '../src/shared/language';
import type { NativeMenuAction } from '../src/shared/menu';
import type { TerminalCreateRequest, TerminalResizeRequest, TerminalWriteRequest } from '../src/shared/terminal';
import en from '../src/locales/en.json';
import zh from '../src/locales/zh.json';
import {
  clearTerminal,
  createTerminal,
  killAllTerminals,
  killTerminal,
  resizeTerminal,
  writeTerminal,
} from './terminal';

let mainWindow: BrowserWindow | null = null;
const watchedFiles = new Map<string, fs.FSWatcher>();
const recentWrites = new Map<string, number>();
let imageCounter = 0;
let currentLanguage: AppLanguage = resolveLanguage(app.getLocale(), 'en');
let recentFiles: RecentEntry[] = [];
let rendererReady = false;
const pendingOpenFilePaths: string[] = [];
const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.quit();
}

function getUserDataDir() {
  return app.getPath('userData');
}

function notifyRecentFilesChanged() {
  mainWindow?.webContents.send('recent-files-changed', recentFiles);
}

function registerRecentFile(filePath: string) {
  if (!filePath) return;
  recentFiles = addRecentFile(recentFiles, filePath);
  saveRecentFiles(getUserDataDir(), recentFiles);
  buildNativeMenu();
  notifyRecentFilesChanged();
}

function clearRecentFiles() {
  recentFiles = [];
  saveRecentFiles(getUserDataDir(), recentFiles);
  buildNativeMenu();
  notifyRecentFilesChanged();
}

function focusMainWindow() {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.focus();
}

function flushPendingOpenFiles() {
  if (!mainWindow || !rendererReady || pendingOpenFilePaths.length === 0) {
    return;
  }

  while (pendingOpenFilePaths.length > 0) {
    const filePath = pendingOpenFilePaths.shift();
    if (!filePath) {
      continue;
    }

    mainWindow.webContents.send('open-recent-file', filePath);
  }
}

async function queueOpenFile(filePath: string) {
  const normalizedPath = path.normalize(filePath);
  if (!(await pathExists(normalizedPath))) {
    return;
  }

  registerRecentFile(normalizedPath);

  if (!mainWindow || !rendererReady) {
    if (!pendingOpenFilePaths.includes(normalizedPath)) {
      pendingOpenFilePaths.push(normalizedPath);
    }
    return;
  }

  mainWindow.webContents.send('open-recent-file', normalizedPath);
}

function queueOpenFilesFromArgs(argv: string[]) {
  extractOpenDocumentPaths(argv).forEach((filePath) => {
    void queueOpenFile(filePath);
  });
}

const SEARCHABLE_EXTENSIONS = new Set(['.md', '.markdown', '.mdx', '.txt']);
const translations = { en, zh } as const;

interface WorkspaceSearchRequest extends SearchOptions {
  includeGlob: string;
  excludeGlob: string;
  skipPaths?: string[];
}

function translate(language: AppLanguage, key: string) {
  const segments = key.split('.');
  let value: unknown = translations[language];

  for (const segment of segments) {
    if (!value || typeof value !== 'object') {
      return key;
    }

    value = (value as Record<string, unknown>)[segment];
  }

  return typeof value === 'string' ? value : key;
}

function sendMenuAction(action: NativeMenuAction) {
  mainWindow?.webContents.send('menu-action', action);
}

function buildNativeMenu() {
  const t = (key: string) => translate(currentLanguage, key);
  const recentSubmenu: MenuItemConstructorOptions[] = recentFiles.length === 0
    ? [{ label: t('menu.noRecentFiles'), enabled: false }]
    : [
        ...recentFiles.map<MenuItemConstructorOptions>((entry) => ({
          label: entry.path,
          click: () => mainWindow?.webContents.send('open-recent-file', entry.path),
        })),
        { type: 'separator' as const },
        { label: t('menu.clearRecentFiles'), click: () => clearRecentFiles() },
      ];

  const template: MenuItemConstructorOptions[] = [
    {
      label: t('menu.file'),
      submenu: [
        { label: t('menu.newFile'), accelerator: 'Ctrl+N', click: () => sendMenuAction('new-file') },
        { label: t('menu.openFile'), accelerator: 'Ctrl+O', click: () => sendMenuAction('open-file') },
        { label: t('menu.openFolder'), accelerator: 'Ctrl+Shift+O', click: () => sendMenuAction('open-folder') },
        { label: t('menu.openRecent'), submenu: recentSubmenu },
        { type: 'separator' },
        { label: t('menu.save'), accelerator: 'Ctrl+S', click: () => sendMenuAction('save') },
        { label: t('menu.saveAs'), click: () => sendMenuAction('save-as') },
        { type: 'separator' },
        { label: t('menu.exportPdf'), click: () => sendMenuAction('export-pdf') },
        { label: t('menu.exportHtml'), click: () => sendMenuAction('export-html') },
        { type: 'separator' },
        { label: t('menu.exit'), role: 'quit' },
      ],
    },
    {
      label: t('menu.edit'),
      submenu: [
        { label: t('menu.undo'), accelerator: 'Ctrl+Z', click: () => sendMenuAction('undo') },
        { label: t('menu.redo'), accelerator: 'Ctrl+Shift+Z', click: () => sendMenuAction('redo') },
        { label: t('menu.find'), accelerator: 'Ctrl+F', click: () => sendMenuAction('find-in-file') },
        {
          label: t('menu.findInWorkspace'),
          accelerator: 'Ctrl+Shift+F',
          click: () => sendMenuAction('find-in-workspace'),
        },
        { type: 'separator' },
        { label: t('menu.selectAll'), accelerator: 'Ctrl+A', click: () => sendMenuAction('select-all') },
      ],
    },
    {
      label: t('menu.paragraph'),
      submenu: [
        { label: t('menu.heading1'), accelerator: 'Ctrl+1', click: () => sendMenuAction('heading-1') },
        { label: t('menu.heading2'), accelerator: 'Ctrl+2', click: () => sendMenuAction('heading-2') },
        { label: t('menu.heading3'), accelerator: 'Ctrl+3', click: () => sendMenuAction('heading-3') },
        { label: t('menu.body'), accelerator: 'Ctrl+0', click: () => sendMenuAction('body') },
        { type: 'separator' },
        { label: t('menu.orderedList'), click: () => sendMenuAction('ordered-list') },
        { label: t('menu.unorderedList'), click: () => sendMenuAction('unordered-list') },
        { label: t('menu.quote'), click: () => sendMenuAction('blockquote') },
      ],
    },
    {
      label: t('menu.format'),
      submenu: [
        { label: t('menu.bold'), accelerator: 'Ctrl+B', click: () => sendMenuAction('bold') },
        { label: t('menu.italic'), accelerator: 'Ctrl+I', click: () => sendMenuAction('italic') },
        {
          label: t('menu.strikethrough'),
          accelerator: 'Ctrl+Shift+S',
          click: () => sendMenuAction('strikethrough'),
        },
        { label: t('menu.inlineCode'), click: () => sendMenuAction('inline-code') },
        { type: 'separator' },
        { label: t('menu.link'), accelerator: 'Ctrl+K', click: () => sendMenuAction('link') },
      ],
    },
    {
      label: t('menu.view'),
      submenu: [
        { label: t('menu.sidebar'), accelerator: 'Ctrl+\\', click: () => sendMenuAction('toggle-sidebar') },
        {
          label: t('menu.outline'),
          accelerator: 'Ctrl+Shift+\\',
          click: () => sendMenuAction('toggle-outline'),
        },
        {
          label: t('menu.terminal'),
          accelerator: 'Ctrl+`',
          click: () => sendMenuAction('toggle-terminal'),
        },
        {
          label: t('menu.newTerminal'),
          accelerator: 'Ctrl+Shift+`',
          click: () => sendMenuAction('new-terminal'),
        },
        { type: 'separator' },
        { label: t('menu.zoomIn'), click: () => sendMenuAction('zoom-in') },
        { label: t('menu.zoomOut'), click: () => sendMenuAction('zoom-out') },
        { type: 'separator' },
        {
          label: t('shortcuts.toggleTheme'),
          accelerator: 'Ctrl+Shift+D',
          click: () => sendMenuAction('toggle-theme'),
        },
      ],
    },
    {
      label: t('menu.settings'),
      submenu: [
        { label: t('menu.settings'), accelerator: 'Ctrl+,', click: () => sendMenuAction('open-settings') },
        { label: t('menu.exportSettings'), click: () => sendMenuAction('open-export-settings') },
        { label: t('menu.shortcuts'), click: () => sendMenuAction('open-shortcuts') },
        { type: 'separator' },
        {
          label: currentLanguage === 'zh' ? t('menu.switchToEnglish') : t('menu.switchToChinese'),
          click: () => sendMenuAction('toggle-language'),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function writeFileAtomically(filePath: string, content: string) {
  const dir = path.dirname(filePath);
  const tempFile = path.join(dir, `.tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  fs.writeFileSync(tempFile, content, 'utf-8');
  rememberRecentWrite(recentWrites, filePath);
  fs.renameSync(tempFile, filePath);
}

function collectWorkspaceFiles(rootDir: string) {
  const files: string[] = [];
  const queue = [rootDir];

  while (queue.length > 0) {
    const currentDir = queue.shift();
    if (!currentDir) continue;

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'release') {
        continue;
      }

      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }

      if (!SEARCHABLE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        continue;
      }

      files.push(fullPath);
    }
  }

  return files;
}

function relativeWorkspacePath(workspaceRoot: string, filePath: string) {
  return path.relative(workspaceRoot, filePath).replace(/\\/g, '/');
}

async function exportDocument(payload: ExportPayload) {
  const baseName = payload.currentFilePath
    ? path.parse(payload.currentFilePath).name
    : payload.title.replace(/\.[^.]+$/, '') || translate(currentLanguage, 'fileTree.untitled');
  const extension = payload.type === 'pdf' ? 'pdf' : 'html';
  const defaultPath = payload.currentFilePath
    ? path.join(path.dirname(payload.currentFilePath), `${baseName}.${extension}`)
    : `${baseName}.${extension}`;

  const selectedPath = await dialog.showSaveDialog({
    defaultPath,
    filters: [
      {
        name: payload.type.toUpperCase(),
        extensions: [extension],
      },
    ],
  });

  if (selectedPath.canceled || !selectedPath.filePath) {
    return { canceled: true };
  }

  if (payload.type === 'html') {
    const bodyHtml = rewriteHtmlImages(
      payload.html,
      payload.currentFilePath,
      selectedPath.filePath,
      payload.htmlOptions.imageMode
    );
    const documentHtml = buildExportDocumentHtml(payload.title, bodyHtml, payload.theme, {
      forPrint: false,
    });
    fs.writeFileSync(selectedPath.filePath, documentHtml, 'utf-8');
    return { canceled: false, path: selectedPath.filePath };
  }

  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
    },
  });

  try {
    const bodyHtml = rewriteHtmlImages(
      payload.html,
      payload.currentFilePath,
      selectedPath.filePath,
      'base64'
    );
    const documentHtml = buildExportDocumentHtml(payload.title, bodyHtml, payload.theme, {
      forPrint: true,
      pageSize: payload.pdf.pageSize,
      margin: payload.pdf.margin,
    });
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(documentHtml)}`);
    await printWindow.webContents.executeJavaScript(
      'document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : Promise.resolve(true)'
    );
    const pdfBuffer = await printWindow.webContents.printToPDF(getPdfPrintOptions(payload.pdf));
    fs.writeFileSync(selectedPath.filePath, pdfBuffer);
    return { canceled: false, path: selectedPath.filePath };
  } finally {
    if (!printWindow.isDestroyed()) {
      printWindow.close();
    }
  }
}

function createWindow() {
  buildNativeMenu();
  rendererReady = false;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    icon: path.join(__dirname, 'typola.ico'),
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

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('maximized-change', true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('maximized-change', false);
  });

  // Kill PTYs before the window/webContents are destroyed so any in-flight
  // node-pty data callbacks don't try to send to a destroyed WebContents.
  mainWindow.on('close', () => {
    killAllTerminals();
  });

  mainWindow.on('closed', () => {
    killAllTerminals();
    rendererReady = false;
    mainWindow = null;
  });
}

ipcMain.handle('read_file', async (_, filePath: string) => {
  return fs.readFileSync(filePath, 'utf-8');
});

ipcMain.handle('write_file', async (_, filePath: string, content: string) => {
  writeFileAtomically(filePath, content);
});

ipcMain.handle('pick_folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle(
  'pick_file',
  async (_, options?: { filters?: { name: string; extensions: string[] }[] }) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: options?.filters ?? [
        { name: 'Markdown', extensions: ['md', 'markdown'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    return result.canceled ? null : result.filePaths[0];
  }
);

ipcMain.handle('list_dir', async (_, dirPath: string) => {
  return buildMarkdownFileTree(dirPath);
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
    filters: options.filters || [{ name: translate(currentLanguage, 'common.markdown'), extensions: ['md'] }],
  });
  return result.canceled ? null : result.filePath;
});

ipcMain.handle('path_exists', async (_, targetPath: string) => pathExists(targetPath));

ipcMain.handle('set_language_preference', async (_, language: string) => {
  currentLanguage = resolveLanguage(language, currentLanguage);
  buildNativeMenu();
  return currentLanguage;
});

ipcMain.handle('term_create', async (_, request: TerminalCreateRequest) => {
  if (!mainWindow) {
    throw new Error('Main window is not ready');
  }

  return createTerminal(mainWindow.webContents, request);
});

ipcMain.handle('term_write', async (_, request: TerminalWriteRequest) => {
  writeTerminal(request.termId, request.data);
});

ipcMain.handle('term_resize', async (_, request: TerminalResizeRequest) => {
  resizeTerminal(request.termId, request.cols, request.rows);
});

ipcMain.handle('term_kill', async (_, termId: number) => {
  killTerminal(termId);
});

ipcMain.handle('term_clear', async (_, termId: number) => {
  clearTerminal(termId);
});

ipcMain.handle('clipboard_read_text', async () => clipboard.readText());

ipcMain.handle('clipboard_write_text', async (_, text: string) => {
  clipboard.writeText(text);
});

ipcMain.handle('open_external', async (_, url: string) => {
  await shell.openExternal(url);
});

ipcMain.handle('workspace_search', async (_, workspaceRoot: string, query: string, request: WorkspaceSearchRequest) => {
  const results = collectWorkspaceFiles(workspaceRoot)
    .map((filePath) => {
      const relativePath = relativeWorkspacePath(workspaceRoot, filePath);
      if (!shouldSearchPath(relativePath, request.includeGlob, request.excludeGlob)) {
        return null;
      }

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const matches = searchText(content, query, request, 1);
        if (matches.length === 0) return null;

        return {
          filePath,
          relativePath,
          totalMatches: matches.length,
          matches: matches.map((match) => ({
            lineNumber: match.lineNumber,
            column: match.column,
            lineText: match.lineText,
            matchText: match.matchText,
            contextBefore: match.contextBefore,
            contextAfter: match.contextAfter,
          })),
        };
      } catch {
        return null;
      }
    })
    .filter((result): result is NonNullable<typeof result> => result !== null)
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  return results;
});

ipcMain.handle(
  'preview_workspace_replace',
  async (_, workspaceRoot: string, query: string, replacementText: string, request: WorkspaceSearchRequest) => {
    const skippedPaths = new Set(request.skipPaths ?? []);

    const results = collectWorkspaceFiles(workspaceRoot)
      .map((filePath) => {
        if (skippedPaths.has(filePath)) {
          return null;
        }

        const relativePath = relativeWorkspacePath(workspaceRoot, filePath);
        if (!shouldSearchPath(relativePath, request.includeGlob, request.excludeGlob)) {
          return null;
        }

        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const preview = previewReplaceText(content, query, replacementText, request);

          if (preview.replacementCount === 0) {
            return null;
          }

          return {
            filePath,
            relativePath,
            replacementCount: preview.replacementCount,
            nextContent: preview.nextContent,
            changes: preview.changes,
          };
        } catch {
          return null;
        }
      })
      .filter((result): result is NonNullable<typeof result> => result !== null)
      .sort((left, right) => left.relativePath.localeCompare(right.relativePath));

    return results;
  }
);

ipcMain.handle(
  'apply_workspace_replace',
  async (_, changes: Array<{ filePath: string; nextContent: string }>) => {
    for (const change of changes) {
      writeFileAtomically(change.filePath, change.nextContent);
    }

    return { updated: changes.length };
  }
);

ipcMain.handle('export_document', async (_, payload: ExportPayload) => exportDocument(payload));

ipcMain.handle('get_recent_files', async () => recentFiles);

ipcMain.handle('add_recent_file', async (_, filePath: string) => {
  registerRecentFile(filePath);
  return recentFiles;
});

ipcMain.handle('clear_recent_files', async () => {
  clearRecentFiles();
  return recentFiles;
});

ipcMain.on('renderer_ready', () => {
  rendererReady = true;
  flushPendingOpenFiles();
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

ipcMain.handle('window_toggle_maximize', () => {
  if (!mainWindow) {
    return false;
  }

  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
    return false;
  }

  mainWindow.maximize();
  return true;
});

ipcMain.handle('watch_file', async (_, filePath: string) => {
  if (watchedFiles.has(filePath)) return;
  try {
    const watcher = fs.watch(path.dirname(filePath), (_eventType, filename) => {
      if (!matchesWatchedFile(filePath, filename)) return;
      if (shouldIgnoreWatchEvent(recentWrites, filePath)) return;

      if (fs.existsSync(filePath)) {
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

if (singleInstanceLock) {
  app.on('second-instance', (_event, commandLine) => {
    focusMainWindow();
    queueOpenFilesFromArgs(commandLine);
  });

  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    focusMainWindow();
    void queueOpenFile(filePath);
  });

  app.whenReady().then(() => {
    recentFiles = pruneMissingRecentFiles(loadRecentFiles(getUserDataDir()));
    saveRecentFiles(getUserDataDir(), recentFiles);
    buildNativeMenu();
    createWindow();
    queueOpenFilesFromArgs(process.argv);
  });
}

app.on('window-all-closed', () => {
  watchedFiles.forEach((watcher) => watcher.close());
  watchedFiles.clear();
  killAllTerminals();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
