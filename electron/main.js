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
var path3 = __toESM(require("path"));
var fs2 = __toESM(require("fs"));

// electron/fileWatch.ts
var path = __toESM(require("path"));
var SELF_WRITE_GRACE_MS = 1500;
function rememberRecentWrite(recentWrites2, filePath, now = Date.now()) {
  recentWrites2.set(filePath, now);
}
function shouldIgnoreWatchEvent(recentWrites2, filePath, now = Date.now(), graceMs = SELF_WRITE_GRACE_MS) {
  const lastWrittenAt = recentWrites2.get(filePath);
  if (lastWrittenAt === void 0) return false;
  if (now - lastWrittenAt <= graceMs) {
    return true;
  }
  recentWrites2.delete(filePath);
  return false;
}
function matchesWatchedFile(filePath, filename) {
  if (!filename) return true;
  return filename.toString() === path.basename(filePath);
}

// electron/export.ts
var fs = __toESM(require("fs"));
var path2 = __toESM(require("path"));
var THEME_VARIABLES = {
  light: `
    :root {
      --color-paper: #fffdf8;
      --color-ink: #1f2328;
      --color-muted: #6b7280;
      --color-line-soft: #d7d3c8;
      --color-surface-sunken: #f3efe6;
      --radius-md: 12px;
      --radius-sm: 6px;
    }
  `,
  dark: `
    :root {
      --color-paper: #111827;
      --color-ink: #f3f4f6;
      --color-muted: #9ca3af;
      --color-line-soft: #374151;
      --color-surface-sunken: #1f2937;
      --radius-md: 12px;
      --radius-sm: 6px;
    }
  `
};
function getMarginValue(preset) {
  switch (preset) {
    case "compact":
      return "12mm";
    case "wide":
      return "24mm";
    default:
      return "18mm";
  }
}
function getPdfPrintOptions(options) {
  return {
    printBackground: options.printBackground,
    displayHeaderFooter: options.displayHeaderFooter,
    preferCSSPageSize: true,
    pageSize: options.pageSize,
    margins: {
      marginType: "none"
    }
  };
}
function normalizeImageSource(source) {
  return source.trim().replace(/\\/g, "/");
}
function resolveLocalImagePath(currentFilePath, source) {
  if (!currentFilePath) return null;
  const normalized = normalizeImageSource(source);
  if (/^(https?:|data:|file:)/i.test(normalized)) {
    return null;
  }
  const baseDir = path2.dirname(currentFilePath);
  return path2.resolve(baseDir, normalized);
}
function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}
function imageMimeType(imagePath) {
  const ext = path2.extname(imagePath).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    default:
      return "image/png";
  }
}
function buildFileUrl(filePath) {
  return `file:///${filePath.replace(/\\/g, "/")}`;
}
function getRelativeImageTarget(source) {
  const normalized = normalizeImageSource(source);
  if (/^[a-zA-Z]:\//.test(normalized)) {
    return path2.posix.join(".resources", path2.posix.basename(normalized));
  }
  const withoutDot = normalized.replace(/^\.\//, "");
  const sanitized = withoutDot.replace(/^(\.\.\/)+/g, "");
  return sanitized || path2.posix.join(".resources", path2.posix.basename(normalized));
}
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function rewriteHtmlImages(html, currentFilePath, outputPath, imageMode) {
  const imgRegex = /(<img\b[^>]*?\bsrc=")([^"]+)(")/gi;
  const outputDir = path2.dirname(outputPath);
  return html.replace(imgRegex, (_fullMatch, prefix, source, suffix) => {
    const normalizedSource = normalizeImageSource(source);
    const localImagePath = resolveLocalImagePath(currentFilePath, normalizedSource);
    if (imageMode === "base64" && localImagePath && fs.existsSync(localImagePath)) {
      const mime = imageMimeType(localImagePath);
      const encoded = fs.readFileSync(localImagePath).toString("base64");
      return `${prefix}data:${mime};base64,${encoded}${suffix}`;
    }
    if (imageMode === "relative" && localImagePath && fs.existsSync(localImagePath)) {
      const relativeAssetPath = getRelativeImageTarget(normalizedSource);
      const targetPath = path2.join(outputDir, relativeAssetPath);
      ensureDirectory(path2.dirname(targetPath));
      if (path2.resolve(localImagePath) !== path2.resolve(targetPath)) {
        fs.copyFileSync(localImagePath, targetPath);
      }
      return `${prefix}${relativeAssetPath.replace(/\\/g, "/")}${suffix}`;
    }
    if (imageMode === "external" && localImagePath && fs.existsSync(localImagePath)) {
      return `${prefix}${buildFileUrl(localImagePath)}${suffix}`;
    }
    return `${prefix}${normalizedSource}${suffix}`;
  });
}
function buildExportDocumentHtml(title, bodyHtml, theme, options) {
  const margin = getMarginValue(options.margin ?? "normal");
  const printPageSize = options.pageSize ?? "A4";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <style>
      ${THEME_VARIABLES[theme]}
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: ${options.forPrint ? "#ffffff" : "var(--color-paper)"};
        color: var(--color-ink);
        font-family: "Segoe UI", system-ui, sans-serif;
      }
      main {
        max-width: 820px;
        margin: 0 auto;
        padding: ${options.forPrint ? "0" : "48px 64px"};
        line-height: 1.7;
      }
      h1, h2, h3, h4, h5, h6 {
        line-height: 1.3;
        margin: 1.4em 0 0.5em;
      }
      h1:first-child, h2:first-child, h3:first-child, p:first-child {
        margin-top: 0;
      }
      p, ul, ol, blockquote, pre, table {
        margin: 0 0 0.9em;
      }
      blockquote {
        border-left: 3px solid var(--color-line-soft);
        padding-left: 16px;
        color: var(--color-muted);
      }
      code {
        font-family: Consolas, "Cascadia Code", monospace;
      }
      pre {
        overflow-x: auto;
        border-radius: var(--radius-md);
        padding: 16px;
        background: var(--color-surface-sunken);
        -webkit-box-decoration-break: clone;
        box-decoration-break: clone;
      }
      pre code {
        white-space: pre-wrap;
      }
      pre.shiki,
      .shiki {
        background: var(--color-surface-sunken) !important;
      }
      .lang-label {
        display: inline-block;
        margin-bottom: 8px;
        font-size: 11px;
        color: var(--color-muted);
        text-transform: uppercase;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        border: 1px solid var(--color-line-soft);
        padding: 8px 12px;
        text-align: left;
      }
      img, svg {
        max-width: 100%;
        height: auto;
      }
      input[type="checkbox"] {
        width: 14px;
        height: 14px;
      }
      .mermaid-processed {
        text-align: center;
        background: transparent !important;
      }
      .copy-btn {
        display: none !important;
      }
      @media print {
        @page {
          size: ${printPageSize};
          margin: ${margin};
        }
        body {
          background: #ffffff;
        }
        table, blockquote, img, svg {
          page-break-inside: avoid;
          break-inside: avoid;
        }
        pre {
          page-break-inside: auto;
          break-inside: auto;
        }
      }
    </style>
  </head>
  <body data-theme="${theme}">
    <main class="export-document">${bodyHtml}</main>
  </body>
</html>`;
}

// src/shared/search.ts
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function parseGlobList(globValue) {
  return globValue.split(/[,\n]/).map((pattern) => pattern.trim()).filter(Boolean);
}
function globToRegex(pattern) {
  const normalized = pattern.replace(/\\/g, "/");
  const escaped = escapeRegex(normalized).replace(/\\\*\\\*\//g, "(?:.*/)?").replace(/\/\\\*\\\*/g, "(?:/.*)?").replace(/\\\*\\\*/g, ".*").replace(/\\\*/g, "[^/]*").replace(/\\\?/g, "[^/]");
  return new RegExp(`^${escaped}$`, "i");
}
function normalizePatterns(patterns) {
  return patterns.map((pattern) => ({ regex: globToRegex(pattern) }));
}
function matchesPatterns(relativePath, patterns) {
  const normalized = relativePath.replace(/\\/g, "/");
  return patterns.some(({ regex }) => regex.test(normalized));
}
function shouldSearchPath(relativePath, includeGlob, excludeGlob) {
  const includePatterns = normalizePatterns(parseGlobList(includeGlob));
  const excludePatterns = normalizePatterns(parseGlobList(excludeGlob));
  if (includePatterns.length > 0 && !matchesPatterns(relativePath, includePatterns)) {
    return false;
  }
  if (excludePatterns.length > 0 && matchesPatterns(relativePath, excludePatterns)) {
    return false;
  }
  return true;
}
function createSearchRegex(query, options) {
  if (!query) return null;
  const source = options.useRegex ? query : escapeRegex(query);
  const wrapped = options.wholeWord ? `\\b(?:${source})\\b` : source;
  const flags = options.caseSensitive ? "g" : "gi";
  try {
    return new RegExp(wrapped, flags);
  } catch {
    return null;
  }
}
function buildLineStarts(text) {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") {
      starts.push(index + 1);
    }
  }
  return starts;
}
function getLineInfo(text, starts, index) {
  let lineIndex = 0;
  while (lineIndex + 1 < starts.length && starts[lineIndex + 1] <= index) {
    lineIndex += 1;
  }
  const lineStart = starts[lineIndex];
  const nextStart = starts[lineIndex + 1] ?? text.length;
  const lineEnd = nextStart > lineStart && text[nextStart - 1] === "\n" ? nextStart - 1 : nextStart;
  const lineText = text.slice(lineStart, lineEnd);
  return {
    lineNumber: lineIndex + 1,
    column: index - lineStart + 1,
    lineText
  };
}
function searchText(content, query, options, contextLines = 1) {
  const regex = createSearchRegex(query, options);
  if (!regex) return [];
  const starts = buildLineStarts(content);
  const lines = content.split("\n");
  const matches = [];
  let result = regex.exec(content);
  while (result) {
    const matchText = result[0];
    if (matchText.length === 0) {
      regex.lastIndex += 1;
      result = regex.exec(content);
      continue;
    }
    const info = getLineInfo(content, starts, result.index);
    const lineIndex = info.lineNumber - 1;
    matches.push({
      index: result.index,
      length: matchText.length,
      matchText,
      lineNumber: info.lineNumber,
      column: info.column,
      lineText: info.lineText,
      contextBefore: lines.slice(Math.max(0, lineIndex - contextLines), lineIndex),
      contextAfter: lines.slice(lineIndex + 1, lineIndex + 1 + contextLines)
    });
    result = regex.exec(content);
  }
  return matches;
}
function previewReplaceText(content, query, replacementText, options) {
  const matches = searchText(content, query, options, 0);
  if (matches.length === 0) {
    return {
      nextContent: content,
      changes: [],
      replacementCount: 0
    };
  }
  const regex = createSearchRegex(query, options);
  if (!regex) {
    return {
      nextContent: content,
      changes: [],
      replacementCount: 0
    };
  }
  const nextContent = content.replace(regex, replacementText);
  const nextLines = nextContent.split("\n");
  const changes = matches.map((match) => ({
    lineNumber: match.lineNumber,
    beforeLine: match.lineText,
    afterLine: nextLines[match.lineNumber - 1] ?? "",
    matchText: match.matchText,
    replacementText
  }));
  return {
    nextContent,
    changes,
    replacementCount: matches.length
  };
}

// electron/main.ts
var mainWindow = null;
var watchedFiles = /* @__PURE__ */ new Map();
var recentWrites = /* @__PURE__ */ new Map();
var imageCounter = 0;
var SEARCHABLE_EXTENSIONS = /* @__PURE__ */ new Set([".md", ".markdown", ".mdx", ".txt"]);
function writeFileAtomically(filePath, content) {
  const dir = path3.dirname(filePath);
  const tempFile = path3.join(dir, `.tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  fs2.writeFileSync(tempFile, content, "utf-8");
  rememberRecentWrite(recentWrites, filePath);
  fs2.renameSync(tempFile, filePath);
}
function collectWorkspaceFiles(rootDir) {
  const files = [];
  const queue = [rootDir];
  while (queue.length > 0) {
    const currentDir = queue.shift();
    if (!currentDir) continue;
    let entries = [];
    try {
      entries = fs2.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "dist" || entry.name === "release") {
        continue;
      }
      const fullPath = path3.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }
      if (!SEARCHABLE_EXTENSIONS.has(path3.extname(entry.name).toLowerCase())) {
        continue;
      }
      files.push(fullPath);
    }
  }
  return files;
}
function relativeWorkspacePath(workspaceRoot, filePath) {
  return path3.relative(workspaceRoot, filePath).replace(/\\/g, "/");
}
async function exportDocument(payload) {
  const baseName = payload.currentFilePath ? path3.parse(payload.currentFilePath).name : payload.title.replace(/\.[^.]+$/, "") || "Untitled";
  const extension = payload.type === "pdf" ? "pdf" : "html";
  const defaultPath = payload.currentFilePath ? path3.join(path3.dirname(payload.currentFilePath), `${baseName}.${extension}`) : `${baseName}.${extension}`;
  const selectedPath = await import_electron.dialog.showSaveDialog({
    defaultPath,
    filters: [
      {
        name: payload.type.toUpperCase(),
        extensions: [extension]
      }
    ]
  });
  if (selectedPath.canceled || !selectedPath.filePath) {
    return { canceled: true };
  }
  if (payload.type === "html") {
    const bodyHtml = rewriteHtmlImages(
      payload.html,
      payload.currentFilePath,
      selectedPath.filePath,
      payload.htmlOptions.imageMode
    );
    const documentHtml = buildExportDocumentHtml(payload.title, bodyHtml, payload.theme, {
      forPrint: false
    });
    fs2.writeFileSync(selectedPath.filePath, documentHtml, "utf-8");
    return { canceled: false, path: selectedPath.filePath };
  }
  const printWindow = new import_electron.BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true
    }
  });
  try {
    const bodyHtml = rewriteHtmlImages(
      payload.html,
      payload.currentFilePath,
      selectedPath.filePath,
      "base64"
    );
    const documentHtml = buildExportDocumentHtml(payload.title, bodyHtml, payload.theme, {
      forPrint: true,
      pageSize: payload.pdf.pageSize,
      margin: payload.pdf.margin
    });
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(documentHtml)}`);
    await printWindow.webContents.executeJavaScript(
      "document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : Promise.resolve(true)"
    );
    const pdfBuffer = await printWindow.webContents.printToPDF(getPdfPrintOptions(payload.pdf));
    fs2.writeFileSync(selectedPath.filePath, pdfBuffer);
    return { canceled: false, path: selectedPath.filePath };
  } finally {
    if (!printWindow.isDestroyed()) {
      printWindow.close();
    }
  }
}
function createWindow() {
  mainWindow = new import_electron.BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    icon: path3.join(__dirname, "typola.ico"),
    webPreferences: {
      preload: path3.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:1420");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path3.join(__dirname, "../dist/index.html"));
  }
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
import_electron.ipcMain.handle("read_file", async (_, filePath) => {
  return fs2.readFileSync(filePath, "utf-8");
});
import_electron.ipcMain.handle("write_file", async (_, filePath, content) => {
  writeFileAtomically(filePath, content);
});
import_electron.ipcMain.handle("pick_folder", async () => {
  const result = await import_electron.dialog.showOpenDialog({
    properties: ["openDirectory"]
  });
  return result.canceled ? null : result.filePaths[0];
});
function hasMarkdownFiles(dirPath) {
  try {
    const entries = fs2.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.isDirectory() && hasMarkdownFiles(path3.join(dirPath, entry.name))) return true;
      if (entry.name.endsWith(".md")) return true;
    }
  } catch {
  }
  return false;
}
function listDirRecursive(dirPath) {
  return new Promise((resolve2) => {
    try {
      const entries = fs2.readdirSync(dirPath, { withFileTypes: true });
      const result = [];
      for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;
        const fullPath = path3.join(dirPath, entry.name);
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
        resolve2(result.sort((a, b) => {
          if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
          return a.name.localeCompare(b.name);
        }));
      }, 0);
    } catch {
      resolve2([]);
    }
  });
}
import_electron.ipcMain.handle("list_dir", async (_, dirPath) => {
  const entries = fs2.readdirSync(dirPath, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path3.join(dirPath, entry.name);
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
import_electron.ipcMain.handle("create_file", async (_, filePath) => {
  fs2.writeFileSync(filePath, "", "utf-8");
});
import_electron.ipcMain.handle("delete_path", async (_, targetPath) => {
  const stat = fs2.statSync(targetPath);
  if (stat.isDirectory()) {
    fs2.rmSync(targetPath, { recursive: true });
  } else {
    fs2.unlinkSync(targetPath);
  }
});
import_electron.ipcMain.handle("rename_path", async (_, oldPath, newPath) => {
  fs2.renameSync(oldPath, newPath);
});
import_electron.ipcMain.handle("show_save_dialog", async (_, options) => {
  const result = await import_electron.dialog.showSaveDialog({
    defaultPath: options.defaultPath,
    filters: options.filters || [{ name: "Markdown", extensions: ["md"] }]
  });
  return result.canceled ? null : result.filePath;
});
import_electron.ipcMain.handle("workspace_search", async (_, workspaceRoot, query, request) => {
  const results = collectWorkspaceFiles(workspaceRoot).map((filePath) => {
    const relativePath = relativeWorkspacePath(workspaceRoot, filePath);
    if (!shouldSearchPath(relativePath, request.includeGlob, request.excludeGlob)) {
      return null;
    }
    try {
      const content = fs2.readFileSync(filePath, "utf-8");
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
          contextAfter: match.contextAfter
        }))
      };
    } catch {
      return null;
    }
  }).filter((result) => result !== null).sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return results;
});
import_electron.ipcMain.handle(
  "preview_workspace_replace",
  async (_, workspaceRoot, query, replacementText, request) => {
    const skippedPaths = new Set(request.skipPaths ?? []);
    const results = collectWorkspaceFiles(workspaceRoot).map((filePath) => {
      if (skippedPaths.has(filePath)) {
        return null;
      }
      const relativePath = relativeWorkspacePath(workspaceRoot, filePath);
      if (!shouldSearchPath(relativePath, request.includeGlob, request.excludeGlob)) {
        return null;
      }
      try {
        const content = fs2.readFileSync(filePath, "utf-8");
        const preview = previewReplaceText(content, query, replacementText, request);
        if (preview.replacementCount === 0) {
          return null;
        }
        return {
          filePath,
          relativePath,
          replacementCount: preview.replacementCount,
          nextContent: preview.nextContent,
          changes: preview.changes
        };
      } catch {
        return null;
      }
    }).filter((result) => result !== null).sort((left, right) => left.relativePath.localeCompare(right.relativePath));
    return results;
  }
);
import_electron.ipcMain.handle(
  "apply_workspace_replace",
  async (_, changes) => {
    for (const change of changes) {
      writeFileAtomically(change.filePath, change.nextContent);
    }
    return { updated: changes.length };
  }
);
import_electron.ipcMain.handle("export_document", async (_, payload) => exportDocument(payload));
import_electron.ipcMain.handle("save_image", async (_, workspaceRoot, data, ext) => {
  const resourcesDir = path3.join(workspaceRoot, ".resources");
  if (!fs2.existsSync(resourcesDir)) {
    fs2.mkdirSync(resourcesDir, { recursive: true });
  }
  const filename = `${Date.now()}-${(++imageCounter).toString(36).slice(-8)}.${ext}`;
  const fullPath = path3.join(resourcesDir, filename);
  const buffer = Buffer.from(data);
  fs2.writeFileSync(fullPath, buffer);
  return `.resources/${filename}`;
});
import_electron.ipcMain.handle("get_image_url", async (_, relativePath) => {
  return "file:///" + relativePath.replace(/\\/g, "/");
});
import_electron.ipcMain.handle("window_minimize", () => {
  mainWindow?.minimize();
});
import_electron.ipcMain.handle("window_maximize", () => {
  mainWindow?.maximize();
});
import_electron.ipcMain.handle("window_unmaximize", () => {
  mainWindow?.unmaximize();
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
    const watcher = fs2.watch(path3.dirname(filePath), (_eventType, filename) => {
      if (!matchesWatchedFile(filePath, filename)) return;
      if (shouldIgnoreWatchEvent(recentWrites, filePath)) return;
      if (fs2.existsSync(filePath)) {
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
