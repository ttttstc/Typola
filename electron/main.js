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
var path6 = __toESM(require("path"));
var fs5 = __toESM(require("fs"));

// electron/fileTree.ts
var fs = __toESM(require("fs/promises"));
var path = __toESM(require("path"));
var MARKDOWN_EXTENSIONS = /* @__PURE__ */ new Set([".md"]);
var IGNORED_DIRECTORY_NAMES = /* @__PURE__ */ new Set([".git", "node_modules", "dist", "release"]);
function shouldIgnoreDirectory(name) {
  return name.startsWith(".") || IGNORED_DIRECTORY_NAMES.has(name.toLowerCase());
}
function shouldIncludeFile(name) {
  return !name.startsWith(".") && MARKDOWN_EXTENSIONS.has(path.extname(name).toLowerCase());
}
function sortEntries(entries) {
  return entries.sort((left, right) => {
    if (left.isDir !== right.isDir) {
      return left.isDir ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });
}
async function buildMarkdownFileTree(dirPath) {
  let entries = [];
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
  const result = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (shouldIgnoreDirectory(entry.name)) {
        continue;
      }
      const children = await buildMarkdownFileTree(fullPath);
      if (children.length > 0) {
        result.push({ name: entry.name, path: fullPath, isDir: true, children });
      }
      continue;
    }
    if (shouldIncludeFile(entry.name)) {
      result.push({ name: entry.name, path: fullPath, isDir: false });
    }
  }
  return sortEntries(result);
}
async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

// electron/fileWatch.ts
var path2 = __toESM(require("path"));
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
  return filename.toString() === path2.basename(filePath);
}

// electron/openTargets.ts
var path3 = __toESM(require("path"));
var OPENABLE_DOCUMENT_EXTENSIONS = /* @__PURE__ */ new Set([".md", ".markdown", ".mdx", ".txt"]);
function extractOpenDocumentPaths(argv, cwd = process.cwd()) {
  const seen = /* @__PURE__ */ new Set();
  const paths = [];
  for (const rawArg of argv.slice(1)) {
    const value = rawArg.trim();
    if (!value || value === "." || value.startsWith("-")) {
      continue;
    }
    const resolvedPath = path3.resolve(cwd, value);
    if (!OPENABLE_DOCUMENT_EXTENSIONS.has(path3.extname(resolvedPath).toLowerCase())) {
      continue;
    }
    const dedupeKey = process.platform === "win32" ? resolvedPath.toLowerCase() : resolvedPath;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    paths.push(resolvedPath);
  }
  return paths;
}

