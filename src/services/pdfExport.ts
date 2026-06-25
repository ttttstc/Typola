/**
 * PDF 导出 —— 使用系统 Chrome/Edge 无头浏览器渲染（fork 自 markra）。
 * 先通过 Vditor 渲染 markdown → HTML，再包装为独立 HTML 文档，
 * 交给 Rust 后端用系统浏览器执行 print-to-pdf。
 */
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { detectMarkdownRenderFeatures } from './markdownFeatureDetector';
import { VDITOR_PREVIEW_I18N } from './vditorPreviewConfig';
import { resolveLocalImages } from './localImageResolver';
import { renderMermaidIn } from './mermaidRenderer';
import { buildPdfHtmlDocument, exportFileName } from './pdfExportStyles';
import type { AppSettings } from './settingsService';
import { resolveDefaultExportPath, createExportFileName } from './exportPathService';

export type PdfExportTheme = AppSettings['theme'];
export type PdfExportOptions = {
  content: string;
  fileName: string;
  filePath?: string;
  theme: PdfExportTheme;
  resolvedPreviewFontFamily: string;
  resolvedPreviewHeadingFontFamily: string;
  previewFontSize: number;
  previewLineHeight: number;
};

export function pdfExportFileName(input: string): string {
  return exportFileName(input, 'pdf');
}

/**
 * 渲染 markdown 为 HTML（复用 Vditor 离线渲染，高质量）。
 * 然后包装为独立 HTML 文档，交给系统浏览器导出 PDF。
 */
async function renderExportHtml(options: PdfExportOptions): Promise<string> {
  const host = document.createElement('section');
  host.setAttribute('aria-hidden', 'true');
  Object.assign(host.style, {
    position: 'fixed',
    top: '0',
    left: '-100000px',
    width: '794px',
    minHeight: '1123px',
    opacity: '0',
    pointerEvents: 'none',
    overflow: 'hidden',
    zIndex: '-1',
  });

  const article = document.createElement('div');
  article.className = 'vditor-reset preview-content';
  host.append(article);
  document.body.append(host);

  try {
    if (!options.content.trim()) {
      return buildPdfHtmlDocument('', options.fileName);
    }

    const [{ default: Vditor }] = await Promise.all([
      import('vditor/dist/index.css'),
      import('vditor'),
    ]).then(([, vditor]) => [vditor] as const);
    const renderFeatures = detectMarkdownRenderFeatures(options.content);

    await new Promise<void>((resolve) => {
      Vditor.preview(article, options.content, {
        mode: options.theme,
        anchor: 0,
        cdn: '/vditor',
        i18n: VDITOR_PREVIEW_I18N,
        icon: undefined,
        theme: {
          current: options.theme,
          path: '',
        },
        hljs: {
          style: options.theme === 'dark' ? 'github-dark' : 'github',
          enable: renderFeatures.hasHighlightableCode,
          lineNumber: false,
        },
        markdown: {
          sanitize: true,
        },
        after() {
          resolve();
        },
      });
    });

    await renderMermaidIn(article);
    await resolveLocalImages(article, options.filePath);

    return buildPdfHtmlDocument(article.innerHTML, options.fileName);
  } finally {
    host.remove();
  }
}

/**
 * 导出 PDF：渲染 markdown → 弹出保存对话框 → 调用系统浏览器导出。
 * 全程不阻塞页面编辑。
 */
export async function exportToPdf(options: PdfExportOptions): Promise<string | null> {
  // 1. 渲染 HTML（后台 DOM，不影响用户编辑）
  const html = await renderExportHtml(options);

  // 2. 弹出保存对话框
  const defaultPath = await resolveDefaultExportPath({
    fileName: createExportFileName(options.fileName, 'pdf'),
    filePath: options.filePath,
    extension: 'pdf',
  });

  const targetPath = await save({
    defaultPath,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });

  if (!targetPath) return null;

  // 3. 交给 Rust 后端用系统浏览器导出
  await invoke('export_pdf_file', { path: targetPath, html });
  return targetPath;
}
