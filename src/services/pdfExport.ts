/**
 * PDF 导出 —— 使用系统 Chrome/Edge 无头浏览器渲染（fork 自 markra）。
 * 先通过统一 Markdown export renderer 渲染 markdown → HTML，再包装为独立 HTML 文档，
 * 交给 Rust 后端用系统浏览器执行 print-to-pdf。
 */
import { invoke } from '@tauri-apps/api/core';
import { buildPdfHtmlDocument, exportFileName } from './pdfExportStyles';
import { resolveDefaultExportPath, createExportFileName } from './exportPathService';
import { markdownToExportHtml } from './markdownExportRenderer';

export type PdfExportTheme = 'light' | 'dark';
export type PdfExportOptions = {
  content: string;
  fileName: string;
  filePath?: string;
  theme?: PdfExportTheme;
  resolvedPreviewFontFamily: string;
  resolvedPreviewHeadingFontFamily: string;
  previewFontSize: number;
  previewLineHeight: number;
};

export function pdfExportFileName(input: string): string {
  return exportFileName(input, 'pdf');
}

export function createPdfExportFileName(input: string): string {
  const base = input.trim() || 'document';
  if (/\.pdf$/i.test(base)) return base;
  return base.replace(/\.(md|markdown|html|htm)$/iu, '') + '.pdf';
}

/**
 * 渲染 markdown 为独立 HTML 文档，交给系统浏览器导出 PDF。
 */
async function renderExportHtml(options: PdfExportOptions): Promise<string> {
  const bodyHtml = await markdownToExportHtml(options.content, {
    filePath: options.filePath,
    theme: options.theme ?? 'light',
  });
  return buildPdfHtmlDocument(bodyHtml, options.fileName);
}

/**
 * 导出 PDF：渲染 markdown → 自动写入默认导出路径 → 调用系统浏览器导出。
 * 全程不阻塞页面编辑。
 */
export async function exportToPdf(options: PdfExportOptions): Promise<string | null> {
  // 1. 渲染 HTML（后台 DOM，不影响用户编辑）
  const html = await renderExportHtml(options);

  // 2. 自动解析导出路径，不弹保存对话框。
  const targetPath = await resolveDefaultExportPath({
    fileName: createExportFileName(options.fileName, 'pdf'),
    filePath: options.filePath,
    extension: 'pdf',
  });

  // 3. 交给 Rust 后端用系统浏览器导出
  await invoke('export_pdf_file', { path: targetPath, html });
  return targetPath;
}
