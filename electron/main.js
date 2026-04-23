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
var fs3 = __toESM(require("fs"));

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

// src/locales/en.json
var en_default = {
  common: {
    cancel: "Cancel",
    confirm: "Confirm",
    close: "Close",
    save: "Save",
    discard: "Discard",
    delete: "Delete",
    rename: "Rename",
    markdown: "Markdown",
    yes: "Yes",
    no: "No"
  },
  menu: {
    file: "File",
    edit: "Edit",
    paragraph: "Paragraph",
    format: "Format",
    view: "View",
    settings: "Settings",
    newFile: "New File",
    openFile: "Open File",
    openFolder: "Open Project/Folder",
    save: "Save",
    saveAs: "Save As",
    exportPdf: "Export PDF",
    exportHtml: "Export HTML",
    find: "Find",
    findInWorkspace: "Find in Workspace",
    exportSettings: "Export Settings",
    exportDefaultName: "Exported Document.md",
    exit: "Exit",
    undo: "Undo",
    redo: "Redo",
    selectAll: "Select All",
    shortcuts: "Shortcuts",
    heading1: "Heading 1",
    heading2: "Heading 2",
    heading3: "Heading 3",
    body: "Body",
    orderedList: "Ordered List",
    unorderedList: "Unordered List",
    quote: "Quote",
    bold: "Bold",
    italic: "Italic",
    strikethrough: "Strikethrough",
    inlineCode: "Inline Code",
    link: "Link",
    sidebar: "Sidebar",
    outline: "Outline",
    terminal: "Terminal",
    newTerminal: "New Terminal",
    zoomIn: "Zoom In",
    zoomOut: "Zoom Out",
    currentFontSize: "Current Font Size",
    lightMode: "Light Mode",
    darkMode: "Dark Mode",
    toggleLanguage: "Toggle language",
    switchToEnglish: "Switch to English",
    switchToChinese: "Switch to Chinese"
  },
  editor: {
    enterLinkUrl: "Enter link URL:",
    enterLinkText: "Enter link text:",
    enterImageUrl: "Enter image URL:",
    externalChangeConfirm: "This file changed outside Typola. Keep your local edits and overwrite the file on disk?",
    copyCode: "Copy",
    mermaidSyntaxError: "Mermaid syntax error"
  },
  slashMenu: {
    filterPlaceholder: "Type to filter...",
    noMatch: "No match",
    heading1: "Heading 1",
    heading2: "Heading 2",
    heading3: "Heading 3",
    quote: "Quote",
    divider: "Divider",
    bulletList: "Bullet List",
    orderedList: "Ordered List",
    todoList: "Todo List",
    table: "Table",
    codeBlock: "Code Block",
    image: "Image",
    link: "Link",
    mermaid: "Mermaid Diagram",
    tableTemplate: "| Column 1 | Column 2 |\n| --- | --- |\n| Content | Content |\n"
  },
  fileTree: {
    files: "Files",
    openWorkspace: "Open Workspace",
    loading: "Loading...",
    confirmDelete: 'Are you sure you want to delete "{{name}}"? This action cannot be undone.',
    renamePrompt: 'Enter a new name for "{{name}}":',
    renameHint: "Press Enter to confirm or Esc to cancel.",
    renameEmpty: "Name cannot be empty.",
    renameInvalid: "Names cannot include / or \\.",
    renameConflict: '"{{name}}" already exists. Choose a different name.',
    renameFailed: "Rename failed. Please try again.",
    untitled: "Untitled",
    addProject: "Add Project",
    removeProject: "Remove Project",
    noProjects: 'No projects yet. Click "Add Project" above to start.',
    confirmRemoveProject: 'Remove project "{{name}}" from the workspace? Files on disk are not deleted.'
  },
  statusBar: {
    saved: "Saved",
    saving: "Saving...",
    error: "Save failed",
    unsaved: "Unsaved",
    characters: "{{count}} chars"
  },
  outline: {
    title: "Outline",
    empty: "No headings"
  },
  tabBar: {
    fileModified: "File Modified",
    modified: "Modified",
    fileModifiedMessage: '"{{name}}" has been modified. Do you want to save?'
  },
  shortcuts: {
    title: "Keyboard Shortcuts",
    save: "Save",
    newFile: "New File",
    findInFile: "Find in File",
    findInWorkspace: "Find in Workspace",
    toggleSidebar: "Toggle Sidebar",
    toggleOutline: "Toggle Outline",
    toggleTerminal: "Toggle Terminal",
    newTerminal: "New Terminal",
    toggleTheme: "Toggle Theme",
    bold: "Bold",
    italic: "Italic",
    strikethrough: "Strikethrough",
    inlineCode: "Inline Code",
    link: "Link",
    body: "Body",
    heading1: "Heading 1",
    heading2: "Heading 2",
    heading3: "Heading 3",
    openSettings: "Open Settings"
  },
  terminal: {
    title: "Terminal",
    empty: "No terminal session yet.",
    newTab: "New Terminal",
    hidePanel: "Hide terminal panel",
    closeTab: "Close {{name}}",
    copy: "Copy",
    paste: "Paste",
    selectAll: "Select All",
    clear: "Clear",
    processExited: "Process exited with code {{code}}",
    confirmMultilinePaste: "Paste multiple lines into the terminal?",
    shellPath: "Shell Path",
    shellPathDescription: "Leave empty to auto-detect the default shell for the current platform.",
    fontFamily: "Font Family",
    fontFamilyDescription: "Controls the monospace font used by the integrated terminal.",
    fontSize: "Font Size",
    fontSizeDescription: "Choose the default terminal font size.",
    cursorStyle: "Cursor Style",
    cursorStyleDescription: "Pick how the caret is rendered inside the terminal.",
    cursorBlock: "Block",
    cursorBar: "Bar",
    cursorUnderline: "Underline",
    cursorBlink: "Blinking Cursor",
    cursorBlinkDescription: "Animate the caret when the terminal has focus.",
    shortcutPreset: "Copy/Paste Shortcut Style",
    shortcutPresetDescription: "Use Windows-style or Linux-style terminal shortcuts.",
    shortcutPresetWindows: "Windows",
    shortcutPresetLinux: "Linux",
    confirmMultilinePasteDescription: "Ask before sending pasted text that spans multiple lines.",
    autoShellWindows: "Auto (powershell.exe)",
    autoShellPosix: "Auto ($SHELL / /bin/bash)"
  },
  settings: {
    common: "Common",
    advanced: "Advanced",
    general: "General",
    searchGroup: "Search",
    defaultSearchDescription: "Use this option by default for new in-file and workspace searches.",
    wholeWordDescription: "Match complete words only and skip partial hits inside longer strings.",
    regexDescription: "Interpret search input as a regular expression by default.",
    includeGlob: "Include Glob",
    includeGlobDescription: "Separate multiple patterns with commas to limit the search scope.",
    excludeGlob: "Exclude Glob",
    excludeGlobDescription: "Files matching these patterns are skipped during workspace search.",
    enableByDefault: "Enable by default",
    editor: "Editor",
    appearance: "Appearance",
    export: "Export",
    exportPdf: "PDF Export",
    exportHtml: "HTML Export",
    pageSize: "Page Size",
    pageSizeDescription: "Choose the default paper size for PDF export.",
    margin: "Margin",
    marginDescription: "Control the default PDF page margins.",
    marginCompact: "Compact",
    marginNormal: "Normal",
    marginWide: "Wide",
    printBackground: "Print Background",
    printBackgroundDescription: "Keep background colors for code blocks, tables, and other elements.",
    headerFooter: "Header and Footer",
    headerFooterDescription: "Show browser-style header and footer metadata in PDFs.",
    imageMode: "Image Handling",
    imageModeDescription: "Choose how HTML export stores image resources.",
    imageModeRelative: "Relative path",
    imageModeBase64: "Embed as Base64",
    imageModeExternal: "External / file URL",
    terminal: "Terminal",
    shortcuts: "Shortcuts",
    notImplemented: "Not implemented yet"
  },
  sidebar: {
    files: "Files",
    search: "Search",
    terminal: "Terminal"
  },
  search: {
    workspaceTitle: "Workspace Search",
    searchPlaceholder: "Search",
    replacePlaceholder: "Replace with",
    includePlaceholder: "Include glob, e.g. **/*.md",
    excludePlaceholder: "Exclude glob, e.g. **/node_modules/**",
    caseSensitive: "Case sensitive",
    wholeWord: "Whole word",
    regex: "Regex",
    searching: "Searching...",
    searchAction: "Search",
    preparingReplace: "Preparing preview...",
    previewReplace: "Preview Replace",
    resultSummary: "{{files}} files, {{matches}} matches",
    emptySearch: "Type to search across the current workspace.",
    openWorkspaceFirst: "Open a workspace before running a global search.",
    previewSummary: "{{files}} files will change, {{count}} replacements total",
    applyReplace: "Apply Replace",
    lineLabel: "Line {{line}}",
    noResults: "No results",
    confirmWorkspaceReplace: "Replace all {{count}} matches?",
    inlineSummary: "{{current}} / {{total}}",
    inlineHint: "Enter for next, Shift+Enter for previous, Esc to close",
    replaceCurrent: "Replace",
    replaceAll: "Replace All"
  },
  contextMenu: {
    body: "Body",
    heading1: "Heading 1",
    heading2: "Heading 2",
    heading3: "Heading 3",
    heading4: "Heading 4",
    heading5: "Heading 5",
    heading6: "Heading 6"
  },
  table: {
    insertLineBreak: "Insert Line Break",
    exitTable: "Exit Table",
    insertRowAbove: "Insert Row Above",
    insertRowBelow: "Insert Row Below",
    insertColumnLeft: "Insert Column Left",
    insertColumnRight: "Insert Column Right",
    alignLeft: "Align Column Left",
    alignCenter: "Align Column Center",
    alignRight: "Align Column Right",
    deleteRow: "Delete Row",
    deleteColumn: "Delete Column",
    deleteTable: "Delete Table"
  },
  floatingToolbar: {
    paragraphFormat: "Format",
    bold: "Bold (Ctrl+B)",
    italic: "Italic (Ctrl+I)",
    strikethrough: "Strikethrough",
    inlineCode: "Inline Code",
    link: "Link (Ctrl+K)",
    body: "Body",
    heading1: "Heading 1",
    heading2: "Heading 2",
    heading3: "Heading 3",
    heading4: "Heading 4",
    heading5: "Heading 5",
    heading6: "Heading 6"
  },
  titleBar: {
    switchThemeTo: "Switch to {{theme}} theme (Ctrl+Shift+D)",
    lightTheme: "light",
    darkTheme: "dark",
    minimize: "Minimize",
    maximize: "Maximize",
    restore: "Restore",
    close: "Close"
  }
};

