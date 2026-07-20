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
  invoke: vi.fn().mockResolvedValue([]),
}));

const tauriEventMock = vi.hoisted(() => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));

const fileServiceMock = vi.hoisted(() => ({
  openFile: vi.fn(),
  openPath: vi.fn(),
  saveFile: vi.fn(),
  saveFileAs: vi.fn(),
}));

const updateServiceMock = vi.hoisted(() => ({
  checkForAppUpdate: vi.fn<() => Promise<UpdateCheckResult>>(),
  downloadAppUpdate: vi.fn<() => Promise<void>>(),
  installDownloadedAppUpdate: vi.fn<() => Promise<void>>(),
  getDistributionKind: vi.fn().mockResolvedValue('installed'),
  openReleaseForVersion: vi.fn<() => Promise<void>>(),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => tauriWindowMock,
}));

vi.mock('@tauri-apps/api/core', () => tauriCoreMock);

vi.mock('@tauri-apps/api/event', () => tauriEventMock);

vi.mock('../services/fileService', () => fileServiceMock);

vi.mock('../services/updateService', () => ({
  checkForAppUpdate: updateServiceMock.checkForAppUpdate,
  downloadAppUpdate: updateServiceMock.downloadAppUpdate,
  installDownloadedAppUpdate: updateServiceMock.installDownloadedAppUpdate,
  getDistributionKind: updateServiceMock.getDistributionKind,
  openReleaseForVersion: updateServiceMock.openReleaseForVersion,
}));

function flushPromises(): Promise<void> {
  return Promise.resolve();
}

function waitForMacrotask(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

describe('AppLayout source editor', () => {
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
    localStorage.removeItem('typola-last-opened-file');
    delete (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    vi.clearAllMocks();
  });

  it('keeps the startup-reopened Markdown file clean', async () => {
    const path = 'D:\\docs\\startup.md';
    const content = '| Column A | Column B |\r\n| --- | --- |\r\n| value | value |\r\n';
    localStorage.setItem('typola-last-opened-file', path);
    fileServiceMock.openPath.mockResolvedValue({
      path,
      name: 'startup.md',
      content,
      dirty: false,
      lastSavedContent: content,
      fileType: 'markdown',
    });

    await act(async () => {
      root.render(<AppLayout />);
      await flushPromises();
    });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 750));
      await vi.dynamicImportSettled();
      await flushPromises();
      await waitForMacrotask();
    });

    expect(fileServiceMock.openPath).toHaveBeenCalledWith(path, 'UTF-8');
    expect(host.querySelector('.status-save-state')).toBeNull();
    expect(tauriWindowMock.setTitle).toHaveBeenLastCalledWith('startup.md');
  });

  it('keeps a newly opened Markdown file clean in the real CodeMirror editor', async () => {
    fileServiceMock.openFile.mockResolvedValue({
      path: 'D:\\docs\\clean.md',
      name: 'clean.md',
      content: '# Clean document',
      dirty: false,
      lastSavedContent: '# Clean document',
      fileType: 'markdown',
    });

    await act(async () => {
      root.render(<AppLayout />);
      await flushPromises();
    });
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', ctrlKey: true }));
      await vi.dynamicImportSettled();
      await flushPromises();
      await waitForMacrotask();
    });

    expect(host.querySelector('.cm-content')?.textContent).toContain('Clean document');
    expect(host.querySelector('.status-save-state')).toBeNull();
    expect(tauriWindowMock.setTitle).toHaveBeenLastCalledWith('clean.md');
  });

  it('renders the original HTML file source in CodeMirror after switching from the WYSIWYG pane', async () => {
    const source = [
      '<!doctype html>',
      '<html>',
      '<body>',
      '<h1 align="right">材料清单</h1>',
      '<table>',
      '<tr><th rowspan="2">序号</th><th colspan="2">证据</th></tr>',
      '<tr><td>1</td><td>合同</td></tr>',
      '</table>',
      '</body>',
      '</html>',
    ].join('\n');

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
      await vi.dynamicImportSettled();
      await flushPromises();
      await flushPromises();
      await flushPromises();
      await flushPromises();
      await waitForMacrotask();
    });

    const sourceEditor = host.querySelector('.cm-editor');
    const sourceContent = host.querySelector('.cm-content');

    expect(sourceEditor).toBeTruthy();
    expect(sourceContent?.textContent).toContain('<!doctype html>');
    expect(sourceContent?.textContent).toContain('<h1 align="right">材料清单</h1>');
    expect(sourceContent?.textContent).toContain('rowspan="2"');
  });
});
