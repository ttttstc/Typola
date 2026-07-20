import type { DownloadEvent, Update } from '@tauri-apps/plugin-updater';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEVELOPMENT_APP_VERSION,
  checkForAppUpdate,
  downloadAppUpdate,
  getCurrentAppVersion,
  installDownloadedAppUpdate,
  isTauriRuntime,
  openReleaseForVersion,
} from './updateService';

const processMock = vi.hoisted(() => ({
  relaunch: vi.fn(),
}));
const updaterMock = vi.hoisted(() => ({
  check: vi.fn(),
}));
const openerMock = vi.hoisted(() => ({
  openUrl: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-process', () => processMock);
vi.mock('@tauri-apps/plugin-updater', () => updaterMock);
vi.mock('@tauri-apps/plugin-opener', () => openerMock);

describe('updateService', () => {
  beforeEach(() => {
    processMock.relaunch.mockReset();
    updaterMock.check.mockReset();
    openerMock.openUrl.mockReset();
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it('detects browser test runtime as unsupported for Tauri updater', async () => {
    expect(isTauriRuntime()).toBe(false);
    await expect(checkForAppUpdate()).resolves.toEqual({ status: 'unsupported' });
  });

  it('returns the bundled app version fallback outside Tauri', async () => {
    await expect(getCurrentAppVersion()).resolves.toBe(DEVELOPMENT_APP_VERSION);
  });

  it('opens the release for the detected portable update version', async () => {
    await openReleaseForVersion('2.0.6');
    expect(openerMock.openUrl).toHaveBeenCalledWith(
      'https://github.com/ttttstc/Typola/releases/tag/v2.0.6',
    );
  });

  it('reuses an in-flight update check', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
    let resolveCheck: ((value: null) => void) | undefined;
    updaterMock.check.mockImplementation(() => new Promise<null>((resolve) => {
      resolveCheck = resolve;
    }));

    const first = checkForAppUpdate();
    const second = checkForAppUpdate();
    expect(second).toBe(first);
    await vi.waitFor(() => expect(updaterMock.check).toHaveBeenCalledTimes(1));
    expect(updaterMock.check).toHaveBeenCalledWith({ timeout: 30_000 });
    resolveCheck?.(null);
    await expect(first).resolves.toEqual({ status: 'not-available' });
  });

  it('downloads app updates without installing immediately', async () => {
    const download = vi.fn(async (onEvent: (event: DownloadEvent) => void) => {
      onEvent({ event: 'Started', data: { contentLength: 100 } });
      onEvent({ event: 'Progress', data: { chunkLength: 30 } });
      onEvent({ event: 'Progress', data: { chunkLength: 70 } });
      onEvent({ event: 'Finished' });
    });
    const install = vi.fn();
    const update = { download, install } as unknown as Update;
    const progress: string[] = [];

    await downloadAppUpdate(update, (item) => {
      progress.push(`${item.status}:${item.percent ?? 'unknown'}`);
    });

    expect(download).toHaveBeenCalledTimes(1);
    expect(install).not.toHaveBeenCalled();
    expect(progress).toEqual(['downloading:0', 'downloading:30', 'downloading:100', 'ready:100']);
  });

  it('installs a downloaded update and relaunches the app', async () => {
    const install = vi.fn(async () => undefined);
    const update = { install } as unknown as Update;
    const progress: string[] = [];

    await installDownloadedAppUpdate(update, (item) => {
      progress.push(item.status);
    });

    expect(install).toHaveBeenCalledTimes(1);
    expect(processMock.relaunch).toHaveBeenCalledTimes(1);
    expect(progress).toEqual(['installing', 'relaunching']);
  });
});
