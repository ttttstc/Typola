// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppLayout } from './AppLayout';
import type { UpdateCheckResult } from '../services/updateService';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const updateServiceMock = vi.hoisted(() => ({
  checkForAppUpdate: vi.fn<() => Promise<UpdateCheckResult>>(),
  downloadAppUpdate: vi.fn<() => Promise<void>>(),
  installDownloadedAppUpdate: vi.fn<() => Promise<void>>(),
  getDistributionKind: vi.fn().mockResolvedValue('installed'),
  openReleaseForVersion: vi.fn<() => Promise<void>>(),
}));

const tauriWindowMock = vi.hoisted(() => ({
  onDragDropEvent: vi.fn().mockResolvedValue(vi.fn()),
  onCloseRequested: vi.fn().mockResolvedValue(vi.fn()),
  setTitle: vi.fn().mockResolvedValue(undefined),
  destroy: vi.fn().mockResolvedValue(undefined),
}));

const tauriCoreMock = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

const tauriEventMock = vi.hoisted(() => ({
  listen: vi.fn(),
}));

const fileServiceMock = vi.hoisted(() => ({
  openFile: vi.fn(),
  openPath: vi.fn(),
  saveFile: vi.fn(),
  saveFileAs: vi.fn(),
}));

const dialogServiceMock = vi.hoisted(() => ({
  confirmDialog: vi.fn(),
  messageDialog: vi.fn().mockResolvedValue(undefined),
}));

const editorPaneMock = vi.hoisted(() => ({
  source: '',
  renderCount: 0,
  modes: [] as string[],
  onChange: undefined as ((value: string) => void) | undefined,
  emitOnSourceChange: false,
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => tauriWindowMock,
}));

vi.mock('@tauri-apps/api/core', () => tauriCoreMock);

vi.mock('@tauri-apps/api/event', () => tauriEventMock);

vi.mock('../services/fileService', () => fileServiceMock);

vi.mock('../services/dialogService', () => dialogServiceMock);

vi.mock('../services/updateService', () => ({
  checkForAppUpdate: updateServiceMock.checkForAppUpdate,
  downloadAppUpdate: updateServiceMock.downloadAppUpdate,
  installDownloadedAppUpdate: updateServiceMock.installDownloadedAppUpdate,
  getDistributionKind: updateServiceMock.getDistributionKind,
  openReleaseForVersion: updateServiceMock.openReleaseForVersion,
}));

vi.mock('../components/EditorPane', () => ({
  EditorPane: ({ source }: { source: string }) => {
    editorPaneMock.source = source;
    editorPaneMock.renderCount += 1;
    return null;
  },
}));

vi.mock('../components/editor/cm6/Cm6MarkdownEditorPane', () => ({
  Cm6MarkdownEditorPane: ({ source, mode, onChange }: { source: string; mode?: string; onChange?: (value: string) => void }) => {
    editorPaneMock.source = source;
    editorPaneMock.renderCount += 1;
    editorPaneMock.modes.push(mode ?? 'wysiwyg');
    editorPaneMock.onChange = onChange;
    React.useEffect(() => {
      if (editorPaneMock.emitOnSourceChange) onChange?.(source);
    }, [onChange, source]);
    return null;
  },
}));

vi.mock('../components/SettingsPage', () => ({
  SettingsPage: () => (
    <div className="settings-overlay" data-testid="settings-page-stub">
      <div className="settings-modal">
        <div className="settings-modal-content">settings-page-content</div>
      </div>
    </div>
  ),
}));

vi.mock('../components/settings/preloadSections', () => ({
  preloadGeneralSection: () => Promise.resolve(),
  preloadEditorSection: () => Promise.resolve(),
  preloadPreviewSection: () => Promise.resolve(),
  preloadAppearanceSection: () => Promise.resolve(),
  preloadExportSection: () => Promise.resolve(),
  preloadHtmlExportSection: () => Promise.resolve(),
  preloadLicenseSection: () => Promise.resolve(),
  preloadAboutSection: () => Promise.resolve(),
}));

function flushPromises(): Promise<void> {
  return Promise.resolve();
}

