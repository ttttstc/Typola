import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/plugin-dialog', () => ({ save: vi.fn() }));
vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: vi.fn().mockResolvedValue(false),
  writeFile: vi.fn(),
}));
vi.mock('@tauri-apps/api/path', () => ({ downloadDir: vi.fn().mockResolvedValue('C:\\Users\\tester\\Downloads') }));
vi.mock('./word', () => ({
  DEFAULT_PRESET_ID: 'default',
  getPreset: vi.fn(() => ({ name: '默认' })),
  markdownToDocx: vi.fn(async (
    _content: string,
    _preset: unknown,
    options: { onProgress?: (progress: number, detail: string) => void },
  ) => {
    options.onProgress?.(76, '打包 Word 文档');
    return new Blob(['docx']);
  }),
}));

import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { markdownToDocx } from './word';
import { exportToWord } from './wordExportService';

describe('exportToWord', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the built-in docx generator and reports export stages', async () => {
    vi.mocked(save).mockResolvedValueOnce('D:\\exports\\draft.docx');
    const stages: Array<[number, string]> = [];

    await expect(exportToWord(
      '# 标题',
      'draft.md',
      'D:\\docs\\draft.md',
      'default' as never,
      (progress, detail) => stages.push([progress, detail]),
    )).resolves.toBe('D:\\exports\\draft.docx');

    expect(markdownToDocx).toHaveBeenCalledTimes(1);
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(stages).toEqual(expect.arrayContaining([
      [5, '选择保存位置'],
      [15, '准备 Word 排版'],
      [76, '打包 Word 文档'],
      [92, '写入 Word 文件'],
      [100, 'Word 文件已写入'],
    ]));
  });

  it('does not generate a document after the save dialog is cancelled', async () => {
    vi.mocked(save).mockResolvedValueOnce(null);

    await expect(exportToWord('# 标题', 'draft.md', undefined)).resolves.toBeNull();

    expect(markdownToDocx).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });
});
