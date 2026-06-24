import { save } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { detectMarkdownRenderFeatures } from './markdownFeatureDetector';
import { VDITOR_PREVIEW_I18N } from './vditorPreviewConfig';
import { resolveLocalImages } from './localImageResolver';
import { renderMermaidIn } from './mermaidRenderer';

const PRINT_ROOT_CLASS = 'typola-pdf-print-root';

export type PdfExportResult = 'saved' | 'cancelled';

export async function exportToPdf(
  content: string,
  fileName: string,
  filePath?: string,
): Promise<PdfExportResult> {
  const savePath = await save({
    defaultPath: createPdfExportFileName(filePath || fileName),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (!savePath) return 'cancelled';

  const cleanup = await preparePdfPrintRoot(content, filePath);
  try {
    await invoke('export_pdf', { request: { savePath } });
  } finally {
    cleanup();
  }
  return 'saved';
}

export function createPdfExportFileName(input: string): string {
  const fallback = input.trim() || 'document.md';
  if (/\.(md|markdown|html|htm)$/i.test(fallback)) {
    return fallback.replace(/\.(md|markdown|html|htm)$/i, '.pdf');
  }
  if (/\.pdf$/i.test(fallback)) return fallback;
  return `${fallback}.pdf`;
}

async function preparePdfPrintRoot(content: string, filePath?: string): Promise<() => void> {
  const root = document.createElement('section');
  root.className = PRINT_ROOT_CLASS;
  root.setAttribute('aria-hidden', 'true');

  const article = document.createElement('div');
  article.className = 'vditor-reset preview-content typola-pdf-print-article';
  root.append(article);
  document.body.append(root);

  await renderMarkdownInto(article, content, filePath);
  await waitForImages(root);

  return () => root.remove();
}

async function renderMarkdownInto(container: HTMLDivElement, content: string, filePath?: string): Promise<void> {
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
      mode: 'light',
      anchor: 0,
      cdn: '/vditor',
      i18n: VDITOR_PREVIEW_I18N,
      icon: undefined,
      theme: {
        current: 'light',
        path: '',
      },
      hljs: {
        style: 'github',
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

async function waitForImages(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll<HTMLImageElement>('img'));
  if (images.length === 0) return;

  await Promise.race([
    Promise.all(images.map((image) => waitForImage(image))),
    new Promise<void>((resolve) => window.setTimeout(resolve, 8000)),
  ]);
}

function waitForImage(image: HTMLImageElement): Promise<void> {
  if (image.complete) return Promise.resolve();
  return new Promise((resolve) => {
    image.addEventListener('load', () => resolve(), { once: true });
    image.addEventListener('error', () => resolve(), { once: true });
  });
}
