// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileTreePanel } from './FileTreePanel';

const pickWorkspaceDirectoryMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('../services/workspaceService', () => ({
  listWorkspaceEntries: vi.fn(async () => [
    { name: 'report.html', path: 'C:/work/report.html', isDir: false },
    { name: 'assets', path: 'C:/work/assets', isDir: true },
  ]),
  pickWorkspaceDirectory: pickWorkspaceDirectoryMock,
  workspaceNameFromPath: vi.fn((path: string) => path.split(/[\\/]/).pop() ?? path),
}));

vi.mock('../hooks/useSettings', () => ({
  useSettings: () => ({ locale: 'zh-CN' }),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function flushPromises(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

describe('FileTreePanel context menu', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.clearAllMocks();
  });

  it('offers useful file actions from the right-click menu', async () => {
    const onOpenFile = vi.fn();
    const onOpenExternal = vi.fn();
    const onRevealInFolder = vi.fn();

    await act(async () => {
      root.render(
        <FileTreePanel
          rootPath="C:/work"
          activePath=""
          dirtyPaths={new Set()}
          width={280}
          onRootChange={vi.fn()}
          onOpenFile={onOpenFile}
          onOpenExternal={onOpenExternal}
          onRevealInFolder={onRevealInFolder}
        />,
      );
      await flushPromises();
      await flushPromises();
    });

    const reportButton = Array.from(host.querySelectorAll<HTMLButtonElement>('.file-tree-item'))
      .find((button) => button.textContent?.includes('report.html'));
    expect(reportButton).toBeDefined();

    await act(async () => {
      reportButton!.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 24,
        clientY: 32,
      }));
    });

    expect(host.textContent).toContain('在 Typola 打开');
    expect(host.textContent).toContain('用系统默认应用打开');
    expect(host.textContent).toContain('打开所在文件夹');
    expect(host.textContent).toContain('复制路径');

    const revealButton = Array.from(host.querySelectorAll<HTMLButtonElement>('.file-tree-context-menu button'))
      .find((button) => button.textContent?.includes('打开所在文件夹'));
    act(() => {
      revealButton!.click();
    });
    expect(onRevealInFolder).toHaveBeenCalledWith('C:/work/report.html');

    await act(async () => {
      reportButton!.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 24,
        clientY: 32,
      }));
    });

    const externalButton = Array.from(host.querySelectorAll<HTMLButtonElement>('.file-tree-context-menu button'))
      .find((button) => button.textContent?.includes('用系统默认应用打开'));
    act(() => {
      externalButton!.click();
    });
    expect(onOpenExternal).toHaveBeenCalledWith('C:/work/report.html');
    expect(onOpenFile).not.toHaveBeenCalled();
  });

  it('shows a readable error when choosing a workspace fails', async () => {
    pickWorkspaceDirectoryMock.mockRejectedValueOnce(new Error('目录不可读'));
    await act(async () => {
      root.render(
        <FileTreePanel
          rootPath=""
          activePath=""
          dirtyPaths={new Set()}
          width={280}
          onRootChange={vi.fn()}
          onOpenFile={vi.fn()}
        />,
      );
      await flushPromises();
      await flushPromises();
    });

    await act(async () => {
      host.querySelector<HTMLButtonElement>('.workspace-empty')?.click();
      await flushPromises();
      await flushPromises();
    });

    expect(host.textContent).toContain('目录不可读');
  });
});
