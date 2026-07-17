import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDocumentHistoryVersion,
  documentHistoryDirectory,
  listDocumentHistory,
} from './documentHistoryService';

const fsMock = vi.hoisted(() => ({
  mkdir: vi.fn(),
  writeTextFile: vi.fn(),
  readDir: vi.fn(),
  stat: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-fs', () => fsMock);

describe('documentHistoryService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('按会话和文档隔离保存应用前快照', async () => {
    const entry = await createDocumentHistoryVersion({
      outputBaseDir: 'D:\\docs\\.typola-output',
      conversationId: 'conv-1',
      documentPath: 'D:\\docs\\文章.md',
      content: '应用前正文',
      now: new Date('2026-07-16T01:02:03.123Z'),
    });
    const directory = documentHistoryDirectory('D:\\docs\\.typola-output', 'conv-1', 'D:\\docs\\文章.md');
    expect(fsMock.mkdir).toHaveBeenCalledWith(directory, { recursive: true });
    expect(fsMock.writeTextFile).toHaveBeenCalledWith(entry.path, '应用前正文');
    expect(entry.name).toContain('文章.历史版本.20260716T010203123Z.md');
  });

  it('同一秒内的应用使用毫秒区分历史版本', async () => {
    const common = {
      outputBaseDir: 'D:\\docs\\.typola-output',
      conversationId: 'conv-1',
      documentPath: 'D:\\docs\\文章.md',
      content: '正文',
    };
    const first = await createDocumentHistoryVersion({ ...common, now: new Date('2026-07-16T01:02:03.123Z') });
    const second = await createDocumentHistoryVersion({ ...common, now: new Date('2026-07-16T01:02:03.456Z') });
    expect(first.path).not.toBe(second.path);
  });

  it('列出当前文档历史版本并按时间倒序', async () => {
    fsMock.readDir.mockResolvedValue([
      { name: '文章.历史版本.旧.md', isFile: true },
      { name: '文章.历史版本.新.md', isFile: true },
      { name: 'ignore.json', isFile: true },
    ]);
    fsMock.stat
      .mockResolvedValueOnce({ mtime: new Date(100) })
      .mockResolvedValueOnce({ mtime: new Date(200) });
    const result = await listDocumentHistory({
      outputBaseDir: 'D:\\docs\\.typola-output',
      conversationId: 'conv-1',
      documentPath: 'D:\\docs\\文章.md',
    });
    expect(result.map((entry) => entry.name)).toEqual([
      '文章.历史版本.新.md',
      '文章.历史版本.旧.md',
    ]);
  });
});