describe('AppLayout update flow', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    tauriWindowMock.onDragDropEvent.mockResolvedValue(vi.fn());
    tauriWindowMock.onCloseRequested.mockResolvedValue(vi.fn());
    tauriWindowMock.setTitle.mockResolvedValue(undefined);
    tauriWindowMock.destroy.mockResolvedValue(undefined);
    tauriCoreMock.invoke.mockResolvedValue([]);
    tauriEventMock.listen.mockResolvedValue(vi.fn());
    fileServiceMock.openFile.mockResolvedValue(null);
    fileServiceMock.openPath.mockImplementation(async (path: string) => ({
      path,
      name: path.split('/').pop() ?? '未命名',
      content: '# 系统打开文件',
      dirty: false,
      lastSavedContent: '# 系统打开文件',
      fileType: 'markdown',
    }));
    editorPaneMock.source = '';
    editorPaneMock.renderCount = 0;
    editorPaneMock.modes = [];
    editorPaneMock.onChange = undefined;
    editorPaneMock.emitOnSourceChange = false;
    updateServiceMock.getDistributionKind.mockResolvedValue('installed');
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    delete (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('publishes the configured global UI font size', async () => {
    await act(async () => {
      root.render(<AppLayout />);
      await flushPromises();
    });

    expect(document.documentElement.style.getPropertyValue('--app-ui-font-size')).toBe('14px');
  });

  it('prompts first, then downloads and installs after one click', async () => {
    const availableUpdate = {
      status: 'available',
      version: '0.3.11',
      body: '',
      update: {},
    } as Extract<UpdateCheckResult, { status: 'available' }>;
    updateServiceMock.checkForAppUpdate.mockResolvedValue(availableUpdate);
    updateServiceMock.downloadAppUpdate.mockResolvedValue(undefined);
    updateServiceMock.installDownloadedAppUpdate.mockResolvedValue(undefined);

    await act(async () => {
      root.render(<AppLayout />);
      await flushPromises();
    });

    await act(async () => {
      vi.advanceTimersByTime(2600);
      await flushPromises();
    });

    expect(updateServiceMock.checkForAppUpdate).toHaveBeenCalledTimes(1);
    expect(updateServiceMock.downloadAppUpdate).not.toHaveBeenCalled();
    expect(host.textContent).toContain('发现新版本');
    expect(host.textContent).toContain('v0.3.11');

    await act(async () => {
      const action = host.querySelector<HTMLButtonElement>('.update-card button');
      action?.click();
      action?.click();
      await flushPromises();
      await flushPromises();
    });

    expect(updateServiceMock.downloadAppUpdate).toHaveBeenCalledTimes(1);
    expect(updateServiceMock.installDownloadedAppUpdate).toHaveBeenCalledTimes(1);
  });

  it('dismisses the update card when the user ignores an available version', async () => {
    updateServiceMock.checkForAppUpdate.mockResolvedValue({
      status: 'available',
      version: '2.0.6',
      update: {},
    } as Extract<UpdateCheckResult, { status: 'available' }>);

    await act(async () => {
      root.render(<AppLayout />);
      await flushPromises();
    });
    await act(async () => {
      vi.advanceTimersByTime(2600);
      await flushPromises();
    });

    const ignoreButton = Array.from(host.querySelectorAll<HTMLButtonElement>('.update-card button'))
      .find((button) => button.textContent?.includes('忽略此版本'));
    expect(ignoreButton).toBeDefined();

    await act(async () => {
      ignoreButton?.click();
      await flushPromises();
    });

    expect(host.querySelector('.update-card')).toBeNull();
  });

  it('opens the release page instead of installing in portable mode', async () => {
    updateServiceMock.getDistributionKind.mockResolvedValue('portable');
    updateServiceMock.checkForAppUpdate.mockResolvedValue({
      status: 'available',
      version: '2.0.6',
      update: {},
    } as Extract<UpdateCheckResult, { status: 'available' }>);
    updateServiceMock.openReleaseForVersion.mockResolvedValue(undefined);

    await act(async () => {
      root.render(<AppLayout />);
      await flushPromises();
    });
    await act(async () => {
      vi.advanceTimersByTime(2600);
      await flushPromises();
    });

    expect(host.textContent).toContain('发现新版本');
    await act(async () => {
      host.querySelector<HTMLButtonElement>('.update-card button')?.click();
      await flushPromises();
    });

    expect(updateServiceMock.openReleaseForVersion).toHaveBeenCalledWith('2.0.6');
    expect(updateServiceMock.downloadAppUpdate).not.toHaveBeenCalled();
    expect(updateServiceMock.installDownloadedAppUpdate).not.toHaveBeenCalled();
  });

  it('stops before install when the document changes during download', async () => {
    let finishDownload: () => void = () => {};
    updateServiceMock.checkForAppUpdate.mockResolvedValue({
      status: 'available',
      version: '2.0.6',
      update: {},
    } as Extract<UpdateCheckResult, { status: 'available' }>);
    updateServiceMock.downloadAppUpdate.mockImplementation(() => new Promise((resolve) => {
      finishDownload = resolve;
    }));

    await act(async () => {
      root.render(<AppLayout />);
      await flushPromises();
    });
    await act(async () => {
      vi.advanceTimersByTime(2600);
      await flushPromises();
    });
    await act(async () => {
      host.querySelector<HTMLButtonElement>('.update-card button')?.click();
      await flushPromises();
    });
    await act(async () => {
      editorPaneMock.onChange?.('# 下载期间的新修改');
      finishDownload();
      await flushPromises();
    });

    expect(updateServiceMock.installDownloadedAppUpdate).not.toHaveBeenCalled();
    expect(host.textContent).toContain('有未保存的修改');
  });

  it('opens a file path delivered by the desktop system open event', async () => {
    tauriCoreMock.invoke.mockResolvedValue(['/tmp/系统打开.md']);

    await act(async () => {
      root.render(<AppLayout />);
      await flushPromises();
      await flushPromises();
    });

    expect(tauriEventMock.listen).toHaveBeenCalledWith('opened-paths', expect.any(Function));
    expect(fileServiceMock.openPath).toHaveBeenCalledWith('/tmp/系统打开.md', 'UTF-8');
  });

  it('shows the name and content of each newly opened Markdown file', async () => {
    editorPaneMock.emitOnSourceChange = true;
    fileServiceMock.openFile
      .mockResolvedValueOnce({
        path: 'D:\\docs\\第一篇.md',
        name: '第一篇.md',
        content: '# 第一篇正文',
        dirty: false,
        lastSavedContent: '# 第一篇正文',
        fileType: 'markdown',
      })
      .mockResolvedValueOnce({
        path: 'D:\\docs\\第二篇.md',
        name: '第二篇.md',
        content: '# 第二篇正文',
        dirty: false,
        lastSavedContent: '# 第二篇正文',
        fileType: 'markdown',
      });

    await act(async () => {
      root.render(<AppLayout />);
      await flushPromises();
    });

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', ctrlKey: true }));
      await flushPromises();
      await flushPromises();
    });

    expect(tauriWindowMock.setTitle).toHaveBeenLastCalledWith('第一篇.md');
    expect(editorPaneMock.source).toBe('# 第一篇正文');
    expect(host.querySelector('.status-save-state')).toBeNull();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', ctrlKey: true }));
      await flushPromises();
      await flushPromises();
    });

    expect(tauriWindowMock.setTitle).toHaveBeenLastCalledWith('第二篇.md');
    expect(editorPaneMock.source).toBe('# 第二篇正文');
    expect(fileServiceMock.openFile).toHaveBeenCalledTimes(2);
    expect(host.querySelector('.status-save-state')).toBeNull();
    expect(host.querySelector('[aria-label="关闭 第一篇.md"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="关闭 第二篇.md"]')).not.toBeNull();

    await act(async () => {
      Array.from(host.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
        .find((tab) => tab.textContent === '第一篇.md')
        ?.click();
      await flushPromises();
      await flushPromises();
    });

    expect(tauriWindowMock.setTitle).toHaveBeenLastCalledWith('第一篇.md');
    expect(editorPaneMock.source).toBe('# 第一篇正文');

    await act(async () => {
      host.querySelector<HTMLButtonElement>('[aria-label="关闭 第一篇.md"]')?.click();
      await flushPromises();
      await flushPromises();
    });

    expect(tauriWindowMock.setTitle).toHaveBeenLastCalledWith('第二篇.md');
    expect(editorPaneMock.source).toBe('# 第二篇正文');
  });

  it('passes the current HTML source into the source editor from the WYSIWYG pane', async () => {
    const source = '<!doctype html><html><body><h1>材料</h1><table><tr><td>正文</td></tr></table></body></html>';
    fileServiceMock.openFile.mockResolvedValue({
      path: '/tmp/materials.html',
      name: 'materials.html',
      content: source,
      dirty: false,
      lastSavedContent: source,
      fileType: 'html',
    });

    await act(async () => {
      root.render(<AppLayout />);
      await flushPromises();
    });

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', metaKey: true }));
      await flushPromises();
      await flushPromises();
    });

    const sourceButton = host.querySelector<HTMLButtonElement>('button[aria-label="源码模式"]');
    expect(sourceButton).toBeTruthy();

    await act(async () => {
      sourceButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushPromises();
      await flushPromises();
    });

    expect(editorPaneMock.renderCount).toBeGreaterThan(0);
    expect(editorPaneMock.source).toBe(source);
    expect(editorPaneMock.modes).toContain('source');
  });

  it('explicitly destroys the window after an allowed native close request', async () => {
    let closeHandler: ((event: { preventDefault: () => void }) => void) | undefined;
    const preventDefault = vi.fn();
    tauriWindowMock.onCloseRequested.mockImplementation(async (handler) => {
      closeHandler = handler;
      return vi.fn();
    });

    await act(async () => {
      root.render(<AppLayout />);
      await flushPromises();
    });

    expect(closeHandler).toBeTruthy();
    await act(async () => {
      closeHandler?.({ preventDefault });
      await flushPromises();
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(tauriWindowMock.destroy).toHaveBeenCalledTimes(1);
  });

  it('does not prevent a repeated close request while destroy is already in progress', async () => {
    let closeHandler: ((event: { preventDefault: () => void }) => void) | undefined;
    const firstPreventDefault = vi.fn();
    const secondPreventDefault = vi.fn();
    tauriWindowMock.destroy.mockImplementation(() => new Promise(() => {}));
    tauriWindowMock.onCloseRequested.mockImplementation(async (handler) => {
      closeHandler = handler;
      return vi.fn();
    });

    await act(async () => {
      root.render(<AppLayout />);
      await flushPromises();
    });

    await act(async () => {
      closeHandler?.({ preventDefault: firstPreventDefault });
      await flushPromises();
      closeHandler?.({ preventDefault: secondPreventDefault });
      await flushPromises();
    });

    expect(firstPreventDefault).toHaveBeenCalledTimes(1);
    expect(secondPreventDefault).not.toHaveBeenCalled();
    expect(tauriWindowMock.destroy).toHaveBeenCalledTimes(1);
  });

  it('keeps the window open when dirty content exists and the user cancels close', async () => {
    let closeHandler: ((event: { preventDefault: () => void }) => void) | undefined;
    const preventDefault = vi.fn();
    tauriWindowMock.onCloseRequested.mockImplementation(async (handler) => {
      closeHandler = handler;
      return vi.fn();
    });
    fileServiceMock.openFile.mockResolvedValue({
      path: '/tmp/dirty.md',
      name: 'dirty.md',
      content: '# dirty',
      dirty: true,
      lastSavedContent: '# original',
      fileType: 'markdown',
    });

    await act(async () => {
      root.render(<AppLayout />);
      await flushPromises();
    });
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', metaKey: true }));
      await flushPromises();
      await flushPromises();
    });
    await act(async () => {
      closeHandler?.({ preventDefault });
      await flushPromises();
      await flushPromises();
    });
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.click();
      await flushPromises();
      await flushPromises();
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(tauriWindowMock.destroy).not.toHaveBeenCalled();
  });

  it('saves dirty content before closing when the user chooses save', async () => {
    let closeHandler: ((event: { preventDefault: () => void }) => void) | undefined;
    const preventDefault = vi.fn();
    tauriWindowMock.onCloseRequested.mockImplementation(async (handler) => {
      closeHandler = handler;
      return vi.fn();
    });
    fileServiceMock.openFile.mockResolvedValue({
      path: '/tmp/save-before-close.md',
      name: 'save-before-close.md',
      content: '# changed',
      dirty: true,
      lastSavedContent: '# original',
      fileType: 'markdown',
    });
    fileServiceMock.saveFile.mockImplementation(async (file) => ({
      ...file,
      dirty: false,
      lastSavedContent: file.content,
    }));

    await act(async () => {
      root.render(<AppLayout />);
      await flushPromises();
    });
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', metaKey: true }));
      await flushPromises();
      await flushPromises();
    });
    await act(async () => {
      closeHandler?.({ preventDefault });
      await flushPromises();
      await flushPromises();
    });
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-action="save"]')?.click();
      await flushPromises();
      await flushPromises();
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(fileServiceMock.saveFile).toHaveBeenCalledWith(expect.objectContaining({ path: '/tmp/save-before-close.md' }));
    expect(tauriWindowMock.destroy).toHaveBeenCalledTimes(1);
  });

  it('confirms each dirty file separately before closing the window', async () => {
    let closeHandler: ((event: { preventDefault: () => void }) => void) | undefined;
    tauriWindowMock.onCloseRequested.mockImplementation(async (handler) => {
      closeHandler = handler;
      return vi.fn();
    });
    fileServiceMock.openFile
      .mockResolvedValueOnce({
        path: '/tmp/first-dirty.md',
        name: 'first-dirty.md',
        content: '# first',
        dirty: false,
        lastSavedContent: '# first',
        fileType: 'markdown',
      })
      .mockResolvedValueOnce({
        path: '/tmp/second-dirty.md',
        name: 'second-dirty.md',
        content: '# second',
        dirty: false,
        lastSavedContent: '# second',
        fileType: 'markdown',
      });
    fileServiceMock.saveFile.mockImplementation(async (file) => ({
      ...file,
      dirty: false,
      lastSavedContent: file.content,
    }));

    await act(async () => {
      root.render(<AppLayout />);
      await flushPromises();
    });
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', ctrlKey: true }));
      await flushPromises();
      await flushPromises();
    });
    await act(async () => {
      editorPaneMock.onChange?.('# first changed');
      await flushPromises();
    });
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', ctrlKey: true }));
      await flushPromises();
      await flushPromises();
    });
    await act(async () => {
      editorPaneMock.onChange?.('# second changed');
      await flushPromises();
    });
    await act(async () => {
      closeHandler?.({ preventDefault: vi.fn() });
      await flushPromises();
      await flushPromises();
    });

    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('first-dirty.md');
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('1 / 2');

    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-action="save"]')?.click();
      await flushPromises();
      await flushPromises();
    });

    expect(fileServiceMock.saveFile).toHaveBeenCalledWith(expect.objectContaining({ path: '/tmp/first-dirty.md' }));
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('second-dirty.md');
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('2 / 2');

    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-action="discard"]')?.click();
      await flushPromises();
      await flushPromises();
    });

    expect(tauriWindowMock.destroy).toHaveBeenCalledTimes(1);
  });

  it('discards all remaining dirty files in one action', async () => {
    let closeHandler: ((event: { preventDefault: () => void }) => void) | undefined;
    tauriWindowMock.onCloseRequested.mockImplementation(async (handler) => {
      closeHandler = handler;
      return vi.fn();
    });
    fileServiceMock.openFile
      .mockResolvedValueOnce({
        path: '/tmp/discard-first.md', name: 'discard-first.md', content: '# changed',
        dirty: true, lastSavedContent: '# original', fileType: 'markdown',
      })
      .mockResolvedValueOnce({
        path: '/tmp/discard-second.md', name: 'discard-second.md', content: '# changed',
        dirty: true, lastSavedContent: '# original', fileType: 'markdown',
      });

    await act(async () => {
      root.render(<AppLayout />);
      await flushPromises();
    });
    for (let index = 0; index < 2; index += 1) {
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', ctrlKey: true }));
        await flushPromises();
        await flushPromises();
      });
    }
    await act(async () => {
      closeHandler?.({ preventDefault: vi.fn() });
      await flushPromises();
      await flushPromises();
    });

    expect(host.querySelector<HTMLButtonElement>('[data-action="discard-all"]')).not.toBeNull();
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-action="discard-all"]')?.click();
      await flushPromises();
      await flushPromises();
    });

    expect(fileServiceMock.saveFile).not.toHaveBeenCalled();
    expect(tauriWindowMock.destroy).toHaveBeenCalledTimes(1);
  });

  it('does not show saved feedback when save as is cancelled for a clean file', async () => {
    const openedFile = {
      path: '/tmp/clean-save-as.md',
      name: 'clean-save-as.md',
      content: '# clean',
      dirty: false,
      lastSavedContent: '# clean',
      fileType: 'markdown' as const,
    };
    fileServiceMock.openFile.mockResolvedValue(openedFile);
    fileServiceMock.saveFileAs.mockResolvedValue(openedFile);

    await act(async () => {
      root.render(<AppLayout />);
      await flushPromises();
    });
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', metaKey: true }));
      await flushPromises();
      await flushPromises();
    });
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', metaKey: true, shiftKey: true }));
      await flushPromises();
      await flushPromises();
    });

    expect(fileServiceMock.saveFileAs).toHaveBeenCalledWith(openedFile);
    expect(host.textContent).not.toContain('已保存');
    expect(host.querySelector('.status-save-state')).toBeNull();
  });

  it('keeps a dirty tab open when the user cancels tab close', async () => {
    fileServiceMock.openFile
      .mockResolvedValueOnce({
        path: '/tmp/dirty-tab.md',
        name: 'dirty-tab.md',
        content: '# dirty tab',
        dirty: true,
        lastSavedContent: '# original',
        fileType: 'markdown',
      })
      .mockResolvedValueOnce({
        path: '/tmp/clean-tab.md',
        name: 'clean-tab.md',
        content: '# clean tab',
        dirty: false,
        lastSavedContent: '# clean tab',
        fileType: 'markdown',
      });

    await act(async () => {
      root.render(<AppLayout />);
      await flushPromises();
    });
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', metaKey: true }));
      await flushPromises();
      await flushPromises();
    });
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', metaKey: true }));
      await flushPromises();
      await flushPromises();
    });

    await act(async () => {
      host.querySelector<HTMLButtonElement>('[aria-label="关闭 dirty-tab.md"]')?.click();
      await flushPromises();
      await flushPromises();
    });
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.click();
      await flushPromises();
      await flushPromises();
    });

    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(fileServiceMock.saveFile).not.toHaveBeenCalled();
    expect(host.querySelector('[aria-label="关闭 dirty-tab.md"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="关闭 clean-tab.md"]')).not.toBeNull();
  });

  it('saves a dirty tab before closing it when the user chooses save', async () => {
    fileServiceMock.openFile
      .mockResolvedValueOnce({
        path: '/tmp/dirty-tab-save.md',
        name: 'dirty-tab-save.md',
        content: '# changed tab',
        dirty: true,
        lastSavedContent: '# original',
        fileType: 'markdown',
      })
      .mockResolvedValueOnce({
        path: '/tmp/clean-tab-save.md',
        name: 'clean-tab-save.md',
        content: '# clean tab',
        dirty: false,
        lastSavedContent: '# clean tab',
        fileType: 'markdown',
      });
    fileServiceMock.saveFile.mockImplementation(async (file) => ({
      ...file,
      dirty: false,
      lastSavedContent: file.content,
    }));

    await act(async () => {
      root.render(<AppLayout />);
      await flushPromises();
    });
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', metaKey: true }));
      await flushPromises();
      await flushPromises();
    });
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', metaKey: true }));
      await flushPromises();
      await flushPromises();
    });

    await act(async () => {
      host.querySelector<HTMLButtonElement>('[aria-label="关闭 dirty-tab-save.md"]')?.click();
      await flushPromises();
      await flushPromises();
    });
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-action="save"]')?.click();
      await flushPromises();
      await flushPromises();
    });

    expect(fileServiceMock.saveFile).toHaveBeenCalledWith(expect.objectContaining({ path: '/tmp/dirty-tab-save.md' }));
    expect(host.querySelector('[aria-label="关闭 dirty-tab-save.md"]')).toBeNull();
  });
});