// electron/recentFiles.ts
var fs2 = __toESM(require("fs"));
var path4 = __toESM(require("path"));
var MAX_RECENT = 10;
var FILE_NAME = "recent-files.json";
function getStoragePath(userDataDir) {
  return path4.join(userDataDir, FILE_NAME);
}
async function loadRecentFilesAsync(userDataDir) {
  try {
    const raw = await fs2.promises.readFile(getStoragePath(userDataDir), "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) => !!item && typeof item.path === "string" && typeof item.addedAt === "number"
    ).slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}
function saveRecentFiles(userDataDir, entries) {
  try {
    fs2.writeFileSync(
      getStoragePath(userDataDir),
      JSON.stringify(entries.slice(0, MAX_RECENT), null, 2),
      "utf-8"
    );
  } catch {
  }
}
function addRecentFile(entries, filePath) {
  const normalized = path4.normalize(filePath);
  const filtered = entries.filter((entry) => path4.normalize(entry.path) !== normalized);
  return [{ path: normalized, addedAt: Date.now() }, ...filtered].slice(0, MAX_RECENT);
}
async function pruneMissingRecentFilesAsync(entries) {
  const results = await Promise.all(
    entries.map(async (entry) => {
      try {
        await fs2.promises.access(entry.path, fs2.constants.F_OK);
        return entry;
      } catch {
        return null;
      }
    })
  );
  return results.filter((entry) => entry !== null);
}

// electron/export.ts
var fs3 = __toESM(require("fs"));
var path5 = __toESM(require("path"));
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
  const baseDir = path5.dirname(currentFilePath);
  return path5.resolve(baseDir, normalized);
}
function ensureDirectory(dirPath) {
  fs3.mkdirSync(dirPath, { recursive: true });
}
function imageMimeType(imagePath) {
  const ext = path5.extname(imagePath).toLowerCase();
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
    return path5.posix.join(".resources", path5.posix.basename(normalized));
  }
  const withoutDot = normalized.replace(/^\.\//, "");
  const sanitized = withoutDot.replace(/^(\.\.\/)+/g, "");
  return sanitized || path5.posix.join(".resources", path5.posix.basename(normalized));
}
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function rewriteHtmlImages(html, currentFilePath, outputPath, imageMode) {
  const imgRegex = /(<img\b[^>]*?\bsrc=")([^"]+)(")/gi;
  const outputDir = path5.dirname(outputPath);
  return html.replace(imgRegex, (_fullMatch, prefix, source, suffix) => {
    const normalizedSource = normalizeImageSource(source);
    const localImagePath = resolveLocalImagePath(currentFilePath, normalizedSource);
    if (imageMode === "base64" && localImagePath && fs3.existsSync(localImagePath)) {
      const mime = imageMimeType(localImagePath);
      const encoded = fs3.readFileSync(localImagePath).toString("base64");
      return `${prefix}data:${mime};base64,${encoded}${suffix}`;
    }
    if (imageMode === "relative" && localImagePath && fs3.existsSync(localImagePath)) {
      const relativeAssetPath = getRelativeImageTarget(normalizedSource);
      const targetPath = path5.join(outputDir, relativeAssetPath);
      ensureDirectory(path5.dirname(targetPath));
      if (path5.resolve(localImagePath) !== path5.resolve(targetPath)) {
        fs3.copyFileSync(localImagePath, targetPath);
      }
      return `${prefix}${relativeAssetPath.replace(/\\/g, "/")}${suffix}`;
    }
    if (imageMode === "external" && localImagePath && fs3.existsSync(localImagePath)) {
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

// src/shared/language.ts
function normalizeLanguage(language) {
  if (!language) return null;
  const normalized = language.toLowerCase();
  if (normalized.startsWith("zh")) {
    return "zh";
  }
  if (normalized.startsWith("en")) {
    return "en";
  }
  return null;
}
function resolveLanguage(language, fallback = "en") {
  return normalizeLanguage(language) ?? fallback;
}

// electron/terminal.ts
var fs4 = __toESM(require("fs"));
var os = __toESM(require("os"));
var import_node_pty = require("node-pty");
var terminals = /* @__PURE__ */ new Map();
var nextTerminalId = 1;
function resolveTerminalCwd(cwd) {
  if (cwd && fs4.existsSync(cwd)) {
    return cwd;
  }
  return os.homedir();
}
function resolveShellPath(shell2) {
  if (shell2?.trim()) {
    return shell2.trim();
  }
  if (process.platform === "win32") {
    return "powershell.exe";
  }
  return process.env.SHELL || "/bin/bash";
}
function clampDimension(value, fallback) {
  if (!value || Number.isNaN(value)) {
    return fallback;
  }
  return Math.max(2, Math.floor(value));
}
function createTerminal(webContents, request) {
  const termId = nextTerminalId;
  nextTerminalId += 1;
  const shellPath = resolveShellPath(request.shell);
  const cwd = resolveTerminalCwd(request.cwd);
  const pty = (0, import_node_pty.spawn)(shellPath, [], {
    name: "xterm-256color",
    cwd,
    cols: clampDimension(request.cols, 80),
    rows: clampDimension(request.rows, 24),
    env: {
      ...process.env,
      TERM_PROGRAM: "Typola"
    }
  });
  terminals.set(termId, {
    id: termId,
    pty
  });
  pty.onData((data) => {
    if (webContents.isDestroyed()) return;
    try {
      webContents.send(`term_data_${termId}`, data);
    } catch {
    }
  });
  pty.onExit((event) => {
    const payload = {
      exitCode: event.exitCode,
      signal: event.signal
    };
    terminals.delete(termId);
    if (webContents.isDestroyed()) return;
    try {
      webContents.send(`term_exit_${termId}`, payload);
    } catch {
    }
  });
  return {
    termId,
    cwd,
    shellPath,
    processName: pty.process
  };
}
function writeTerminal(termId, data) {
  terminals.get(termId)?.pty.write(data);
}
function resizeTerminal(termId, cols, rows) {
  terminals.get(termId)?.pty.resize(clampDimension(cols, 80), clampDimension(rows, 24));
}
function killTerminal(termId) {
  const terminal = terminals.get(termId);
  if (!terminal) {
    return;
  }
  terminal.pty.kill();
  terminals.delete(termId);
}
function clearTerminal(termId) {
  terminals.get(termId)?.pty.clear();
}
function killAllTerminals() {
  for (const terminal of terminals.values()) {
    terminal.pty.kill();
  }
  terminals.clear();
}

// electron/main.ts
var mainWindow = null;
var watchedFiles = /* @__PURE__ */ new Map();
var recentWrites = /* @__PURE__ */ new Map();
var imageCounter = 0;
var currentLanguage = resolveLanguage(import_electron.app.getLocale(), "en");
var recentFiles = [];
var rendererReady = false;
var pendingOpenFilePaths = [];
var singleInstanceLock = import_electron.app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  import_electron.app.quit();
}
function getUserDataDir() {
  return import_electron.app.getPath("userData");
}
function notifyRecentFilesChanged() {
  mainWindow?.webContents.send("recent-files-changed", recentFiles);
}
function registerRecentFile(filePath) {
  if (!filePath) return;
  recentFiles = addRecentFile(recentFiles, filePath);
  saveRecentFiles(getUserDataDir(), recentFiles);
  notifyRecentFilesChanged();
}
function clearRecentFiles() {
  recentFiles = [];
  saveRecentFiles(getUserDataDir(), recentFiles);
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
    mainWindow.webContents.send("open-recent-file", filePath);
  }
}
async function queueOpenFile(filePath) {
  const normalizedPath = path6.normalize(filePath);
  if (!await pathExists(normalizedPath)) {
    return;
  }
  registerRecentFile(normalizedPath);
  if (!mainWindow || !rendererReady) {
    if (!pendingOpenFilePaths.includes(normalizedPath)) {
      pendingOpenFilePaths.push(normalizedPath);
    }
    return;
  }
  mainWindow.webContents.send("open-recent-file", normalizedPath);
}
function queueOpenFilesFromArgs(argv, workingDirectory) {
  extractOpenDocumentPaths(argv, workingDirectory || process.cwd()).forEach((filePath) => {
    void queueOpenFile(filePath);
  });
}
var SEARCHABLE_EXTENSIONS = /* @__PURE__ */ new Set([".md", ".markdown", ".mdx", ".txt"]);
function fallbackTranslate(key) {
  if (key === "common.markdown") return "Markdown";
  if (key === "fileTree.untitled") return "Untitled";
  return key;
}
function writeFileAtomically(filePath, content) {
  const dir = path6.dirname(filePath);
  const tempFile = path6.join(dir, `.tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  fs5.writeFileSync(tempFile, content, "utf-8");
  rememberRecentWrite(recentWrites, filePath);
  fs5.renameSync(tempFile, filePath);
}
function collectWorkspaceFiles(rootDir) {
  const files = [];
  const queue = [rootDir];
  while (queue.length > 0) {
    const currentDir = queue.shift();
    if (!currentDir) continue;
    let entries = [];
    try {
      entries = fs5.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "dist" || entry.name === "release") {
        continue;
      }
      const fullPath = path6.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }
      if (!SEARCHABLE_EXTENSIONS.has(path6.extname(entry.name).toLowerCase())) {
        continue;
      }
      files.push(fullPath);
    }
  }
  return files;
}
function relativeWorkspacePath(workspaceRoot, filePath) {
  return path6.relative(workspaceRoot, filePath).replace(/\\/g, "/");
}
async function exportDocument(payload) {
  const baseName = payload.currentFilePath ? path6.parse(payload.currentFilePath).name : payload.title.replace(/\.[^.]+$/, "") || fallbackTranslate("fileTree.untitled");
  const extension = payload.type === "pdf" ? "pdf" : "html";
  const defaultPath = payload.currentFilePath ? path6.join(path6.dirname(payload.currentFilePath), `${baseName}.${extension}`) : `${baseName}.${extension}`;
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
    fs5.writeFileSync(selectedPath.filePath, documentHtml, "utf-8");
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
    fs5.writeFileSync(selectedPath.filePath, pdfBuffer);
    return { canceled: false, path: selectedPath.filePath };
  } finally {
    if (!printWindow.isDestroyed()) {
      printWindow.close();
    }
  }
}
function createWindow() {
  import_electron.Menu.setApplicationMenu(null);
  rendererReady = false;
  const windowIcon = import_electron.app.isPackaged ? path6.join(process.resourcesPath, "typola.ico") : path6.join(__dirname, "../resources/typola.ico");
  mainWindow = new import_electron.BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    show: false,
    backgroundColor: "#ffffff",
    icon: windowIcon,
    webPreferences: {
      preload: path6.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });
  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:1420");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path6.join(__dirname, "../dist/index.html"));
  }
  mainWindow.on("maximize", () => {
    mainWindow?.webContents.send("maximized-change", true);
  });
  mainWindow.on("unmaximize", () => {
    mainWindow?.webContents.send("maximized-change", false);
  });
  mainWindow.on("close", () => {
    killAllTerminals();
  });
  mainWindow.on("closed", () => {
    killAllTerminals();
    rendererReady = false;
    mainWindow = null;
  });
}
import_electron.ipcMain.handle("read_file", async (_, filePath) => {
  return fs5.readFileSync(filePath, "utf-8");
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
import_electron.ipcMain.handle(
  "pick_file",
  async (_, options) => {
    const result = await import_electron.dialog.showOpenDialog({
      properties: ["openFile"],
      filters: options?.filters ?? [
        { name: "Markdown", extensions: ["md", "markdown"] },
        { name: "All Files", extensions: ["*"] }
      ]
    });
    return result.canceled ? null : result.filePaths[0];
  }
);
import_electron.ipcMain.handle("list_dir", async (_, dirPath) => {
  return buildMarkdownFileTree(dirPath);
});
import_electron.ipcMain.handle("create_file", async (_, filePath) => {
  fs5.writeFileSync(filePath, "", "utf-8");
});
import_electron.ipcMain.handle("delete_path", async (_, targetPath) => {
  const stat = fs5.statSync(targetPath);
  if (stat.isDirectory()) {
    fs5.rmSync(targetPath, { recursive: true });
  } else {
    fs5.unlinkSync(targetPath);
  }
});
import_electron.ipcMain.handle("rename_path", async (_, oldPath, newPath) => {
  fs5.renameSync(oldPath, newPath);
});
import_electron.ipcMain.handle("show_save_dialog", async (_, options) => {
  const result = await import_electron.dialog.showSaveDialog({
    defaultPath: options.defaultPath,
    filters: options.filters || [{ name: fallbackTranslate("common.markdown"), extensions: ["md"] }]
  });
  return result.canceled ? null : result.filePath;
});
import_electron.ipcMain.handle("path_exists", async (_, targetPath) => pathExists(targetPath));
import_electron.ipcMain.handle("set_language_preference", async (_, language) => {
  currentLanguage = resolveLanguage(language, currentLanguage);
  return currentLanguage;
});
import_electron.ipcMain.handle("term_create", async (_, request) => {
  if (!mainWindow) {
    throw new Error("Main window is not ready");
  }
  return createTerminal(mainWindow.webContents, request);
});
import_electron.ipcMain.handle("term_write", async (_, request) => {
  writeTerminal(request.termId, request.data);
});
import_electron.ipcMain.handle("term_resize", async (_, request) => {
  resizeTerminal(request.termId, request.cols, request.rows);
});
import_electron.ipcMain.handle("term_kill", async (_, termId) => {
  killTerminal(termId);
});
import_electron.ipcMain.handle("term_clear", async (_, termId) => {
  clearTerminal(termId);
});
import_electron.ipcMain.handle("clipboard_read_text", async () => import_electron.clipboard.readText());
import_electron.ipcMain.handle("clipboard_write_text", async (_, text) => {
  import_electron.clipboard.writeText(text);
});
import_electron.ipcMain.handle("open_external", async (_, url) => {
  await import_electron.shell.openExternal(url);
});
import_electron.ipcMain.handle("workspace_search", async (_, workspaceRoot, query, request) => {
  const results = collectWorkspaceFiles(workspaceRoot).map((filePath) => {
    const relativePath = relativeWorkspacePath(workspaceRoot, filePath);
    if (!shouldSearchPath(relativePath, request.includeGlob, request.excludeGlob)) {
      return null;
    }
    try {
      const content = fs5.readFileSync(filePath, "utf-8");
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
        const content = fs5.readFileSync(filePath, "utf-8");
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
import_electron.ipcMain.handle("get_recent_files", async () => recentFiles);
import_electron.ipcMain.handle("add_recent_file", async (_, filePath) => {
  registerRecentFile(filePath);
  return recentFiles;
});
import_electron.ipcMain.handle("clear_recent_files", async () => {
  clearRecentFiles();
  return recentFiles;
});
import_electron.ipcMain.on("renderer_ready", () => {
  rendererReady = true;
  flushPendingOpenFiles();
});
import_electron.ipcMain.handle("save_image", async (_, workspaceRoot, data, ext) => {
  const resourcesDir = path6.join(workspaceRoot, ".resources");
  if (!fs5.existsSync(resourcesDir)) {
    fs5.mkdirSync(resourcesDir, { recursive: true });
  }
  const filename = `${Date.now()}-${(++imageCounter).toString(36).slice(-8)}.${ext}`;
  const fullPath = path6.join(resourcesDir, filename);
  const buffer = Buffer.from(data);
  fs5.writeFileSync(fullPath, buffer);
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
import_electron.ipcMain.handle("window_toggle_maximize", () => {
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
import_electron.ipcMain.handle("watch_file", async (_, filePath) => {
  if (watchedFiles.has(filePath)) return;
  try {
    const watcher = fs5.watch(path6.dirname(filePath), (_eventType, filename) => {
      if (!matchesWatchedFile(filePath, filename)) return;
      if (shouldIgnoreWatchEvent(recentWrites, filePath)) return;
      if (fs5.existsSync(filePath)) {
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
if (singleInstanceLock) {
  import_electron.app.on("second-instance", (_event, commandLine, workingDirectory) => {
    focusMainWindow();
    queueOpenFilesFromArgs(commandLine, workingDirectory);
  });
  import_electron.app.on("open-file", (event, filePath) => {
    event.preventDefault();
    focusMainWindow();
    void queueOpenFile(filePath);
  });
  import_electron.app.whenReady().then(() => {
    createWindow();
    queueOpenFilesFromArgs(process.argv);
    void (async () => {
      try {
        const loaded = await loadRecentFilesAsync(getUserDataDir());
        const pruned = await pruneMissingRecentFilesAsync(loaded);
        recentFiles = pruned;
        saveRecentFiles(getUserDataDir(), recentFiles);
        notifyRecentFilesChanged();
      } catch (error) {
        console.error("Failed to load recent files:", error);
      }
    })();
  });
}
import_electron.app.on("window-all-closed", () => {
  watchedFiles.forEach((watcher) => watcher.close());
  watchedFiles.clear();
  killAllTerminals();
  if (process.platform !== "darwin") {
    import_electron.app.quit();
  }
});
import_electron.app.on("activate", () => {
  if (import_electron.BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
