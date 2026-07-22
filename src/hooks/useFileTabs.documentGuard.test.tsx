// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFileTabs } from './useFileTabs';

vi.mock('../services/fileService', () => ({
  openPath: vi.fn(async (path: string) => ({
    path,
    name: path.split('/').pop() ?? path,
    content: `content:${path}`,
    dirty: false,
    lastSavedContent: `content:${path}`,
    fileType: 'markdown' as const,
  })),
}));

const pickWorkspaceDirectory = vi.hoisted(() => vi.fn(async () => 'D:/docs'));
vi.mock('../services/workspaceService', () => ({ pickWorkspaceDirectory }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type HookValue = ReturnType<typeof useFileTabs>;
let guardRef: React.MutableRefObject<() => Promise<boolean>>;

function Harness({ onValue }: { onValue: (value: HookValue) => void }) {
  const value = useFileTabs({
    defaultEncoding: 'utf-8',
    autoSaveEnabled: false,
    isTauriRuntime: false,
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
    beforeDocumentChangeRef: guardRef,
  });
  onValue(value);
  return null;
}

describe('useFileTabs 文档切换守卫', () => {
  let host: HTMLDivElement;
  let root: Root;
  let value: HookValue;

  beforeEach(async () => {
    guardRef = { current: async () => true };
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root.render(<Harness onValue={(next) => { value = next; }} />));
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.clearAllMocks();
  });

  it('守卫拒绝时保留当前文档', async () => {
    await act(async () => value.handleOpenPath('D:/docs/a.md'));
    expect(value.file.path).toBe('D:/docs/a.md');

    guardRef.current = async () => false;
    await act(async () => value.handleOpenPath('D:/docs/b.md'));
    expect(value.file.path).toBe('D:/docs/a.md');
  });

  it('打开文件夹时只选择工作区，不批量打开标签', async () => {
    await act(async () => value.handleOpenPath('D:/docs/a.md'));
    await act(async () => value.handleOpenFolder());

    expect(pickWorkspaceDirectory).toHaveBeenCalledTimes(1);
    expect(value.file.path).toBe('D:/docs/a.md');
  });

  it('关闭标签时使用守卫应用候选稿后的最新文档状态', async () => {
    await act(async () => value.handleOpenPath('D:/docs/a.md'));
    guardRef.current = async () => {
      value.handleContentChange('候选正文');
      return true;
    };

    await act(async () => {
      value.handleCloseTab(value.activeTabId);
      await Promise.resolve();
    });

    expect(value.unsavedDialog?.message).toContain('有未保存的修改');
    expect(value.file.path).toBe('D:/docs/a.md');
  });

  it('守卫应用候选稿后立即切换标签，返回时保留候选内容', async () => {
    await act(async () => value.handleOpenPath('D:/docs/a.md'));
    await act(async () => value.handleOpenPath('D:/docs/b.md'));
    guardRef.current = async () => {
      value.handleContentChange('候选正文');
      return true;
    };

    await act(async () => {
      value.handleSwitchTab(value.openTabs.find((tab) => tab.file.path === 'D:/docs/a.md')!.id);
      await Promise.resolve();
    });
    await act(async () => {
      value.handleSwitchTab(value.openTabs.find((tab) => tab.file.path === 'D:/docs/b.md')!.id);
      await Promise.resolve();
    });

    expect(value.file.content).toBe('候选正文');
    expect(value.file.dirty).toBe(true);
  });
});
