// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SkillHubPanel } from './SkillHubPanel';
import {
  EMPTY_SKILL_HUB,
  type SkillHub,
} from '../services/agent/skillHub';

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

    expect(onPickSkill).toHaveBeenCalledWith(expect.objectContaining({
      scene: expect.objectContaining({ id: 'html' }),
      skill: expect.objectContaining({
        name: 'frontend-slides',
      }),
    }));
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

  it('splits system skills and custom skills into separate section headers', async () => {
    // M2.5 起系统预置 scene 仅在 claude provider 下可见,换 provider 验证 sections 拆分
    const claudeHub: SkillHub = {
      version: 2,
      sceneAdditions: {
        html: [
          { name: 'my-team-skill', description: 'team-made', supportedProviders: ['claude'] },
        ],
      },
      hiddenSystemSkills: {},
    };
    skillScannerMock.listLocalSkills.mockReset().mockResolvedValue([
      {
        name: 'frontend-slides',
        description: 'HTML slides',
        source: 'claude',
        path: String.raw`D:\notes\.claude\skills\frontend-slides.md`,
      },
    ]);

    await act(async () => {
      root.render(
        <SkillHubPanel
          activeProvider="claude"
          activeWorkspaceRoot={String.raw`D:\notes`}
          hub={claudeHub}
          onPickSkill={vi.fn()}
          onInstallSkill={vi.fn()}
          onSaveHub={vi.fn()}
          onReload={vi.fn().mockResolvedValue(undefined)}
        />,
      );
    });

    await act(async () => undefined);
    act(() => findButtonByText(host, 'HTML 生成').click());

    const categoryTitles = Array.from(host.querySelectorAll<HTMLElement>('.skill-hub-category-title'));
    const titles = categoryTitles.map((node) => node.textContent ?? '');
    expect(titles).toContain('推荐 skill');
    expect(titles).toContain('自定义 skill');
    // 推荐/custom 的 li 各自归属:frontend-slides 在系统段,my-team-skill 在自定义段
    const sections = Array.from(host.querySelectorAll<HTMLElement>('.skill-hub-category'));
    const systemSection = sections.find((node) => node.textContent?.includes('推荐 skill'));
    const customSection = sections.find((node) => node.textContent?.includes('自定义 skill'));
    expect(systemSection).toBeDefined();
    expect(customSection).toBeDefined();
    expect(systemSection!.textContent).toContain('frontend-slides');
    expect(systemSection!.textContent).not.toContain('my-team-skill');
    expect(customSection!.textContent).toContain('my-team-skill');
    expect(customSection!.textContent).not.toContain('frontend-slides');
  });

  it('shows 内置 badge and output chip for builtin system skills (daily scene)', async () => {
    // daily scene 含 builtin + output 的 data-report-html;正适合两个 UI 元素一起测
    skillScannerMock.listLocalSkills.mockReset().mockResolvedValue([]);
    await act(async () => {
      root.render(
        <SkillHubPanel
          activeProvider="claude"
          activeWorkspaceRoot={String.raw`D:\notes`}
          hub={EMPTY_SKILL_HUB}
          onPickSkill={vi.fn()}
          onInstallSkill={vi.fn()}
          onSaveHub={vi.fn()}
          onReload={vi.fn().mockResolvedValue(undefined)}
        />,
      );
    });

    await act(async () => undefined);
    act(() => findButtonByText(host, '日报周报').click());

    const sections = Array.from(host.querySelectorAll<HTMLElement>('.skill-hub-category'));
    const systemSection = sections.find((node) => node.textContent?.includes('推荐 skill'));
    expect(systemSection).toBeDefined();
    // nb 是 installSource 类,不显示 builtin
    const nbItem = Array.from(systemSection!.querySelectorAll('li')).find((node) => (
      node.textContent?.includes('nb')
    ));
    expect(nbItem).toBeDefined();
    expect(nbItem?.querySelector('.skill-hub-badge.builtin')).toBeNull();
    // data-report-html 是 builtin + output:html
    const builtinItem = Array.from(systemSection!.querySelectorAll('li')).find((node) => (
      node.textContent?.includes('data-report-html')
    ));
    expect(builtinItem).toBeDefined();
    const builtinBadge = builtinItem?.querySelector<HTMLElement>('.skill-hub-badge.builtin');
    expect(builtinBadge?.textContent).toContain('内置');
    // output 已从 topline chip 降级到 meta 行,文案 "产物 html" / "产物 markdown"
    const builtinMeta = builtinItem?.querySelectorAll<HTMLElement>('.skill-hub-item-meta-item');
    expect(Array.from(builtinMeta ?? []).map((node) => node.textContent ?? '').join('|'))
      .toContain('产物 html');
    const nbMeta = Array.from(nbItem?.querySelectorAll<HTMLElement>('.skill-hub-item-meta-item') ?? [])
      .map((node) => node.textContent ?? '').join('|');
    expect(nbMeta).toContain('产物 markdown');
    // 没自定义 skill 时显示 teach-state empty hint + 「去添加」按钮
    expect(host.textContent).toContain('还没有自定义 Claude skill');
    const emptyHint = host.querySelector<HTMLElement>('.skill-hub-empty-hint');
    expect(emptyHint?.textContent).toContain('去添加');
    expect(emptyHint?.querySelector('button')).toBeTruthy();
    // builtin skill 不应该点亮「缺少来源」warning(按口径 builtin 不补 installSource)
    expect(builtinItem?.querySelector('.skill-hub-item-meta-item')?.textContent)
      .not.toContain('缺少来源');
  });

  it('hides the empty-custom hint when scene has no system skills (knowledge scene)', async () => {
    // knowledge scene 在 SYSTEM_SKILL_SCENES 里 systemSkills 是空数组,所以两个 section 都该被裁掉
    skillScannerMock.listLocalSkills.mockReset().mockResolvedValue([]);
    await act(async () => {
      root.render(
        <SkillHubPanel
          activeProvider="claude"
          activeWorkspaceRoot={String.raw`D:\notes`}
          hub={EMPTY_SKILL_HUB}
          onPickSkill={vi.fn()}
          onInstallSkill={vi.fn()}
          onSaveHub={vi.fn()}
          onReload={vi.fn().mockResolvedValue(undefined)}
        />,
      );
    });

    await act(async () => undefined);
    const knowledgeButton = findButtonByText(host, '知识沉淀');
    act(() => knowledgeButton.click());

    // knowledge 没有 system skill,可见的 section 为空 → 不该出现 category-title
    expect(host.querySelectorAll('.skill-hub-category-title')).toHaveLength(0);
    expect(host.textContent).not.toContain('还没有自定义');
  });
});
