// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SkillHubPanel } from './SkillHubPanel';
import type { SkillHub } from '../services/agent/skillHub';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const skillScannerMock = vi.hoisted(() => ({
  listLocalSkills: vi.fn(),
}));

vi.mock('../services/agent/skillScanner', () => ({
  listLocalSkills: skillScannerMock.listLocalSkills,
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn(),
}), { virtual: true });

function findButtonByText(host: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(host.querySelectorAll('button')).find((entry) => (
    entry.textContent?.includes(text)
  ));
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`button not found: ${text}`);
  }
  return button;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('SkillHubPanel', () => {
  let host: HTMLDivElement;
  let root: Root;

  const opencodeHub: SkillHub = {
    version: 2,
    sceneAdditions: {
      html: [{ name: 'frontend-slides', description: 'HTML slides', supportedProviders: ['opencode'] }],
    },
    hiddenSystemSkills: {},
  };

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    skillScannerMock.listLocalSkills.mockReset().mockResolvedValue([
      {
        name: 'frontend-slides',
        description: 'HTML slides',
        source: 'opencode',
        path: String.raw`D:\notes\.opencode\commands\frontend-slides.md`,
      },
    ]);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('renders OpenCode commands as installed and picks the command card', async () => {
    const onPickSkill = vi.fn();
    const onReload = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      root.render(
        <SkillHubPanel
          activeProvider="opencode"
          activeWorkspaceRoot={String.raw`D:\notes`}
          hub={opencodeHub}
          onPickSkill={onPickSkill}
          onInstallSkill={vi.fn()}
          onSaveHub={vi.fn()}
          onReload={onReload}
        />,
      );
    });

    await act(async () => undefined);
    act(() => findButtonByText(host, 'HTML 生成').click());

    expect(host.textContent).toContain('frontend-slides');
    expect(host.textContent).not.toContain('/frontend-slides');
    expect(host.textContent).toContain('已安装');
    expect(host.textContent).not.toContain('让 Claude 安装');

    act(() => findButtonByText(host, 'frontend-slides').click());

    expect(onPickSkill).toHaveBeenCalledWith('frontend-slides');
    expect(skillScannerMock.listLocalSkills).toHaveBeenCalledWith('opencode', String.raw`D:\notes`);
  });

  it('allows adding an OpenCode command with the same name as a Claude custom skill', async () => {
    const onSaveHub = vi.fn().mockResolvedValue(undefined);
    skillScannerMock.listLocalSkills.mockResolvedValue([
      {
        name: 'write-report',
        description: 'Write report',
        source: 'opencode',
        path: String.raw`D:\notes\.opencode\commands\write-report.md`,
      },
    ]);
    const mixedHub: SkillHub = {
      version: 2,
      sceneAdditions: {
        html: [{ name: 'write-report', description: 'Claude version', supportedProviders: ['claude'] }],
      },
      hiddenSystemSkills: {},
    };

    await act(async () => {
      root.render(
        <SkillHubPanel
          activeProvider="opencode"
          activeWorkspaceRoot={String.raw`D:\notes`}
          hub={mixedHub}
          onPickSkill={vi.fn()}
          onInstallSkill={vi.fn()}
          onSaveHub={onSaveHub}
          onReload={vi.fn().mockResolvedValue(undefined)}
        />,
      );
    });

    await act(async () => undefined);
    act(() => findButtonByText(host, 'HTML 生成').click());
    act(() => findButtonByText(host, '添加 OpenCode command').click());

    const localButton = findButtonByText(host, 'write-report');
    expect(localButton.disabled).toBe(false);

    await act(async () => {
      localButton.click();
    });

    expect(onSaveHub).toHaveBeenCalledWith(expect.objectContaining({
      sceneAdditions: expect.objectContaining({
        html: [expect.objectContaining({
          name: 'write-report',
          supportedProviders: ['claude', 'opencode'],
        })],
      }),
    }));
  });

  it('reloads skill-hub and scans OpenCode commands for the active workspace', async () => {
    const onReload = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      root.render(
        <SkillHubPanel
          activeProvider="opencode"
          activeWorkspaceRoot={String.raw`D:\notes`}
          hub={opencodeHub}
          onPickSkill={vi.fn()}
          onInstallSkill={vi.fn()}
          onSaveHub={vi.fn()}
          onReload={onReload}
        />,
      );
    });

    await act(async () => undefined);
    const reloadButton = host.querySelector<HTMLButtonElement>('.skill-hub-reload');
    expect(reloadButton).toBeTruthy();

    await act(async () => {
      reloadButton?.click();
    });

    expect(onReload).toHaveBeenCalledTimes(1);
    expect(skillScannerMock.listLocalSkills).toHaveBeenLastCalledWith('opencode', String.raw`D:\notes`);
  });

  it('ignores stale scan results after provider changes', async () => {
    const opencodeScan = deferred<Awaited<ReturnType<typeof skillScannerMock.listLocalSkills>>>();
    const claudeScan = deferred<Awaited<ReturnType<typeof skillScannerMock.listLocalSkills>>>();
    skillScannerMock.listLocalSkills.mockImplementation((provider) => (
      provider === 'opencode' ? opencodeScan.promise : claudeScan.promise
    ));
    const mixedHub: SkillHub = {
      version: 2,
      sceneAdditions: {
        html: [{ name: 'write-report', description: 'Claude report', supportedProviders: ['claude'] }],
      },
      hiddenSystemSkills: {},
    };

    await act(async () => {
      root.render(
        <SkillHubPanel
          activeProvider="opencode"
          activeWorkspaceRoot={String.raw`D:\notes`}
          hub={mixedHub}
          onPickSkill={vi.fn()}
          onInstallSkill={vi.fn()}
          onSaveHub={vi.fn()}
          onReload={vi.fn().mockResolvedValue(undefined)}
        />,
      );
    });

    await act(async () => {
      root.render(
        <SkillHubPanel
          activeProvider="claude"
          activeWorkspaceRoot={String.raw`D:\notes`}
          hub={mixedHub}
          onPickSkill={vi.fn()}
          onInstallSkill={vi.fn()}
          onSaveHub={vi.fn()}
          onReload={vi.fn().mockResolvedValue(undefined)}
        />,
      );
    });

    await act(async () => {
      claudeScan.resolve([]);
      await claudeScan.promise;
    });
    await act(async () => {
      opencodeScan.resolve([
        {
          name: 'write-report',
          description: 'OpenCode report',
          source: 'opencode',
          path: String.raw`D:\notes\.opencode\commands\write-report.md`,
        },
      ]);
      await opencodeScan.promise;
    });
    act(() => findButtonByText(host, 'HTML 生成').click());

    const staleInstalledCard = Array.from(host.querySelectorAll('li')).find((entry) => (
      entry.textContent?.includes('write-report')
    ));
    expect(staleInstalledCard?.textContent).toContain('未安装');
    expect(staleInstalledCard?.textContent).not.toContain('已安装');
  });
});
