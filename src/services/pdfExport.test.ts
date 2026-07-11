import { describe, expect, it, vi } from 'vitest';
import { createPdfExportFileName, exportToPdf } from './pdfExport';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: vi.fn() }));
vi.mock('@tauri-apps/api/path', () => ({ downloadDir: vi.fn().mockResolvedValue('C:\\Users\\tester\\Downloads') }));
vi.mock('@tauri-apps/plugin-fs', () => ({ exists: vi.fn().mockResolvedValue(false) }));
vi.mock('./markdownExportRenderer', () => ({ markdownToExportHtml: vi.fn().mockResolvedValue('<h1>标题</h1>') }));

import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';

describe('createPdfExportFileName', () => {
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

    await expect(exportToPdf({
      content: '# 标题', fileName: 'draft.md', filePath: 'D:\\docs\\draft.md',
      resolvedPreviewFontFamily: 'Arial', resolvedPreviewHeadingFontFamily: 'Arial',
      previewFontSize: 16, previewLineHeight: 1.6,
    })).resolves.toBe('D:\\exports\\draft.pdf');

    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    }));
    expect(invoke).toHaveBeenCalledWith('export_pdf_file', expect.objectContaining({ path: 'D:\\exports\\draft.pdf' }));
  });
});
