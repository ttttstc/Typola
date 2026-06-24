import { describe, expect, it, vi } from 'vitest';
import { createPdfExportFileName } from './pdfExport';

vi.mock('@tauri-apps/plugin-dialog', () => ({ save: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

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
});
