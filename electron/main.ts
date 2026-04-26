import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { matchesWatchedFile, rememberRecentWrite, shouldIgnoreWatchEvent } from './fileWatch';
import {
  ExportPayload,
  buildExportDocumentHtml,
  getPdfPrintOptions,
  rewriteHtmlImages,
} from './export';
import { SearchOptions, previewReplaceText, searchText, shouldSearchPath } from '../src/shared/search';
import { getAISettingsSummary, getResolvedAISettings, saveAISettings } from './aiConfig';
import { generateText, testConnection as testLLMConnection } from '../src/llm';
import {
  AIRightClickRequest,
  AIRightClickAction,
  AIProviderSetupInput,
  serializeLLMError,
  getProviderLabel,
  LLMError,
} from '../src/llm/types';

let mainWindow: BrowserWindow | null = null;
const watchedFiles = new Map<string, fs.FSWatcher>();
const recentWrites = new Map<string, number>();
let imageCounter = 0;

const SEARCHABLE_EXTENSIONS = new Set(['.md', '.markdown', '.mdx', '.txt']);

interface WorkspaceSearchRequest extends SearchOptions {
  includeGlob: string;
  excludeGlob: string;
  skipPaths?: string[];
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
    : payload.title.replace(/\.[^.]+$/, '') || 'Untitled';
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

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('maximized-change', true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('maximized-change', false);
  });
}

function buildAIActionMessages(action: AIRightClickAction, text: string) {
  const trimmedText = text.trim();
  if (!trimmedText) {
    throw new LLMError('invalid_request', 'Selected text is empty.');
  }

  const baseSystem =
    'You are a precise writing assistant inside Typola. Return only the final answer text. Do not add explanations, prefixes, or markdown fences.';

  const prompts: Record<AIRightClickAction, string> = {
    explain: `Explain the following text in simpler terms while preserving its meaning.\n\n${trimmedText}`,
    rewrite: `Rewrite the following text to make it clearer and more polished. Keep the original language unless the text itself requests another language.\n\n${trimmedText}`,
    summarize: `Condense the following text. Keep the key facts and remove repetition.\n\n${trimmedText}`,
    translate: `Translate the following text into the other language between English and Simplified Chinese. If the source text is mainly Chinese, translate it to English. Otherwise translate it to Simplified Chinese. Preserve names, formatting, and technical terms when needed.\n\n${trimmedText}`,
  };

  return [
    { role: 'system' as const, content: baseSystem },
    { role: 'user' as const, content: prompts[action] },
  ];
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

ipcMain.handle('get_ai_settings', () => {
  return getAISettingsSummary();
});

ipcMain.handle('save_ai_settings', (_, input: AIProviderSetupInput) => {
  return saveAISettings(input);
});

ipcMain.handle('test_ai_connection', async () => {
  try {
    const settings = getResolvedAISettings();
    await testLLMConnection(settings);
    return {
      ok: true,
      data: {
        providerLabel: getProviderLabel(settings),
        model: settings.model,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: serializeLLMError(error),
    };
  }
});

ipcMain.handle('run_ai_action', async (_, request: AIRightClickRequest) => {
  try {
    const settings = getResolvedAISettings();
    const response = await generateText(settings, {
      model: settings.model,
      temperature: request.action === 'rewrite' ? 0.4 : 0.2,
      maxTokens: 1024,
      messages: buildAIActionMessages(request.action, request.text),
    });

    return {
      ok: true,
      data: {
        text: response.text.trim(),
        action: request.action,
        providerLabel: getProviderLabel(settings),
        model: settings.model,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: serializeLLMError(error),
    };
  }
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

// Recent files/workspaces handlers
const recentDataPath = path.join(app.getPath('userData'), 'recent.json');

interface RecentEntry {
  path: string;
  name: string;
  timestamp: number;
}

function loadRecentData(): { files: RecentEntry[]; workspaces: RecentEntry[] } {
  try {
    if (fs.existsSync(recentDataPath)) {
      return JSON.parse(fs.readFileSync(recentDataPath, 'utf-8'));
    }
  } catch {}
  return { files: [], workspaces: [] };
}

function saveRecentData(data: { files: RecentEntry[]; workspaces: RecentEntry[] }) {
  fs.writeFileSync(recentDataPath, JSON.stringify(data, null, 2));
}

ipcMain.handle('get_recent_files', () => {
  return loadRecentData();
});

ipcMain.handle('add_recent_file', (_, filePath: string) => {
  const data = loadRecentData();
  const name = path.basename(filePath);
  data.files = [
    { path: filePath, name, timestamp: Date.now() },
    ...data.files.filter((f) => f.path !== filePath),
  ].slice(0, 10);
  saveRecentData(data);
});

ipcMain.handle('add_recent_workspace', (_, workspacePath: string) => {
  const data = loadRecentData();
  const name = path.basename(workspacePath);
  data.workspaces = [
    { path: workspacePath, name, timestamp: Date.now() },
    ...data.workspaces.filter((w) => w.path !== workspacePath),
  ].slice(0, 5);
  saveRecentData(data);
});

ipcMain.handle('clear_recent_files', () => {
  const data = loadRecentData();
  data.files = [];
  saveRecentData(data);
});

ipcMain.handle('clear_recent_workspaces', () => {
  const data = loadRecentData();
  data.workspaces = [];
  saveRecentData(data);
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
