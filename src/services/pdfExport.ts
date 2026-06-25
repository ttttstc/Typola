import { invoke } from '@tauri-apps/api/core';
import vditorBaseCss from 'vditor/dist/index.css?raw';
import hljsGithubCss from 'vditor/dist/js/highlight.js/styles/github.min.css?raw';
import hljsGithubDarkCss from 'vditor/dist/js/highlight.js/styles/github-dark.min.css?raw';
import pdfDocumentCss from '../styles/pdf.css?raw';
import { detectMarkdownRenderFeatures } from './markdownFeatureDetector';
import { VDITOR_PREVIEW_I18N } from './vditorPreviewConfig';
import { resolveLocalImages } from './localImageResolver';
import { renderMermaidIn } from './mermaidRenderer';
import type { AppSettings } from './settingsService';
import { createExportFileName, resolveDefaultExportPath } from './exportPathService';

const PDF_RENDER_HOST_WIDTH_PX = 794;
const PDF_RENDER_HOST_MIN_HEIGHT_PX = 1123;
// race 兜底:3.5s 偏激 —— 大图/远程图/多图常被截断进 broken image。12s 平衡。
const PDF_IMAGE_WAIT_TIMEOUT_MS = 12_000;
const DEFAULT_PDF_PAGE_SIZE = 'A4';
const DEFAULT_PDF_PAGE_MARGIN = '2cm';

let activePdfExport: Promise<PdfExportResult> | null = null;

export type PdfExportTheme = AppSettings['theme'];
export type PdfExportResult =
  | { status: 'saved'; savePath: string }
  | { status: 'cancelled' };
export type PdfExportStatus =
  | { phase: 'preparing'; savePath: string }
  | { phase: 'exporting'; savePath: string };
export type PdfExportOptions = {
  content: string;
  fileName: string;
  filePath?: string;
  theme: PdfExportTheme;
  resolvedPreviewFontFamily: string;
  resolvedPreviewHeadingFontFamily: string;
  previewFontSize: number;
  previewLineHeight: number;
  onStatusChange?: (status: PdfExportStatus) => void;
};

export async function exportToPdf(options: PdfExportOptions): Promise<PdfExportResult> {
  if (activePdfExport) {
    throw new Error('PDF 正在导出，请等待当前任务完成。');
  }

  activePdfExport = runPdfExport(options);
  try {
    return await activePdfExport;
  } finally {
    activePdfExport = null;
  }
}

export function createPdfExportFileName(input: string): string {
  return createExportFileName(input, 'pdf');
}

async function runPdfExport(options: PdfExportOptions): Promise<PdfExportResult> {
  const savePath = await resolveDefaultExportPath({
    fileName: options.fileName,
    filePath: options.filePath,
    extension: 'pdf',
  });

  options.onStatusChange?.({ phase: 'preparing', savePath });
  const html = await renderPdfHtml(options);

  options.onStatusChange?.({ phase: 'exporting', savePath });
  const writtenPath = await invoke<string>('export_pdf', {
    request: { savePath, html },
  });

  return {
    status: 'saved',
    savePath: writtenPath || savePath,
  };
}

async function renderPdfHtml(options: PdfExportOptions): Promise<string> {
  const host = createRenderHost();
  const article = document.createElement('div');
  article.className = 'vditor-reset preview-content typola-pdf-print-article';
  host.append(article);
  document.body.append(host);

  try {
    await renderMarkdownInto(article, options.content, options.filePath, options.theme);
    await waitForImages(host);
    return buildPdfHtmlFragment(article.innerHTML, options);
  } finally {
    host.remove();
  }
}

function createRenderHost(): HTMLElement {
  const host = document.createElement('section');
  host.setAttribute('aria-hidden', 'true');
  Object.assign(host.style, {
    position: 'fixed',
    top: '0',
    left: '-100000px',
    width: `${PDF_RENDER_HOST_WIDTH_PX}px`,
    minHeight: `${PDF_RENDER_HOST_MIN_HEIGHT_PX}px`,
    opacity: '0',
    pointerEvents: 'none',
    overflow: 'hidden',
    zIndex: '-1',
  } satisfies Partial<CSSStyleDeclaration>);
  return host;
}

async function renderMarkdownInto(
  container: HTMLDivElement,
  content: string,
  filePath: string | undefined,
  theme: PdfExportTheme,
): Promise<void> {
  if (!content.trim()) {
    container.innerHTML = '';
    return;
  }

  const [{ default: Vditor }] = await Promise.all([
    import('vditor/dist/index.css'),
    import('vditor'),
  ]).then(([, vditor]) => [vditor] as const);
  const renderFeatures = detectMarkdownRenderFeatures(content);

  await new Promise<void>((resolve) => {
    Vditor.preview(container, content, {
      mode: theme,
      anchor: 0,
      cdn: '/vditor',
      i18n: VDITOR_PREVIEW_I18N,
      icon: undefined,
      theme: {
        current: theme,
        path: '',
      },
      hljs: {
        style: theme === 'dark' ? 'github-dark' : 'github',
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

  await renderMermaidIn(container);
  await resolveLocalImages(container, filePath);
}

function buildPdfHtmlFragment(articleHtml: string, options: PdfExportOptions): string {
  const themeCss = options.theme === 'dark' ? hljsGithubDarkCss : hljsGithubCss;
  const stylesheet = buildPdfStylesheet({
    previewFontFamily: options.resolvedPreviewFontFamily,
    previewHeadingFontFamily: options.resolvedPreviewHeadingFontFamily,
    previewFontSize: options.previewFontSize,
    previewLineHeight: options.previewLineHeight,
    themeCss,
  });

  return [
    `<style data-typola-pdf-styles>${stylesheet}</style>`,
    `<div class="typola-pdf-document" data-theme="${options.theme}">`,
    `<article class="vditor-reset preview-content typola-pdf-print-article">${articleHtml}</article>`,
    '</div>',
  ].join('');
}

function buildPdfStylesheet(input: {
  previewFontFamily: string;
  previewHeadingFontFamily: string;
  previewFontSize: number;
  previewLineHeight: number;
  themeCss: string;
}): string {
  const headingFontFamily = input.previewHeadingFontFamily.includes('var(')
    ? input.previewFontFamily
    : input.previewHeadingFontFamily;
  const themeVariables = `
@page {
  size: ${DEFAULT_PDF_PAGE_SIZE};
  margin: ${DEFAULT_PDF_PAGE_MARGIN};
}

.typola-pdf-document {
  --typola-pdf-font-family: ${input.previewFontFamily};
  --typola-pdf-heading-font-family: ${headingFontFamily};
  --typola-pdf-font-size: ${Math.max(10, input.previewFontSize)}px;
  --typola-pdf-line-height: ${Math.max(1.2, input.previewLineHeight)};
}
`;

  return [vditorBaseCss, input.themeCss, pdfDocumentCss, themeVariables].join('\n');
}

async function waitForImages(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll<HTMLImageElement>('img'));
  if (images.length === 0) return;

  await Promise.race([
    Promise.all(images.map((image) => waitForImage(image))),
    new Promise<void>((resolve) => window.setTimeout(resolve, PDF_IMAGE_WAIT_TIMEOUT_MS)),
  ]);
}

function waitForImage(image: HTMLImageElement): Promise<void> {
  if (image.complete) return Promise.resolve();
  return new Promise((resolve) => {
    image.addEventListener('load', () => resolve(), { once: true });
    image.addEventListener('error', () => resolve(), { once: true });
  });
}
