// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openFolder, openPath, saveFile } from './fileService';
import type { OpenedFile } from '../types/document';

const tauriCoreMock = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

const tauriFsMock = vi.hoisted(() => ({
  readTextFile: vi.fn(),
  readFile: vi.fn(),
  writeTextFile: vi.fn(),
}));

const dialogMock = vi.hoisted(() => ({
  open: vi.fn(),
  save: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => tauriCoreMock);

vi.mock('@tauri-apps/plugin-fs', () => tauriFsMock);

vi.mock('@tauri-apps/plugin-dialog', () => dialogMock);

function bytesOf(value: string): number[] {
  return Array.from(new TextEncoder().encode(value));
}

describe('fileService', () => {
  afterEach(() => {
    delete (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    vi.clearAllMocks();
  });

  it('reads desktop-opened Markdown paths through the backend in Tauri runtime', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    tauriCoreMock.invoke.mockResolvedValue(bytesOf('# 双击打开\n正文'));
    tauriFsMock.readTextFile.mockRejectedValue(new Error('frontend fs scope denied'));

    const opened = await openPath('/Users/demo/双击打开.md', 'UTF-8');

    expect(tauriCoreMock.invoke).toHaveBeenCalledWith('read_opened_document', {
      path: '/Users/demo/双击打开.md',
    });
    expect(tauriFsMock.readTextFile).not.toHaveBeenCalled();
    expect(opened).toEqual({
      path: '/Users/demo/双击打开.md',
      name: '双击打开.md',
      content: '# 双击打开\n正文',
      dirty: false,
      lastSavedContent: '# 双击打开\n正文',
      fileType: 'markdown',
    });
  });

  it('openFolder: read_first_level_openable + filter + skip bad files', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    dialogMock.open.mockResolvedValueOnce(['/tmp/sample-dir']);
    tauriCoreMock.invoke.mockImplementation(async (cmd: string, args: { dir?: string; path?: string }) => {
      if (cmd === 'read_first_level_openable') {
        return [`${args.dir}/good.md`, `${args.dir}/nested.txt`, `${args.dir}/doc.html`];
      }
      if (cmd === 'read_opened_document') {
        const p = args.path ?? '';
        if (p.endsWith('good.md')) return bytesOf('# good');
        if (p.endsWith('doc.html')) return bytesOf('<p>doc</p>');
        throw new Error('not supported');
      }
      return undefined;
    });
    const result = await openFolder('UTF-8');
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.path)).toContain('/tmp/sample-dir/good.md');
    expect(result.map((r) => r.path)).toContain('/tmp/sample-dir/doc.html');
  });

  it('openFolder: returns empty when dialog cancelled', async () => {
    dialogMock.open.mockResolvedValueOnce(null);
    expect(await openFolder('UTF-8')).toEqual([]);
  });

  it('keeps browser/test fallback on the filesystem plugin outside Tauri runtime', async () => {
    tauriFsMock.readTextFile.mockResolvedValue('# 手动打开');

    const opened = await openPath('/tmp/manual.md', 'UTF-8');

    expect(tauriCoreMock.invoke).not.toHaveBeenCalled();
    expect(tauriFsMock.readTextFile).toHaveBeenCalledWith('/tmp/manual.md');
    expect(opened.content).toBe('# 手动打开');
  });

  it('saves existing Markdown files through the backend in Tauri runtime', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    tauriCoreMock.invoke.mockResolvedValue(undefined);
    tauriFsMock.writeTextFile.mockRejectedValue(new Error('frontend fs scope denied'));
    const file: OpenedFile = {
      path: '/Users/demo/双击打开.md',
      name: '双击打开.md',
      content: '# 修改后',
      dirty: true,
      lastSavedContent: '# 修改前',
      fileType: 'markdown',
    };

    const saved = await saveFile(file);

    expect(tauriCoreMock.invoke).toHaveBeenCalledWith('write_opened_document', {
      path: '/Users/demo/双击打开.md',
      content: '# 修改后',
    });
    expect(tauriFsMock.writeTextFile).not.toHaveBeenCalled();
    expect(saved.dirty).toBe(false);
    expect(saved.lastSavedContent).toBe('# 修改后');
  });
});
