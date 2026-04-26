import * as fs from 'fs';
import * as path from 'path';

export type PdfPageSize = 'A4' | 'Letter';
export type PdfMarginPreset = 'compact' | 'normal' | 'wide';
export type HtmlImageMode = 'relative' | 'base64' | 'external';

export interface PdfExportOptions {
  pageSize: PdfPageSize;
  margin: PdfMarginPreset;
  printBackground: boolean;
  displayHeaderFooter: boolean;
}

export interface HtmlExportOptions {
  imageMode: HtmlImageMode;
}

export interface ExportPayload {
  type: 'pdf' | 'html';
  title: string;
  html: string;
  currentFilePath: string | null;
  theme: string;
  pdf: PdfExportOptions;
  htmlOptions: HtmlExportOptions;
}

const THEME_VARIABLES: Record<string, string> = {
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
  `,
} as const;

function getMarginValue(preset: PdfMarginPreset) {
  switch (preset) {
    case 'compact':
      return '12mm';
    case 'wide':
      return '24mm';
    default:
      return '18mm';
  }
}

export function getPdfPrintOptions(options: PdfExportOptions) {
  return {
    printBackground: options.printBackground,
    displayHeaderFooter: options.displayHeaderFooter,
    preferCSSPageSize: true,
    pageSize: options.pageSize,
    margins: {
      marginType: 'none',
    },
  };
}

function normalizeImageSource(source: string) {
  return source.trim().replace(/\\/g, '/');
}

function resolveLocalImagePath(currentFilePath: string | null, source: string) {
  if (!currentFilePath) return null;
  const normalized = normalizeImageSource(source);

  if (/^(https?:|data:|file:)/i.test(normalized)) {
    return null;
  }

  const baseDir = path.dirname(currentFilePath);
  return path.resolve(baseDir, normalized);
}

function ensureDirectory(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function imageMimeType(imagePath: string) {
  const ext = path.extname(imagePath).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'image/png';
  }
}

function buildFileUrl(filePath: string) {
  return `file:///${filePath.replace(/\\/g, '/')}`;
}

function getRelativeImageTarget(source: string) {
  const normalized = normalizeImageSource(source);

  if (/^[a-zA-Z]:\//.test(normalized)) {
    return path.posix.join('.resources', path.posix.basename(normalized));
  }

  const withoutDot = normalized.replace(/^\.\//, '');
  const sanitized = withoutDot.replace(/^(\.\.\/)+/g, '');
  return sanitized || path.posix.join('.resources', path.posix.basename(normalized));
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function rewriteHtmlImages(
  html: string,
  currentFilePath: string | null,
  outputPath: string,
  imageMode: HtmlImageMode
) {
  const imgRegex = /(<img\b[^>]*?\bsrc=")([^"]+)(")/gi;
  const outputDir = path.dirname(outputPath);

  return html.replace(imgRegex, (_fullMatch, prefix: string, source: string, suffix: string) => {
    const normalizedSource = normalizeImageSource(source);
    const localImagePath = resolveLocalImagePath(currentFilePath, normalizedSource);

    if (imageMode === 'base64' && localImagePath && fs.existsSync(localImagePath)) {
      const mime = imageMimeType(localImagePath);
      const encoded = fs.readFileSync(localImagePath).toString('base64');
      return `${prefix}data:${mime};base64,${encoded}${suffix}`;
    }

    if (imageMode === 'relative' && localImagePath && fs.existsSync(localImagePath)) {
      const relativeAssetPath = getRelativeImageTarget(normalizedSource);
      const targetPath = path.join(outputDir, relativeAssetPath);
      ensureDirectory(path.dirname(targetPath));
      if (path.resolve(localImagePath) !== path.resolve(targetPath)) {
        fs.copyFileSync(localImagePath, targetPath);
      }
      return `${prefix}${relativeAssetPath.replace(/\\/g, '/')}${suffix}`;
    }

    if (imageMode === 'external' && localImagePath && fs.existsSync(localImagePath)) {
      return `${prefix}${buildFileUrl(localImagePath)}${suffix}`;
    }

    return `${prefix}${normalizedSource}${suffix}`;
  });
}

export function buildExportDocumentHtml(
  title: string,
  bodyHtml: string,
  theme: string,
  options: { forPrint: boolean; pageSize?: PdfPageSize; margin?: PdfMarginPreset }
) {
  const margin = getMarginValue(options.margin ?? 'normal');
  const printPageSize = options.pageSize ?? 'A4';

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
        background: ${options.forPrint ? '#ffffff' : 'var(--color-paper)'};
        color: var(--color-ink);
        font-family: "Segoe UI", system-ui, sans-serif;
      }
      main {
        max-width: 820px;
        margin: 0 auto;
        padding: ${options.forPrint ? '0' : '48px 64px'};
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
