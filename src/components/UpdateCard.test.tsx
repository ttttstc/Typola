// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpdateCard } from './UpdateCard';
import type { AppUpdateState } from '../services/updateService';

const available = {
  status: 'available',
  version: '2.0.6',
  update: {},
} as Extract<import('../services/updateService').UpdateCheckResult, { status: 'available' }>;

describe('UpdateCard', () => {
  const hosts: HTMLDivElement[] = [];

  afterEach(() => {
    hosts.splice(0).forEach((host) => host.remove());
  });

  function render(
    state: AppUpdateState,
    distributionKind: 'installed' | 'portable' = 'installed',
    onIgnore = vi.fn(),
  ) {
    const host = document.createElement('div');
    hosts.push(host);
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(
      <UpdateCard state={state} distributionKind={distributionKind} onAction={vi.fn()} onIgnore={onIgnore} />,
    ));
    return { host, root };
  }

  it('shows the target version and installed update action', () => {
    const { host, root } = render({ phase: 'available', source: 'auto', update: available });
    expect(host.textContent).toContain('发现新版本');
    expect(host.textContent).toContain('v2.0.6');
    expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('更新并重启');
    act(() => root.unmount());
  });

  it('lets the user ignore an available update', () => {
    const onIgnore = vi.fn();
    const { host, root } = render({ phase: 'available', source: 'auto', update: available }, 'installed', onIgnore);
    const ignoreButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('忽略此版本'));

    expect(ignoreButton).toBeDefined();
    act(() => ignoreButton?.click());
    expect(onIgnore).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it('shows progress and disables duplicate clicks while downloading', () => {
    const { host, root } = render({
      phase: 'downloading',
      source: 'manual',
      update: available,
      progress: { status: 'downloading', downloadedBytes: 50, totalBytes: 100, percent: 50 },
    });
    expect(host.textContent).toContain('50%');
    expect(host.querySelector('button')?.disabled).toBe(true);
    act(() => root.unmount());
  });

  it('labels portable updates as downloads', () => {
    const { host, root } = render({ phase: 'available', source: 'auto', update: available }, 'portable');
    expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('下载新版本');
    act(() => root.unmount());
  });
});