// src/locales/zh.json
var zh_default = {
  common: {
    cancel: "\u53D6\u6D88",
    confirm: "\u786E\u8BA4",
    close: "\u5173\u95ED",
    save: "\u4FDD\u5B58",
    discard: "\u4E22\u5F03",
    delete: "\u5220\u9664",
    rename: "\u91CD\u547D\u540D",
    markdown: "Markdown",
    yes: "\u662F",
    no: "\u5426"
  },
  menu: {
    file: "\u6587\u4EF6",
    edit: "\u7F16\u8F91",
    paragraph: "\u6BB5\u843D",
    format: "\u683C\u5F0F",
    view: "\u89C6\u56FE",
    settings: "\u8BBE\u7F6E",
    newFile: "\u65B0\u5EFA\u6587\u4EF6",
    openFile: "\u6253\u5F00\u6587\u4EF6",
    openFolder: "\u6253\u5F00\u9879\u76EE/\u6587\u4EF6\u5939",
    save: "\u4FDD\u5B58",
    saveAs: "\u53E6\u5B58\u4E3A",
    exportPdf: "\u5BFC\u51FA PDF",
    exportHtml: "\u5BFC\u51FA HTML",
    find: "\u67E5\u627E",
    findInWorkspace: "\u5728\u5DE5\u4F5C\u533A\u4E2D\u67E5\u627E",
    exportSettings: "\u5BFC\u51FA\u8BBE\u7F6E",
    exportDefaultName: "\u5BFC\u51FA\u6587\u6863.md",
    exit: "\u9000\u51FA",
    undo: "\u64A4\u9500",
    redo: "\u91CD\u505A",
    selectAll: "\u5168\u9009",
    shortcuts: "\u5FEB\u6377\u952E\u8BBE\u7F6E",
    heading1: "\u6807\u9898 1",
    heading2: "\u6807\u9898 2",
    heading3: "\u6807\u9898 3",
    body: "\u6B63\u6587",
    orderedList: "\u6709\u5E8F\u5217\u8868",
    unorderedList: "\u65E0\u5E8F\u5217\u8868",
    quote: "\u5F15\u7528",
    bold: "\u7C97\u4F53",
    italic: "\u659C\u4F53",
    strikethrough: "\u5220\u9664\u7EBF",
    inlineCode: "\u884C\u5185\u4EE3\u7801",
    link: "\u94FE\u63A5",
    sidebar: "\u4FA7\u8FB9\u680F",
    outline: "\u5927\u7EB2",
    terminal: "\u7EC8\u7AEF",
    newTerminal: "\u65B0\u5EFA\u7EC8\u7AEF",
    zoomIn: "\u653E\u5927\u5B57\u4F53",
    zoomOut: "\u7F29\u5C0F\u5B57\u4F53",
    currentFontSize: "\u5F53\u524D\u5B57\u53F7",
    lightMode: "\u4EAE\u8272\u6A21\u5F0F",
    darkMode: "\u6697\u8272\u6A21\u5F0F",
    toggleLanguage: "\u5207\u6362\u8BED\u8A00",
    switchToEnglish: "\u5207\u6362\u5230\u82F1\u6587",
    switchToChinese: "\u5207\u6362\u5230\u4E2D\u6587"
  },
  editor: {
    enterLinkUrl: "\u8F93\u5165\u94FE\u63A5\u5730\u5740:",
    enterLinkText: "\u8F93\u5165\u94FE\u63A5\u6587\u672C:",
    enterImageUrl: "\u8F93\u5165\u56FE\u7247\u5730\u5740:",
    externalChangeConfirm: "\u6587\u4EF6\u5DF2\u88AB\u5916\u90E8\u4FEE\u6539\u3002\u662F\u5426\u4FDD\u7559\u5F53\u524D\u4FEE\u6539\u5E76\u8986\u76D6\u78C1\u76D8\u5185\u5BB9\uFF1F",
    copyCode: "\u590D\u5236",
    mermaidSyntaxError: "Mermaid \u8BED\u6CD5\u9519\u8BEF"
  },
  slashMenu: {
    filterPlaceholder: "\u8F93\u5165\u4EE5\u8FC7\u6EE4...",
    noMatch: "\u65E0\u5339\u914D\u9879",
    heading1: "\u6807\u9898 1",
    heading2: "\u6807\u9898 2",
    heading3: "\u6807\u9898 3",
    quote: "\u5F15\u7528",
    divider: "\u5206\u5272\u7EBF",
    bulletList: "\u65E0\u5E8F\u5217\u8868",
    orderedList: "\u6709\u5E8F\u5217\u8868",
    todoList: "\u5F85\u529E\u6E05\u5355",
    table: "\u8868\u683C",
    codeBlock: "\u4EE3\u7801\u5757",
    image: "\u56FE\u7247",
    link: "\u94FE\u63A5",
    mermaid: "Mermaid \u56FE\u8868",
    tableTemplate: "| \u5217 1 | \u5217 2 |\n| --- | --- |\n| \u5185\u5BB9 | \u5185\u5BB9 |\n"
  },
  fileTree: {
    files: "\u6587\u4EF6",
    openWorkspace: "\u6253\u5F00\u5DE5\u4F5C\u533A",
    loading: "\u52A0\u8F7D\u4E2D...",
    confirmDelete: '\u786E\u5B9A\u8981\u5220\u9664 "{{name}}" \u5417\uFF1F\u6B64\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\u3002',
    renamePrompt: '\u8BF7\u8F93\u5165 "{{name}}" \u7684\u65B0\u540D\u79F0\uFF1A',
    renameHint: "\u6309 Enter \u786E\u8BA4\uFF0CEsc \u53D6\u6D88\u3002",
    renameEmpty: "\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A\u3002",
    renameInvalid: "\u540D\u79F0\u4E0D\u80FD\u5305\u542B / \u6216 \\\\\u3002",
    renameConflict: '"{{name}}" \u5DF2\u5B58\u5728\uFF0C\u8BF7\u6362\u4E00\u4E2A\u540D\u79F0\u3002',
    renameFailed: "\u91CD\u547D\u540D\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
    untitled: "\u672A\u547D\u540D",
    addProject: "\u6DFB\u52A0\u9879\u76EE",
    removeProject: "\u79FB\u9664\u9879\u76EE",
    noProjects: "\u8FD8\u6CA1\u6709\u9879\u76EE\uFF0C\u70B9\u51FB\u4E0A\u65B9\u201C\u6DFB\u52A0\u9879\u76EE\u201D\u5F00\u59CB\u3002",
    confirmRemoveProject: '\u786E\u5B9A\u8981\u4ECE\u5DE5\u4F5C\u533A\u79FB\u9664\u9879\u76EE "{{name}}" \u5417\uFF1F\u78C1\u76D8\u6587\u4EF6\u4E0D\u4F1A\u88AB\u5220\u9664\u3002'
  },
  statusBar: {
    saved: "\u5DF2\u4FDD\u5B58",
    saving: "\u4FDD\u5B58\u4E2D...",
    error: "\u4FDD\u5B58\u5931\u8D25",
    unsaved: "\u672A\u4FDD\u5B58",
    characters: "{{count}} \u5B57"
  },
  outline: {
    title: "\u5927\u7EB2",
    empty: "\u65E0\u6807\u9898"
  },
  tabBar: {
    fileModified: "\u6587\u4EF6\u5DF2\u4FEE\u6539",
    modified: "\u5DF2\u4FEE\u6539",
    fileModifiedMessage: '"{{name}}" \u5DF2\u88AB\u4FEE\u6539\uFF0C\u662F\u5426\u4FDD\u5B58\uFF1F'
  },
  shortcuts: {
    title: "\u5FEB\u6377\u952E\u8BBE\u7F6E",
    save: "\u4FDD\u5B58",
    newFile: "\u65B0\u5EFA\u6587\u4EF6",
    findInFile: "\u5F53\u524D\u6587\u4EF6\u67E5\u627E",
    findInWorkspace: "\u5DE5\u4F5C\u533A\u67E5\u627E",
    toggleSidebar: "\u5207\u6362\u4FA7\u8FB9\u680F",
    toggleOutline: "\u5207\u6362\u5927\u7EB2",
    toggleTerminal: "\u5207\u6362\u7EC8\u7AEF",
    newTerminal: "\u65B0\u5EFA\u7EC8\u7AEF",
    toggleTheme: "\u5207\u6362\u4E3B\u9898",
    bold: "\u7C97\u4F53",
    italic: "\u659C\u4F53",
    strikethrough: "\u5220\u9664\u7EBF",
    inlineCode: "\u884C\u5185\u4EE3\u7801",
    link: "\u94FE\u63A5",
    body: "\u6B63\u6587",
    heading1: "\u6807\u98981",
    heading2: "\u6807\u98982",
    heading3: "\u6807\u98983",
    openSettings: "\u6253\u5F00\u8BBE\u7F6E"
  },
  terminal: {
    title: "\u7EC8\u7AEF",
    empty: "\u8FD8\u6CA1\u6709\u7EC8\u7AEF\u4F1A\u8BDD\u3002",
    newTab: "\u65B0\u5EFA\u7EC8\u7AEF",
    hidePanel: "\u9690\u85CF\u7EC8\u7AEF\u9762\u677F",
    closeTab: "\u5173\u95ED {{name}}",
    copy: "\u590D\u5236",
    paste: "\u7C98\u8D34",
    selectAll: "\u5168\u9009",
    clear: "\u6E05\u5C4F",
    processExited: "\u8FDB\u7A0B\u5DF2\u9000\u51FA\uFF0C\u9000\u51FA\u7801 {{code}}",
    confirmMultilinePaste: "\u8981\u5C06\u591A\u884C\u5185\u5BB9\u7C98\u8D34\u5230\u7EC8\u7AEF\u5417\uFF1F",
    shellPath: "Shell \u8DEF\u5F84",
    shellPathDescription: "\u7559\u7A7A\u5219\u81EA\u52A8\u68C0\u6D4B\u5F53\u524D\u5E73\u53F0\u7684\u9ED8\u8BA4 shell\u3002",
    fontFamily: "\u5B57\u4F53",
    fontFamilyDescription: "\u63A7\u5236\u96C6\u6210\u7EC8\u7AEF\u4F7F\u7528\u7684\u7B49\u5BBD\u5B57\u4F53\u3002",
    fontSize: "\u5B57\u53F7",
    fontSizeDescription: "\u8BBE\u7F6E\u7EC8\u7AEF\u9ED8\u8BA4\u5B57\u53F7\u3002",
    cursorStyle: "\u5149\u6807\u6837\u5F0F",
    cursorStyleDescription: "\u9009\u62E9\u7EC8\u7AEF\u4E2D\u7684\u5149\u6807\u663E\u793A\u65B9\u5F0F\u3002",
    cursorBlock: "\u5757\u72B6",
    cursorBar: "\u7AD6\u7EBF",
    cursorUnderline: "\u4E0B\u5212\u7EBF",
    cursorBlink: "\u5149\u6807\u95EA\u70C1",
    cursorBlinkDescription: "\u7EC8\u7AEF\u805A\u7126\u65F6\u8BA9\u5149\u6807\u95EA\u70C1\u3002",
    shortcutPreset: "\u590D\u5236\u7C98\u8D34\u5FEB\u6377\u952E\u98CE\u683C",
    shortcutPresetDescription: "\u5728 Windows \u98CE\u683C\u548C Linux \u98CE\u683C\u7EC8\u7AEF\u5FEB\u6377\u952E\u4E4B\u95F4\u5207\u6362\u3002",
    shortcutPresetWindows: "Windows",
    shortcutPresetLinux: "Linux",
    confirmMultilinePasteDescription: "\u591A\u884C\u6587\u672C\u7C98\u8D34\u5230\u7EC8\u7AEF\u524D\u5148\u786E\u8BA4\u3002",
    autoShellWindows: "\u81EA\u52A8 (powershell.exe)",
    autoShellPosix: "\u81EA\u52A8 ($SHELL / /bin/bash)"
  },
  settings: {
    common: "\u5E38\u7528",
    advanced: "\u9AD8\u7EA7",
    general: "\u901A\u7528",
    searchGroup: "\u641C\u7D22",
    defaultSearchDescription: "\u65B0\u6253\u5F00\u7684\u6587\u4EF6\u5185\u641C\u7D22\u548C\u5DE5\u4F5C\u533A\u641C\u7D22\u9ED8\u8BA4\u4F7F\u7528\u8FD9\u4E2A\u9009\u9879\u3002",
    wholeWordDescription: "\u53EA\u5339\u914D\u5B8C\u6574\u5355\u8BCD\uFF0C\u907F\u514D\u547D\u4E2D\u8FC7\u957F\u5B57\u7B26\u4E32\u4E2D\u7684\u7247\u6BB5\u3002",
    regexDescription: "\u9ED8\u8BA4\u6309\u6B63\u5219\u8868\u8FBE\u5F0F\u89E3\u6790\u641C\u7D22\u5185\u5BB9\u3002",
    includeGlob: "\u5305\u542B Glob",
    includeGlobDescription: "\u591A\u4E2A\u6A21\u5F0F\u53EF\u7528\u9017\u53F7\u5206\u9694\uFF0C\u9ED8\u8BA4\u9650\u5236\u641C\u7D22\u8303\u56F4\u3002",
    excludeGlob: "\u6392\u9664 Glob",
    excludeGlobDescription: "\u5339\u914D\u8FD9\u4E9B\u6A21\u5F0F\u7684\u6587\u4EF6\u4F1A\u4ECE\u5DE5\u4F5C\u533A\u641C\u7D22\u4E2D\u6392\u9664\u3002",
    enableByDefault: "\u9ED8\u8BA4\u542F\u7528",
    editor: "\u7F16\u8F91\u5668",
    appearance: "\u5916\u89C2",
    export: "\u5BFC\u51FA",
    exportPdf: "PDF \u5BFC\u51FA",
    exportHtml: "HTML \u5BFC\u51FA",
    pageSize: "\u9875\u9762\u5C3A\u5BF8",
    pageSizeDescription: "\u8BBE\u7F6E\u5BFC\u51FA PDF \u65F6\u7684\u7EB8\u5F20\u5C3A\u5BF8\u3002",
    margin: "\u8FB9\u8DDD",
    marginDescription: "\u63A7\u5236 PDF \u9875\u8FB9\u8DDD\u7684\u9ED8\u8BA4\u5927\u5C0F\u3002",
    marginCompact: "\u7D27\u51D1",
    marginNormal: "\u6807\u51C6",
    marginWide: "\u5BBD\u677E",
    printBackground: "\u6253\u5370\u80CC\u666F",
    printBackgroundDescription: "\u4FDD\u7559\u4EE3\u7801\u5757\u3001\u8868\u683C\u7B49\u533A\u57DF\u7684\u80CC\u666F\u8272\u3002",
    headerFooter: "\u9875\u7709\u9875\u811A",
    headerFooterDescription: "\u5728 PDF \u4E2D\u663E\u793A\u6D4F\u89C8\u5668\u9875\u7709\u9875\u811A\u4FE1\u606F\u3002",
    imageMode: "\u56FE\u7247\u5904\u7406\u65B9\u5F0F",
    imageModeDescription: "\u8BBE\u7F6E HTML \u5BFC\u51FA\u65F6\u56FE\u7247\u8D44\u6E90\u7684\u4FDD\u5B58\u65B9\u5F0F\u3002",
    imageModeRelative: "\u76F8\u5BF9\u8DEF\u5F84",
    imageModeBase64: "\u5D4C\u5165 Base64",
    imageModeExternal: "\u5916\u94FE / \u6587\u4EF6 URL",
    terminal: "\u7EC8\u7AEF",
    shortcuts: "\u5FEB\u6377\u952E",
    notImplemented: "\u6682\u672A\u5B9E\u73B0"
  },
  sidebar: {
    files: "\u6587\u4EF6",
    search: "\u641C\u7D22",
    terminal: "\u7EC8\u7AEF"
  },
  search: {
    workspaceTitle: "\u5DE5\u4F5C\u533A\u641C\u7D22",
    searchPlaceholder: "\u641C\u7D22",
    replacePlaceholder: "\u66FF\u6362\u4E3A",
    includePlaceholder: "\u5305\u542B Glob\uFF0C\u4F8B\u5982 **/*.md",
    excludePlaceholder: "\u6392\u9664 Glob\uFF0C\u4F8B\u5982 **/node_modules/**",
    caseSensitive: "\u533A\u5206\u5927\u5C0F\u5199",
    wholeWord: "\u5168\u8BCD\u5339\u914D",
    regex: "\u6B63\u5219",
    searching: "\u641C\u7D22\u4E2D...",
    searchAction: "\u5F00\u59CB\u641C\u7D22",
    preparingReplace: "\u751F\u6210\u9884\u89C8...",
    previewReplace: "\u9884\u89C8\u66FF\u6362",
    resultSummary: "{{files}} \u4E2A\u6587\u4EF6\uFF0C{{matches}} \u5904\u5339\u914D",
    emptySearch: "\u8F93\u5165\u5185\u5BB9\u540E\u5373\u53EF\u5728\u5F53\u524D\u5DE5\u4F5C\u533A\u4E2D\u641C\u7D22\u3002",
    openWorkspaceFirst: "\u5148\u6253\u5F00\u4E00\u4E2A\u5DE5\u4F5C\u533A\uFF0C\u624D\u80FD\u8FDB\u884C\u5168\u5C40\u641C\u7D22\u3002",
    previewSummary: "{{files}} \u4E2A\u6587\u4EF6\u5C06\u66F4\u65B0\uFF0C\u5171 {{count}} \u5904\u66FF\u6362",
    applyReplace: "\u5E94\u7528\u66FF\u6362",
    lineLabel: "\u7B2C {{line}} \u884C",
    noResults: "\u6CA1\u6709\u5339\u914D\u7ED3\u679C",
    confirmWorkspaceReplace: "\u786E\u8BA4\u66FF\u6362\u5168\u90E8 {{count}} \u5904\u5339\u914D\u5417\uFF1F",
    inlineSummary: "{{current}} / {{total}}",
    inlineHint: "Enter \u4E0B\u4E00\u4E2A\uFF0CShift+Enter \u4E0A\u4E00\u4E2A\uFF0CEsc \u5173\u95ED",
    replaceCurrent: "\u66FF\u6362\u5F53\u524D",
    replaceAll: "\u5168\u90E8\u66FF\u6362"
  },
  contextMenu: {
    body: "\u6B63\u6587",
    heading1: "\u6807\u9898 1",
    heading2: "\u6807\u9898 2",
    heading3: "\u6807\u9898 3",
    heading4: "\u6807\u9898 4",
    heading5: "\u6807\u9898 5",
    heading6: "\u6807\u9898 6"
  },
  table: {
    insertLineBreak: "\u5355\u5143\u683C\u5185\u6362\u884C",
    exitTable: "\u8DF3\u51FA\u8868\u683C",
    insertRowAbove: "\u5728\u4E0A\u65B9\u63D2\u5165\u884C",
    insertRowBelow: "\u5728\u4E0B\u65B9\u63D2\u5165\u884C",
    insertColumnLeft: "\u5728\u5DE6\u4FA7\u63D2\u5165\u5217",
    insertColumnRight: "\u5728\u53F3\u4FA7\u63D2\u5165\u5217",
    alignLeft: "\u5DE6\u5BF9\u9F50\u5217",
    alignCenter: "\u5C45\u4E2D\u5BF9\u9F50\u5217",
    alignRight: "\u53F3\u5BF9\u9F50\u5217",
    deleteRow: "\u5220\u9664\u5F53\u524D\u884C",
    deleteColumn: "\u5220\u9664\u5F53\u524D\u5217",
    deleteTable: "\u5220\u9664\u8868\u683C"
  },
  floatingToolbar: {
    paragraphFormat: "\u6BB5\u843D\u683C\u5F0F",
    bold: "\u7C97\u4F53 (Ctrl+B)",
    italic: "\u659C\u4F53 (Ctrl+I)",
    strikethrough: "\u5220\u9664\u7EBF",
    inlineCode: "\u884C\u5185\u4EE3\u7801",
    link: "\u94FE\u63A5 (Ctrl+K)",
    body: "\u6B63\u6587",
    heading1: "\u6807\u9898 1",
    heading2: "\u6807\u9898 2",
    heading3: "\u6807\u9898 3",
    heading4: "\u6807\u9898 4",
    heading5: "\u6807\u9898 5",
    heading6: "\u6807\u9898 6"
  },
  titleBar: {
    switchThemeTo: "\u5207\u6362\u5230{{theme}}\u4E3B\u9898 (Ctrl+Shift+D)",
    lightTheme: "\u4EAE\u8272",
    darkTheme: "\u6697\u8272",
    minimize: "\u6700\u5C0F\u5316",
    maximize: "\u6700\u5927\u5316",
    restore: "\u8FD8\u539F",
    close: "\u5173\u95ED"
  }
};