describe('AppLayout settings first-open', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    delete (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    vi.clearAllMocks();
  });

  it('preloads the settings chunk immediately on mount, without a 500ms delay', async () => {
    await act(async () => {
      root.render(<AppLayout />);
      await flushPromises();
    });

    /* No timer advancement — the preload must already be in flight. */
    expect(host.querySelector('.settings-overlay')).toBeNull();
  });

  it('renders the real settings page on the first frame after opening, not the skeleton fallback', async () => {
    await act(async () => {
      root.render(<AppLayout />);
      await flushPromises();
    });

    const settingsButton = host.querySelector<HTMLButtonElement>('button[aria-label="设置"]');
    expect(settingsButton).not.toBeNull();

    /* After the preload Promise resolves and the click is flushed, the
       settings overlay must be in the DOM with the real content rather than
       the SettingsPageFallback skeleton. */
    await act(async () => {
      settingsButton!.click();
      /* Multiple microtask flushes to settle: dynamic import → Suspense
         resolve → React commit. */
      for (let i = 0; i < 5; i += 1) {
        await flushPromises();
      }
    });

    const overlay = host.querySelector('.settings-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay!.classList.contains('settings-overlay--loading')).toBe(false);
    expect(host.querySelector('[data-testid="settings-page-stub"]')).not.toBeNull();
    expect(host.textContent).toContain('settings-page-content');
  });
});
