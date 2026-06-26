/**
 * PDF 导出样式 —— 简洁、打印优化的 CSS（fork 自 markra）。
 * 不依赖 Vditor 预览渲染，直接包裹 markdown 转换后的 HTML。
 */
import katexStyles from "katex/dist/katex.css?raw";

const defaultPdfMarginMm = 18;
const defaultPdfPageHeightMm = 297;
const defaultPdfPageWidthMm = 210;

export type PdfStyleOptions = {
  pdfFooter?: string;
  pdfHeader?: string;
  pdfHeightMm?: number;
  pdfMarginMm?: number;
  pdfPageBreakOnH1?: boolean;
  pdfWidthMm?: number;
};

function normalizePdfMarginMm(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return defaultPdfMarginMm;
  return Math.min(Math.max(Math.round(value), 0), 60);
}

function normalizePdfPageDimensionMm(value: number | undefined, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.round(value), 50), 2000);
}

export function createPdfStyles(options: PdfStyleOptions = {}) {
  const pageMarginMm = normalizePdfMarginMm(options.pdfMarginMm);
  const pageHeightMm = normalizePdfPageDimensionMm(options.pdfHeightMm, defaultPdfPageHeightMm);
  const pageWidthMm = normalizePdfPageDimensionMm(options.pdfWidthMm, defaultPdfPageWidthMm);
  const pageBreakStyles = options.pdfPageBreakOnH1
    ? `\n.markdown-export h1 { break-before: page; }\n.markdown-export h1:first-child { break-before: auto; }`
    : "";

  return `
${katexStyles}

:root {
  color: #222;
  background: #fff;
  font-family: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
}

body {
  margin: 0;
  background: #fff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.markdown-export {
  box-sizing: border-box;
  max-width: 860px;
  margin: 0 auto;
  padding: 48px 56px;
  font-size: 16px;
  line-height: 1.65;
}

.markdown-export h1, .markdown-export h2, .markdown-export h3,
.markdown-export h4, .markdown-export h5, .markdown-export h6 {
  color: #111;
  line-height: 1.25;
}

.markdown-export img { max-width: 100%; height: auto; }

.markdown-export pre {
  overflow-x: auto;
  padding: 16px;
  background: #f6f6f6;
  border-radius: 6px;
}

.markdown-export code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
}

.markdown-export table { width: 100%; border-collapse: collapse; }

.markdown-export th, .markdown-export td {
  padding: 8px 10px;
  border: 1px solid #ddd;
  text-align: left;
}

.markdown-export blockquote {
  margin: 1em 0;
  padding-left: 1em;
  border-left: 4px solid #d8d8d8;
  color: #555;
}

@media print {
  .markdown-export {
    max-width: none;
    margin: 0;
    padding: 0;
  }

  .markdown-export h1, .markdown-export h2, .markdown-export h3,
  .markdown-export h4, .markdown-export h5, .markdown-export h6 {
    break-after: avoid-page;
    page-break-after: avoid;
  }

  .markdown-export pre, .markdown-export table, .markdown-export blockquote {
    break-inside: avoid-page;
    page-break-inside: avoid;
  }

  .markdown-export tr, .markdown-export img, .markdown-export svg {
    break-inside: avoid-page;
    page-break-inside: avoid;
  }

  .markdown-export thead { display: table-header-group; }
  .markdown-export tfoot { display: table-footer-group; }

  .markdown-export pre, .markdown-export pre code {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
${pageBreakStyles}
}

@page {
  size: ${pageWidthMm}mm ${pageHeightMm}mm;
  margin: ${pageMarginMm}mm;
}
`.trim();
}

export const pdfExportDefaultStyles = createPdfStyles();

function escapeHtml(text: string) {
  return text
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

export function buildPdfHtmlDocument(bodyHtml: string, title: string, styles?: string): string {
  const escapedTitle = escapeHtml(title.trim() || "Untitled");
  const docStyles = styles ?? pdfExportDefaultStyles;

  return [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapedTitle}</title>`,
    "<style>",
    docStyles,
    "</style>",
    "</head>",
    "<body>",
    '<main class="markdown-export">',
    bodyHtml,
    "</main>",
    "</body>",
    "</html>",
  ].join("\n");
}

export function exportFileName(documentName: string, format: "pdf" | "docx" | "html"): string {
  const trimmedName = documentName.trim();
  const baseName = (trimmedName || "Untitled")
    .replace(/\.(?:md|markdown|txt)$/iu, "")
    .trim() || "Untitled";
  return `${baseName}.${format}`;
}