// electron/terminal.ts
var fs2 = __toESM(require("fs"));
var os = __toESM(require("os"));
var import_node_pty = require("node-pty");
var terminals = /* @__PURE__ */ new Map();
var nextTerminalId = 1;
function resolveTerminalCwd(cwd) {
  if (cwd && fs2.existsSync(cwd)) {
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
var SEARCHABLE_EXTENSIONS = /* @__PURE__ */ new Set([".md", ".markdown", ".mdx", ".txt"]);
var translations = { en: en_default, zh: zh_default };
function translate(language, key) {
  const segments = key.split(".");
  let value = translations[language];
  for (const segment of segments) {
    if (!value || typeof value !== "object") {
      return key;
    }
    value = value[segment];
  }
  return typeof value === "string" ? value : key;
}
function sendMenuAction(action) {
  mainWindow?.webContents.send("menu-action", action);
}
function buildNativeMenu() {
  const t = (key) => translate(currentLanguage, key);
  const template = [
    {
      label: t("menu.file"),
      submenu: [
        { label: t("menu.newFile"), accelerator: "Ctrl+N", click: () => sendMenuAction("new-file") },
        { label: t("menu.openFile"), accelerator: "Ctrl+O", click: () => sendMenuAction("open-file") },
        { label: t("menu.openFolder"), accelerator: "Ctrl+Shift+O", click: () => sendMenuAction("open-folder") },
        { type: "separator" },
        { label: t("menu.save"), accelerator: "Ctrl+S", click: () => sendMenuAction("save") },
        { label: t("menu.saveAs"), click: () => sendMenuAction("save-as") },
        { type: "separator" },
        { label: t("menu.exportPdf"), click: () => sendMenuAction("export-pdf") },
        { label: t("menu.exportHtml"), click: () => sendMenuAction("export-html") },
        { type: "separator" },
        { label: t("menu.exit"), role: "quit" }
      ]
    },
    {
      label: t("menu.edit"),
      submenu: [
        { label: t("menu.undo"), accelerator: "Ctrl+Z", click: () => sendMenuAction("undo") },
        { label: t("menu.redo"), accelerator: "Ctrl+Shift+Z", click: () => sendMenuAction("redo") },
        { label: t("menu.find"), accelerator: "Ctrl+F", click: () => sendMenuAction("find-in-file") },
        {
          label: t("menu.findInWorkspace"),
          accelerator: "Ctrl+Shift+F",
          click: () => sendMenuAction("find-in-workspace")
        },
        { type: "separator" },
        { label: t("menu.selectAll"), accelerator: "Ctrl+A", click: () => sendMenuAction("select-all") }
      ]
    },
    {
      label: t("menu.paragraph"),
      submenu: [
        { label: t("menu.heading1"), accelerator: "Ctrl+1", click: () => sendMenuAction("heading-1") },
        { label: t("menu.heading2"), accelerator: "Ctrl+2", click: () => sendMenuAction("heading-2") },
        { label: t("menu.heading3"), accelerator: "Ctrl+3", click: () => sendMenuAction("heading-3") },
        { label: t("menu.body"), accelerator: "Ctrl+0", click: () => sendMenuAction("body") },
        { type: "separator" },
        { label: t("menu.orderedList"), click: () => sendMenuAction("ordered-list") },
        { label: t("menu.unorderedList"), click: () => sendMenuAction("unordered-list") },
        { label: t("menu.quote"), click: () => sendMenuAction("blockquote") }
      ]
    },
    {
      label: t("menu.format"),
      submenu: [
        { label: t("menu.bold"), accelerator: "Ctrl+B", click: () => sendMenuAction("bold") },
        { label: t("menu.italic"), accelerator: "Ctrl+I", click: () => sendMenuAction("italic") },
        {
          label: t("menu.strikethrough"),
          accelerator: "Ctrl+Shift+S",
          click: () => sendMenuAction("strikethrough")
        },
        { label: t("menu.inlineCode"), click: () => sendMenuAction("inline-code") },
        { type: "separator" },
        { label: t("menu.link"), accelerator: "Ctrl+K", click: () => sendMenuAction("link") }
      ]
    },
    {
      label: t("menu.view"),
      submenu: [
        { label: t("menu.sidebar"), accelerator: "Ctrl+\\", click: () => sendMenuAction("toggle-sidebar") },
        {
          label: t("menu.outline"),
          accelerator: "Ctrl+Shift+\\",
          click: () => sendMenuAction("toggle-outline")
        },
        {
          label: t("menu.terminal"),
          accelerator: "Ctrl+`",
          click: () => sendMenuAction("toggle-terminal")
        },
        {
          label: t("menu.newTerminal"),
          accelerator: "Ctrl+Shift+`",
          click: () => sendMenuAction("new-terminal")
        },
        { type: "separator" },
        { label: t("menu.zoomIn"), click: () => sendMenuAction("zoom-in") },
        { label: t("menu.zoomOut"), click: () => sendMenuAction("zoom-out") },
        { type: "separator" },
        {
          label: t("shortcuts.toggleTheme"),
          accelerator: "Ctrl+Shift+D",
          click: () => sendMenuAction("toggle-theme")
        }
      ]
    },
    {
      label: t("menu.settings"),
      submenu: [
        { label: t("menu.settings"), accelerator: "Ctrl+,", click: () => sendMenuAction("open-settings") },
        { label: t("menu.exportSettings"), click: () => sendMenuAction("open-export-settings") },
        { label: t("menu.shortcuts"), click: () => sendMenuAction("open-shortcuts") },
        { type: "separator" },
        {
          label: currentLanguage === "zh" ? t("menu.switchToEnglish") : t("menu.switchToChinese"),
          click: () => sendMenuAction("toggle-language")
        }
      ]
    }
  ];
  import_electron.Menu.setApplicationMenu(import_electron.Menu.buildFromTemplate(template));
}
function writeFileAtomically(filePath, content) {
  const dir = path3.dirname(filePath);
  const tempFile = path3.join(dir, `.tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  fs3.writeFileSync(tempFile, content, "utf-8");
  rememberRecentWrite(recentWrites, filePath);
  fs3.renameSync(tempFile, filePath);
}
function collectWorkspaceFiles(rootDir) {
  const files = [];
  const queue = [rootDir];
  while (queue.length > 0) {
    const currentDir = queue.shift();
    if (!currentDir) continue;
    let entries = [];
    try {
      entries = fs3.readdirSync(currentDir, { withFileTypes: true });
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
  const baseName = payload.currentFilePath ? path3.parse(payload.currentFilePath).name : payload.title.replace(/\.[^.]+$/, "") || translate(currentLanguage, "fileTree.untitled");
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
    fs3.writeFileSync(selectedPath.filePath, documentHtml, "utf-8");
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
    fs3.writeFileSync(selectedPath.filePath, pdfBuffer);
    return { canceled: false, path: selectedPath.filePath };
  } finally {
    if (!printWindow.isDestroyed()) {
      printWindow.close();
    }
  }
}
function createWindow() {
  buildNativeMenu();
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
    mainWindow = null;
  });
}
import_electron.ipcMain.handle("read_file", async (_, filePath) => {
  return fs3.readFileSync(filePath, "utf-8");
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
function hasMarkdownFiles(dirPath) {
  try {
    const entries = fs3.readdirSync(dirPath, { withFileTypes: true });
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
      const entries = fs3.readdirSync(dirPath, { withFileTypes: true });
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
  const entries = fs3.readdirSync(dirPath, { withFileTypes: true });
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
  fs3.writeFileSync(filePath, "", "utf-8");
});
import_electron.ipcMain.handle("delete_path", async (_, targetPath) => {
  const stat = fs3.statSync(targetPath);
  if (stat.isDirectory()) {
    fs3.rmSync(targetPath, { recursive: true });
  } else {
    fs3.unlinkSync(targetPath);
  }
});
import_electron.ipcMain.handle("rename_path", async (_, oldPath, newPath) => {
  fs3.renameSync(oldPath, newPath);
});
import_electron.ipcMain.handle("show_save_dialog", async (_, options) => {
  const result = await import_electron.dialog.showSaveDialog({
    defaultPath: options.defaultPath,
    filters: options.filters || [{ name: translate(currentLanguage, "common.markdown"), extensions: ["md"] }]
  });
  return result.canceled ? null : result.filePath;
});
import_electron.ipcMain.handle("set_language_preference", async (_, language) => {
  currentLanguage = resolveLanguage(language, currentLanguage);
  buildNativeMenu();
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
      const content = fs3.readFileSync(filePath, "utf-8");
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
        const content = fs3.readFileSync(filePath, "utf-8");
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
  if (!fs3.existsSync(resourcesDir)) {
    fs3.mkdirSync(resourcesDir, { recursive: true });
  }
  const filename = `${Date.now()}-${(++imageCounter).toString(36).slice(-8)}.${ext}`;
  const fullPath = path3.join(resourcesDir, filename);
  const buffer = Buffer.from(data);
  fs3.writeFileSync(fullPath, buffer);
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
    const watcher = fs3.watch(path3.dirname(filePath), (_eventType, filename) => {
      if (!matchesWatchedFile(filePath, filename)) return;
      if (shouldIgnoreWatchEvent(recentWrites, filePath)) return;
      if (fs3.existsSync(filePath)) {
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
import_electron.app.whenReady().then(() => {
  buildNativeMenu();
  createWindow();
});
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
