// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFileTabs } from './useFileTabs';
import type { OpenedFile } from '../types/document';

const fileServiceMock = vi.hoisted(() => ({
  openPath: vi.fn(),
  saveFile: vi.fn(),
  saveFileAs: vi.fn(),
  getDocumentFingerprint: vi.fn(),
}));
const tauriCoreMock = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('../services/fileService', () => fileServiceMock);
vi.mock('@tauri-apps/api/core', () => tauriCoreMock);
vi.mock('../services/documentWatchService', () => ({
  watchOpenedDocument: vi.fn(async () => undefined),
  unwatchOpenedDocument: vi.fn(async () => undefined),
  onFileChanged: vi.fn(async () => () => undefined),
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ onCloseRequested: vi.fn(async () => () => undefined) }),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type HookValue = ReturnType<typeof useFileTabs>;

function opened(path: string, content: string, fingerprint = { size: content.length, modifiedAt: 1, hash: content }) : OpenedFile {
  return {
    path,
    name: path.split('/').pop() ?? path,
    content,
    dirty: false,
    lastSavedContent: content,
    fileType: 'markdown',
    encoding: 'UTF-8',
    hasBom: false,
    lineEnding: 'LF',
    fingerprint,
  };
}

let disk = new Map<string, OpenedFile>();
let fingerprints = new Map<string, OpenedFile['fingerprint']>();

function Harness({
  onValue,
  isTauriRuntime = false,
  autoSaveEnabled = false,
}: {
  onValue: (value: HookValue) => void;
  isTauriRuntime?: boolean;
  autoSaveEnabled?: boolean;
}) {
  const value = useFileTabs({
    defaultEncoding: 'UTF-8',
    autoSaveEnabled,
    isTauriRuntime,
    setToc: vi.fn(),
    setAutoSaveError: vi.fn(),
    setDiskChangeMessage: vi.fn(),
    setTransientMessage: vi.fn(),
    setFindVisible: vi.fn(),
    setHtmlPresentationVisible: vi.fn(),
    setRightPanelMode: vi.fn(),
    setEditorMode: vi.fn(),
    onWorkspaceRootChange: vi.fn(),
    extractToc: () => [],
  });
  onValue(value);
  return null;
}

describe('useFileTabs 保存可靠性', () => {
  let host: HTMLDivElement;
  let root: Root;
  let value!: HookValue;

  beforeEach(() => {
    disk = new Map([
      ['/docs/a.md', opened('/docs/a.md', 'A')],
      ['/docs/b.md', opened('/docs/b.md', 'B')],
    ]);
    fingerprints = new Map([...disk].map(([path, file]) => [path, file.fingerprint]));
    fileServiceMock.openPath.mockImplementation(async (path: string) => ({ ...disk.get(path)! }));
    fileServiceMock.getDocumentFingerprint.mockImplementation(async (path: string) => fingerprints.get(path));
    fileServiceMock.saveFile.mockImplementation(async (file: OpenedFile) => ({
      ...file,
      dirty: false,
      lastSavedContent: file.content,
      fingerprint: { size: file.content.length, modifiedAt: 2, hash: file.content },
    }));
    tauriCoreMock.invoke.mockReset();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('保存 A 后切换 B，A 的延迟结果不污染当前标签', async () => {
    await act(async () => root.render(<Harness onValue={(next) => { value = next; }} />));
    await act(async () => value.handleOpenPath('/docs/a.md'));
    let resolveSave!: (file: OpenedFile) => void;
    fileServiceMock.saveFile.mockImplementationOnce(() => new Promise<OpenedFile>((resolve) => {
      resolveSave = resolve;
    }));

    let saving!: Promise<void>;
    await act(async () => {
      value.handleContentChange('A changed');
      saving = value.handleSave();
      await Promise.resolve();
    });
    await act(async () => value.handleOpenPath('/docs/b.md'));
    const snapshot = fileServiceMock.saveFile.mock.calls[0]?.[0] as OpenedFile;
    await act(async () => {
      resolveSave({ ...snapshot, dirty: false, lastSavedContent: snapshot.content });
      await saving;
    });

    expect(value.file.path).toBe('/docs/b.md');
    expect(value.file.content).toBe('B');
    expect(value.openTabs.find((tab) => tab.file.path === '/docs/a.md')?.file.dirty).toBe(false);
  });

  it('自动保存期间切换 B，A 的延迟结果不污染当前标签', async () => {
    vi.useFakeTimers();
    await act(async () => root.render(<Harness autoSaveEnabled onValue={(next) => { value = next; }} />));
    await act(async () => value.handleOpenPath('/docs/a.md'));
    let resolveSave!: () => void;
    fileServiceMock.saveFile.mockImplementationOnce((file: OpenedFile) => new Promise<OpenedFile>((resolve) => {
      resolveSave = () => resolve({ ...file, dirty: false, lastSavedContent: file.content });
    }));

    await act(async () => value.handleContentChange('A auto-saved'));
    await act(async () => {
      vi.advanceTimersByTime(800);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fileServiceMock.saveFile).toHaveBeenCalledTimes(1);

    await act(async () => value.handleOpenPath('/docs/b.md'));
    await act(async () => {
      resolveSave();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(value.file.path).toBe('/docs/b.md');
    expect(value.file.content).toBe('B');
    expect(value.openTabs.find((tab) => tab.file.path === '/docs/a.md')?.file.dirty).toBe(false);
  });

  it('保存期间继续编辑，旧快照完成后仍保留最新内容并保持 dirty', async () => {
    await act(async () => root.render(<Harness onValue={(next) => { value = next; }} />));
    await act(async () => value.handleOpenPath('/docs/a.md'));
    let resolveSave!: (file: OpenedFile) => void;
    fileServiceMock.saveFile.mockImplementationOnce((file: OpenedFile) => new Promise<OpenedFile>((resolve) => {
      resolveSave = () => resolve({ ...file, dirty: false, lastSavedContent: file.content });
    }));

    let saving!: Promise<void>;
    await act(async () => {
      value.handleContentChange('old snapshot');
      saving = value.handleSave();
      await Promise.resolve();
      value.handleContentChange('latest edit');
    });
    await act(async () => {
      resolveSave(value.file);
      await saving;
    });

    expect(value.file.content).toBe('latest edit');
    expect(value.file.lastSavedContent).toBe('old snapshot');
    expect(value.file.dirty).toBe(true);
  });

  it('同一路径的第二次保存等待第一次完成，避免乱序覆盖', async () => {
    await act(async () => root.render(<Harness onValue={(next) => { value = next; }} />));
    await act(async () => value.handleOpenPath('/docs/a.md'));
    const resolvers: Array<() => void> = [];
    fileServiceMock.saveFile.mockImplementation((file: OpenedFile) => new Promise<OpenedFile>((resolve) => {
      resolvers.push(() => resolve({ ...file, dirty: false, lastSavedContent: file.content }));
    }));

    let first!: Promise<void>;
    let second!: Promise<void>;
    await act(async () => {
      value.handleContentChange('first');
      first = value.handleSave();
      await Promise.resolve();
      value.handleContentChange('second');
      second = value.handleSave();
      await Promise.resolve();
    });
    expect(fileServiceMock.saveFile).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolvers[0]!();
      await first;
      await Promise.resolve();
    });
    expect(fileServiceMock.saveFile).toHaveBeenCalledTimes(2);
    await act(async () => {
      resolvers[1]!();
      await second;
    });
    expect(fileServiceMock.saveFile.mock.calls.map(([file]) => (file as OpenedFile).content)).toEqual(['first', 'second']);
  });

  it('后台干净标签重新激活前检查 fingerprint 并重载磁盘版本', async () => {
    await act(async () => root.render(<Harness isTauriRuntime onValue={(next) => { value = next; }} />));
    await act(async () => value.handleOpenPath('/docs/a.md'));
    await act(async () => value.handleOpenPath('/docs/b.md'));
    disk.set('/docs/a.md', opened('/docs/a.md', 'A from disk', { size: 11, modifiedAt: 3, hash: 'changed' }));
    fingerprints.set('/docs/a.md', disk.get('/docs/a.md')!.fingerprint);
    const aId = value.openTabs.find((tab) => tab.file.path === '/docs/a.md')!.id;

    await act(async () => {
      value.handleSwitchTab(aId);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(value.file.content).toBe('A from disk');
    expect(value.file.dirty).toBe(false);
  });

  it('重命名跨 Markdown/HTML 扩展名时同步更新 fileType', async () => {
    await act(async () => root.render(<Harness isTauriRuntime onValue={(next) => { value = next; }} />));
    await act(async () => value.handleOpenPath('/docs/a.md'));
    await act(async () => {
      value.setRenameDialog({ tabId: value.activeTabId, name: 'a.html' });
    });
    tauriCoreMock.invoke.mockResolvedValueOnce({ path: '/docs/a.html', name: 'a.html' });

    await act(async () => value.handleConfirmRename());

    expect(value.file.path).toBe('/docs/a.html');
    expect(value.file.fileType).toBe('html');
    expect(value.openTabs[0]?.file.fileType).toBe('html');
  });
});
