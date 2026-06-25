import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createExportFileName, dirname, joinPath, resolveDefaultExportPath } from './exportPathService';
import { exists } from '@tauri-apps/plugin-fs';

vi.mock('@tauri-apps/api/path', () => ({
  downloadDir: vi.fn().mockResolvedValue('C:\\Users\\tester\\Downloads'),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: vi.fn().mockResolvedValue(false),
}));

describe('exportPathService', () => {
  beforeEach(() => {
    vi.mocked(exists).mockResolvedValue(false);
  });

  it('creates export file names by replacing document extensions', () => {
    expect(createExportFileName('draft.md', 'pdf')).toBe('draft.pdf');
    expect(createExportFileName('draft.html', '.docx')).toBe('draft.docx');
    expect(createExportFileName('draft', 'pdf')).toBe('draft.pdf');
  });

  it('derives the parent directory and joins using the same separator', () => {
    expect(dirname('C:\\docs\\draft.md')).toBe('C:\\docs');
    expect(joinPath('C:\\docs\\', 'draft.pdf')).toBe('C:\\docs\\draft.pdf');
    expect(joinPath('/Users/me/docs/', 'draft.pdf')).toBe('/Users/me/docs/draft.pdf');
  });

  it('always exports to Downloads (capability scope safety)', async () => {
    // 出于 capability scope 安全考虑,不再用 md 父目录;统一写到 Downloads。
    await expect(resolveDefaultExportPath({
      fileName: 'draft.md',
      filePath: 'C:\\docs\\draft.md',
      extension: 'pdf',
    })).resolves.toBe('C:\\Users\\tester\\Downloads\\draft.pdf');
  });

  it('exports unsaved files to Downloads', async () => {
    await expect(resolveDefaultExportPath({
      fileName: 'untitled.md',
      extension: 'pdf',
    })).resolves.toBe('C:\\Users\\tester\\Downloads\\untitled.pdf');
  });

  it('deduplicates existing export paths', async () => {
    vi.mocked(exists)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await expect(resolveDefaultExportPath({
      fileName: 'draft.md',
      filePath: 'C:\\docs\\draft.md',
      extension: 'pdf',
    })).resolves.toBe('C:\\Users\\tester\\Downloads\\draft-1.pdf');
  });
});
