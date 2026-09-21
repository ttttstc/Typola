// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppLayout } from './AppLayout';
import type { UpdateCheckResult } from '../services/updateService';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tauriWindowMock = vi.hoisted(() => ({
  onDragDropEvent: vi.fn().mockResolvedValue(vi.fn()),
  setTitle: vi.fn().mockResolvedValue(undefined),
}));

const tauriCoreMock = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

const tauriEventMock = vi.hoisted(() => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));

const tauriFsMock = vi.hoisted(() => ({
  readTextFile: vi.fn(),
  readFile: vi.fn(),
  writeTextFile: vi.fn(),
}));

const updateServiceMock = vi.hoisted(() => ({
  checkForAppUpdate: vi.fn<() => Promise<UpdateCheckResult>>(),
  downloadAppUpdate: vi.fn<() => Promise<void>>(),
  installDownloadedAppUpdate: vi.fn<() => Promise<void>>(),
  getDistributionKind: vi.fn().mockResolvedValue('installed'),
  openReleaseForVersion: vi.fn<() => Promise<void>>(),
}));

const cm6EditorMock = vi.hoisted(() => ({ source: '' }));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => tauriWindowMock,
}));

vi.mock('@tauri-apps/api/core', () => tauriCoreMock);

vi.mock('@tauri-apps/api/event', () => tauriEventMock);

vi.mock('@tauri-apps/plugin-fs', () => tauriFsMock);

vi.mock('../services/updateService', () => ({
  checkForAppUpdate: updateServiceMock.checkForAppUpdate,
  downloadAppUpdate: updateServiceMock.downloadAppUpdate,
  installDownloadedAppUpdate: updateServiceMock.installDownloadedAppUpdate,
  getDistributionKind: updateServiceMock.getDistributionKind,
  openReleaseForVersion: updateServiceMock.openReleaseForVersion,
}));

vi.mock('../components/editor/cm6/Cm6MarkdownEditorPane', () => ({
  Cm6MarkdownEditorPane: ({ source }: { source: string }) => {
    cm6EditorMock.source = source;
    return null;
  },
}));

function bytesOf(value: string): number[] {
  return Array.from(new TextEncoder().encode(value));
}

function flushPromises(): Promise<void> {
  return Promise.resolve();
}

function waitForMacrotask(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (predicate()) return;
    await waitForMacrotask();
  }

  throw new Error('Timed out waiting for condition');
}

describe('AppLayout system open source editing', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    tauriEventMock.listen.mockResolvedValue(vi.fn());
    tauriWindowMock.onDragDropEvent.mockResolvedValue(vi.fn());
    tauriWindowMock.setTitle.mockResolvedValue(undefined);
    cm6EditorMock.source = '';
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    delete (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    vi.clearAllMocks();
  });

  it('loads the original HTML source from a desktop-opened path before showing source editor', async () => {
    const source = [
      '<!doctype html>',
      '<html>',
      '<body>',
      '<h1 align="right">材料清单</h1>',
      '<p style="white-space: pre-wrap">第一行',
      '',
      '第二行</p>',
      '</body>',
      '</html>',
    ].join('\n');

    tauriFsMock.readTextFile.mockRejectedValue(new Error('frontend fs scope denied'));
    tauriCoreMock.invoke.mockImplementation(async (command: string) => {
      if (command === 'pending_opened_paths') return ['/tmp/materials.html'];
      if (command === 'read_opened_document') return bytesOf(source);
      return undefined;
    });

    await act(async () => {
      root.render(<AppLayout />);
      await flushPromises();
      await flushPromises();
      await vi.dynamicImportSettled();
    });

    await act(async () => {
      await waitUntil(() => tauriCoreMock.invoke.mock.calls.some(([command]) => (
        command === 'read_opened_document'
      )));
    });

    expect(tauriCoreMock.invoke).toHaveBeenCalledWith('read_opened_document', {
      path: '/tmp/materials.html',
    });
    expect(tauriFsMock.readTextFile).not.toHaveBeenCalled();

    await act(async () => {
      await waitUntil(() => Boolean(host.querySelector<HTMLButtonElement>('button[aria-label="源码模式"]')));
    });

    const sourceButton = host.querySelector<HTMLButtonElement>('button[aria-label="源码模式"]');
    expect(sourceButton).toBeTruthy();

    await act(async () => {
      sourceButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await vi.dynamicImportSettled();
      await flushPromises();
      await flushPromises();
      await waitForMacrotask();
    });

    expect(cm6EditorMock.source).toContain('<!doctype html>');
    expect(cm6EditorMock.source).toContain('<h1 align="right">材料清单</h1>');
    expect(cm6EditorMock.source).toContain('white-space: pre-wrap');
  });

  // PR #284 review 回归:① 目录分流用后端真实元数据,名为 notes.md 的目录不得按
  // 扩展名误判为文档;② 打开工作区带出左栏后,用户手动收起必须保持收起。
  it('opens a .md-named directory argument as workspace and keeps the collapsed rail collapsed', async () => {
    tauriFsMock.readTextFile.mockRejectedValue(new Error('frontend fs scope denied'));
    tauriCoreMock.invoke.mockImplementation(async (command: string) => {
      if (command === 'pending_opened_paths') return ['/tmp/notes.md'];
      if (command === 'path_is_directory') return true;
      if (command === 'list_directory_entries') return [
        { name: 'a.md', path: '/tmp/notes.md/a.md', isDir: false, isSupported: true },
      ];
      return undefined;
    });

    await act(async () => {
      root.render(<AppLayout />);
      await flushPromises();
      await flushPromises();
      await vi.dynamicImportSettled();
    });

    // .md 结尾的目录按真实元数据识别为目录,以工作区方式打开
    await act(async () => {
      await waitUntil(() => Boolean(host.querySelector('aside.workspace-sidebar')));
    });
    expect(host.querySelector('.workspace-root-path')?.textContent ?? '').toContain('/tmp/notes.md');
    expect(tauriCoreMock.invoke.mock.calls.some(([command, payload]) => (
      command === 'read_opened_document'
        && (payload as { path: string } | undefined)?.path === '/tmp/notes.md'
    ))).toBe(false);

    // 打开后左栏自动带出(main-content 带 left-panel-open 状态类),手动收起后必须保持收起。
    // PR #284 review:断言基于持久的 .main-content 元素状态类,不依赖 AnimatePresence
    // exit 节点在 jsdom 中的卸载时机(固定次数 setTimeout(0) 不等价于退出动画完成)。
    const mainContent = () => host.querySelector<HTMLElement>('.main-content')!;
    await act(async () => {
      await waitUntil(() => mainContent()?.classList.contains('left-panel-open') === true);
    });
    const collapseButton = host.querySelector<HTMLButtonElement>('button[aria-label="收起文件树"]')!;
    expect(collapseButton).toBeTruthy();
    await act(async () => {
      collapseButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushPromises();
    });
    // 状态语义:left-panel-open 随收起立即移除;再让出若干宏任务,若存在回弹 bug,
    // effect 会在此期间把 leftRailMode 拉回 workspace,类名会重新出现。
    expect(mainContent().classList.contains('left-panel-open')).toBe(false);
    await act(async () => {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await waitForMacrotask();
      }
    });
    expect(mainContent().classList.contains('left-panel-open')).toBe(false);
  });
});
