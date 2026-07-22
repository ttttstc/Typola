// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AboutSection } from './AboutSection';
import type { AppUpdateState, UpdateCheckResult } from '../../services/updateService';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('AboutSection', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('hides the initial placeholder and offers update or ignore actions', async () => {
    const onCheckForUpdate = vi.fn<() => Promise<UpdateCheckResult>>().mockResolvedValue({
      status: 'available',
      version: '2.0.6',
      update: {} as Extract<UpdateCheckResult, { status: 'available' }>['update'],
    });
    const onUpdateAction = vi.fn();
    const onIgnoreUpdate = vi.fn();
    const updateState: AppUpdateState = {
      phase: 'idle',
    };

    await act(async () => {
      root.render(
        <AboutSection
          onCheckForUpdate={onCheckForUpdate}
          updateState={updateState}
          onUpdateAction={onUpdateAction}
          onIgnoreUpdate={onIgnoreUpdate}
        />,
      );
    });

    expect(host.textContent).not.toContain('尚未检查更新');
    expect(host.textContent).toContain('已开启');

    await act(async () => {
      host.querySelector<HTMLButtonElement>('.settings-action-button')?.click();
    });

    expect(host.textContent).toContain('发现新版本 2.0.6');
    expect(host.textContent).toContain('更新并重启');
    expect(host.textContent).toContain('忽略此版本');

    const applyButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('更新并重启'));
    await act(async () => applyButton?.click());
    expect(onUpdateAction).toHaveBeenCalledTimes(1);

    const ignoreButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('忽略此版本'));
    await act(async () => ignoreButton?.click());
    expect(onIgnoreUpdate).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain('已忽略此版本');
  });

  it('keeps an ignored update ignored when an earlier check finishes', async () => {
    let resolveCheck: ((result: UpdateCheckResult) => void) | undefined;
    const onCheckForUpdate = vi.fn(() => new Promise<UpdateCheckResult>((resolve) => {
      resolveCheck = resolve;
    }));
    const onIgnoreUpdate = vi.fn();

    const update = {} as Extract<UpdateCheckResult, { status: 'available' }>['update'];
    const render = (updateState: AppUpdateState) => root.render(
      <AboutSection
        onCheckForUpdate={onCheckForUpdate}
        updateState={updateState}
        onUpdateAction={vi.fn()}
        onIgnoreUpdate={onIgnoreUpdate}
      />,
    );

    await act(async () => {
      render({
        phase: 'available',
        source: 'auto',
        update: { status: 'available', version: '2.0.6', update },
      });
    });

    await act(async () => {
      host.querySelector<HTMLButtonElement>('.settings-action-button')?.click();
    });
    const ignoreButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('忽略此版本'));
    await act(async () => ignoreButton?.click());
    expect(onIgnoreUpdate).toHaveBeenCalledTimes(1);

    await act(async () => {
      render({ phase: 'idle' });
    });
    await act(async () => {
      resolveCheck?.({
        status: 'available',
        version: '2.0.6',
        update,
      });
    });
    expect(host.textContent).toContain('已忽略此版本');
    expect(host.textContent).not.toContain('发现新版本 2.0.6');
  });

  it('手动检查命中已忽略版本时允许重新显示', async () => {
    const update = {} as Extract<UpdateCheckResult, { status: 'available' }>['update'];
    const onShowIgnoredUpdate = vi.fn();
    await act(async () => {
      root.render(
        <AboutSection
          onCheckForUpdate={vi.fn().mockResolvedValue({ status: 'available', version: '2.0.6', update })}
          updateState={{ phase: 'ignored', source: 'manual', update: { status: 'available', version: '2.0.6', update } }}
          onUpdateAction={vi.fn()}
          onIgnoreUpdate={vi.fn()}
          onShowIgnoredUpdate={onShowIgnoredUpdate}
        />,
      );
    });

    expect(host.textContent).toContain('已忽略此版本');
    const showAgain = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('重新显示'));
    expect(showAgain).toBeTruthy();
    await act(async () => showAgain?.click());
    expect(onShowIgnoredUpdate).toHaveBeenCalledTimes(1);
  });
});
