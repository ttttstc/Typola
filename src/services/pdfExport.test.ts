import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPdfExportFileName, exportToPdf } from './pdfExport';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: vi.fn() }));
vi.mock('@tauri-apps/api/path', () => ({ downloadDir: vi.fn().mockResolvedValue('C:\\Users\\tester\\Downloads') }));
vi.mock('@tauri-apps/plugin-fs', () => ({ exists: vi.fn().mockResolvedValue(false) }));
vi.mock('./markdownExportRenderer', () => ({ markdownToExportHtml: vi.fn().mockResolvedValue('<h1>标题</h1>') }));

import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { markdownToExportHtml } from './markdownExportRenderer';

describe('createPdfExportFileName', () => {
  beforeEach(() => vi.clearAllMocks());

  it('replaces markdown and html extensions with pdf', () => {
    expect(createPdfExportFileName('draft.md')).toBe('draft.pdf');
    expect(createPdfExportFileName('draft.markdown')).toBe('draft.pdf');
    expect(createPdfExportFileName('draft.html')).toBe('draft.pdf');
    expect(createPdfExportFileName('draft.htm')).toBe('draft.pdf');
  });

  it('preserves existing pdf names and appends pdf for extensionless input', () => {
    expect(createPdfExportFileName('draft.pdf')).toBe('draft.pdf');
    expect(createPdfExportFileName('draft')).toBe('draft.pdf');
  });

  it('falls back for blank input', () => {
    expect(createPdfExportFileName('   ')).toBe('document.pdf');
  });

  it('uses a save dialog so users can choose the PDF destination folder', async () => {
    vi.mocked(save).mockResolvedValueOnce('D:\\exports\\draft.pdf');
    const stages: Array<[number, string]> = [];

    await expect(exportToPdf({
      content: '# 标题', fileName: 'draft.md', filePath: 'D:\\docs\\draft.md',
      resolvedPreviewFontFamily: 'Arial', resolvedPreviewHeadingFontFamily: 'Arial',
      previewFontSize: 16, previewLineHeight: 1.6,
    }, (progress, detail) => stages.push([progress, detail]))).resolves.toBe('D:\\exports\\draft.pdf');

    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    }));
    expect(invoke).toHaveBeenCalledWith('export_pdf_file', expect.objectContaining({ path: 'D:\\exports\\draft.pdf' }));
    expect(stages).toEqual([
      [5, '选择保存位置'],
      [18, '解析 Markdown 与本地资源'],
      [62, '完成页面排版'],
      [72, '生成 PDF 页面'],
      [100, 'PDF 文件已写入'],
    ]);
  });

  it('does not render when the user cancels the destination dialog', async () => {
    vi.mocked(save).mockResolvedValueOnce(null);

    await expect(exportToPdf({
      content: '# 标题', fileName: 'draft.md',
      resolvedPreviewFontFamily: 'Arial', resolvedPreviewHeadingFontFamily: 'Arial',
      previewFontSize: 16, previewLineHeight: 1.6,
    })).resolves.toBeNull();

    expect(markdownToExportHtml).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });
});
