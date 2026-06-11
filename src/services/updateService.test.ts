import type { DownloadEvent, Update } from '@tauri-apps/plugin-updater';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FALLBACK_APP_VERSION,
  checkForAppUpdate,
  downloadAppUpdate,
  getCurrentAppVersion,
  installDownloadedAppUpdate,
  isTauriRuntime,
} from './updateService';

const processMock = vi.hoisted(() => ({
  relaunch: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-process', () => processMock);

describe('updateService', () => {
  beforeEach(() => {
    processMock.relaunch.mockReset();
  });

  it('detects browser test runtime as unsupported for Tauri updater', async () => {
    expect(isTauriRuntime()).toBe(false);
    await expect(checkForAppUpdate()).resolves.toEqual({ status: 'unsupported' });
  });

  it('returns the bundled app version fallback outside Tauri', async () => {
    await expect(getCurrentAppVersion()).resolves.toBe(FALLBACK_APP_VERSION);
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
