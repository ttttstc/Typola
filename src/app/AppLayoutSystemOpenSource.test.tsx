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
});
