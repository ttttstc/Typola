// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScenarioPanel } from './ScenarioPanel';
import type { AgentBridge } from '../services/agentBridge';
import { readFlowScenarios } from '../services/flowScenarioService';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TEST_SCENARIO = {
  id: 'html-ppt',
  label: 'HTML 生成',
  icon: 'presentation',
  description: '把当前文档转成可演示的 HTML 页面',
  promptTemplate: '把 {file} 生成 HTML 演示,输出到 {fileName}.html',
};

vi.mock('../hooks/useSettings', () => ({
  useSettings: () => ({ aiClaudePath: 'claude' }),
}));

// P1-D:readFlowScenarios 改返回 {scenarios, error?};用真实 buildContextFromFile / resolveFlowScenarioTemplate
// (透传原模块),readFlowScenarios mock 化让用例可覆盖错误场景
vi.mock('../services/flowScenarioService', async () => {
  const actual = await vi.importActual<typeof import('../services/flowScenarioService')>('../services/flowScenarioService');
  return {
    ...actual,
    readFlowScenarios: vi.fn(() => Promise.resolve({ scenarios: [TEST_SCENARIO] })),
    openFlowScenariosFile: vi.fn(() => Promise.resolve('')),
  };
});

function flushPromises(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

interface MockBridge extends AgentBridge {
  ensureTerminal: ReturnType<typeof vi.fn>;
  injectText: ReturnType<typeof vi.fn>;
  hasTerminal: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
}

function makeBridge(initial: { hasTerminal: boolean }): MockBridge {
  let has = initial.hasTerminal;
  return {
    ensureTerminal: vi.fn(async (_command: string, _cwd?: string) => {
      has = true;
    }),
    injectText: vi.fn(),
    hasTerminal: vi.fn(() => has),
    focus: vi.fn(),
  };
}

describe('ScenarioPanel (P1-C 一步式应用)', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.clearAllTimers();
  });

  function render(props: {
    bridge: MockBridge;
    filePath?: string;
    workspaceRoot?: string;
  }) {
    act(() => {
      root.render(
        <ScenarioPanel
          bridge={props.bridge}
          filePath={props.filePath ?? 'C:/work/demo.md'}
          workspaceRoot={props.workspaceRoot ?? 'C:/work'}
          onEnsureTerminalVisible={() => {}}
          onBeforeInject={() => Promise.resolve()}
        />,
      );
    });
  }

  it('无终端时先 ensureTerminal(等就绪)再 injectText(命令)', async () => {
    const bridge = makeBridge({ hasTerminal: false });
    render({ bridge });

    // 等 useEffect + readFlowScenarios 完成
    await act(async () => { await flushPromises(); });

    const btn = host.querySelector<HTMLButtonElement>('.scenario-apply-btn');
    expect(btn).not.toBeNull();
    expect(btn?.disabled).toBe(false);

    // 控制 ensureTerminal 的完成时机:我们在 ensureTerminal 内部同步记录一次 injectText 是否已被调用
    const callOrder: string[] = [];
    bridge.ensureTerminal.mockImplementationOnce(async () => {
      callOrder.push('ensureTerminal:start');
      // 在 ensureTerminal 期间,injectText 还不应被调用(等就绪后才能注入)
      callOrder.push(`injectText?=${bridge.injectText.mock.calls.length}`);
    });
    bridge.injectText.mockImplementation(() => {
      callOrder.push('injectText');
    });

    await act(async () => {
      btn!.click();
      // 让 React 调度 + Promise.resolve().then(...) + setPhase('starting') flush
      await flushPromises();
      // 此刻 ensureTerminal 已 resolve → 应走到 setPhase('injecting') + injectText
      await flushPromises();
    });

    // 关键断言:ensureTerminal 必须在 injectText 之前完成
    expect(callOrder).toEqual(['ensureTerminal:start', 'injectText?=0', 'injectText']);
    expect(bridge.injectText).toHaveBeenCalledTimes(1);
    const injected = bridge.injectText.mock.calls[0]?.[0] ?? '';
    expect(injected).toContain('把 ');
    expect(injected).toContain(' 生成 HTML 演示');
  });

  it('已有终端时直接 injectText,不再 ensureTerminal', async () => {
    const bridge = makeBridge({ hasTerminal: true });
    render({ bridge });

    await act(async () => { await flushPromises(); });

    const btn = host.querySelector<HTMLButtonElement>('.scenario-apply-btn');
    expect(btn).not.toBeNull();

    await act(async () => {
      btn!.click();
      await flushPromises();
    });

    expect(bridge.ensureTerminal).not.toHaveBeenCalled();
    expect(bridge.injectText).toHaveBeenCalledTimes(1);
  });

  it('apply 过程中 phase=starting|injecting 时按钮 disabled,完成后回到 idle 可再点', async () => {
    const bridge = makeBridge({ hasTerminal: false });
    render({ bridge });

    await act(async () => { await flushPromises(); });

    const btn = host.querySelector<HTMLButtonElement>('.scenario-apply-btn');
    expect(btn?.disabled).toBe(false);

    // 让 ensureTerminal 挂起,期间观察按钮 disabled + 文案
    let release!: () => void;
    bridge.ensureTerminal.mockImplementationOnce(() => new Promise<void>((resolve) => {
      release = () => resolve();
    }));

    let phaseBtn!: HTMLButtonElement | null;
    const clickAndObserve = async () => {
      await act(async () => {
        btn!.click();
        await flushPromises();
      });
      phaseBtn = host.querySelector<HTMLButtonElement>('.scenario-apply-btn');
    };
    await clickAndObserve();

    expect(phaseBtn?.disabled).toBe(true);
    expect(phaseBtn?.textContent).toContain('正在启动 Claude');

    // 放行 ensureTerminal → 进入 injecting
    await act(async () => {
      release();
      await flushPromises();
    });
    // 同步读:phase 可能在 injecting 与 idle 之间
    // 我们追加一次 ensureTerminal 不挂起的点击,验证 idle 阶段可再次点击
    expect(bridge.injectText).toHaveBeenCalledTimes(1);

    // 再点一次(此时 phase 应已是 idle)
    const btn2 = host.querySelector<HTMLButtonElement>('.scenario-apply-btn');
    expect(btn2?.disabled).toBe(false);
    await act(async () => {
      btn2!.click();
      await flushPromises();
    });
    // 第二次:hasTerminal=true,不会走 ensureTerminal
    expect(bridge.injectText).toHaveBeenCalledTimes(2);
  });

  it('无 filePath 时按钮 disabled,即使点击也不触发 bridge', async () => {
    const bridge = makeBridge({ hasTerminal: false });
    render({ bridge, filePath: '' });

    await act(async () => { await flushPromises(); });

    const btn = host.querySelector<HTMLButtonElement>('.scenario-apply-btn');
    expect(btn?.disabled).toBe(true);

    await act(async () => {
      btn?.click();
      await flushPromises();
    });

    expect(bridge.ensureTerminal).not.toHaveBeenCalled();
    expect(bridge.injectText).not.toHaveBeenCalled();
  });
});

describe('ScenarioPanel (P1-D JSON 解析失败可见)', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    vi.mocked(readFlowScenarios).mockReset();
    vi.mocked(readFlowScenarios).mockResolvedValue({ scenarios: [TEST_SCENARIO] });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.clearAllTimers();
  });

  function renderWithBridge(initial: { hasTerminal: boolean }) {
    const bridge = makeBridge(initial);
    act(() => {
      root.render(
        <ScenarioPanel
          bridge={bridge}
          filePath="C:/work/demo.md"
          workspaceRoot="C:/work"
          onEnsureTerminalVisible={() => {}}
          onBeforeInject={() => Promise.resolve()}
        />,
      );
    });
    return bridge;
  }

  it('JSON 解析失败时显示红条 + 「打开文件修复」按钮(不静默回退 seed)', async () => {
    vi.mocked(readFlowScenarios).mockResolvedValueOnce({
      scenarios: [],
      error: 'JSON 解析失败: Unexpected token } in JSON at position 12',
    });

    renderWithBridge({ hasTerminal: false });
    await act(async () => { await flushPromises(); });

    const errBar = host.querySelector<HTMLDivElement>('.scenario-load-error');
    expect(errBar).not.toBeNull();
    expect(errBar?.textContent).toContain('JSON 解析失败');
    expect(errBar?.textContent).toContain('Unexpected token');
    const fixBtn = errBar?.querySelector<HTMLButtonElement>('.scenario-load-error-btn');
    expect(fixBtn?.textContent).toContain('打开文件修复');
    // 不应该渲染场景卡网格(因为没有 scenarios)
    expect(host.querySelector('.scenario-grid')).toBeNull();
    // 也不应该渲染「正在加载…」(因为已加载,只是失败)
    expect(host.querySelector('.scenario-empty')).toBeNull();
  });

  it('IO 失败但 seed 可用时,场景卡仍可用 + 顶部红条提示', async () => {
    vi.mocked(readFlowScenarios).mockResolvedValueOnce({
      scenarios: [TEST_SCENARIO],
      error: '读场景注册表失败: disk error',
    });

    renderWithBridge({ hasTerminal: true });
    await act(async () => { await flushPromises(); });

    const errBar = host.querySelector<HTMLDivElement>('.scenario-load-error');
    expect(errBar).not.toBeNull();
    expect(errBar?.textContent).toContain('disk error');
    // 场景卡仍可用
    const card = host.querySelector<HTMLButtonElement>('.scenario-card');
    expect(card).not.toBeNull();
  });

  it('点击「打开文件修复」触发 openFlowScenariosFile', async () => {
    vi.mocked(readFlowScenarios).mockResolvedValueOnce({
      scenarios: [],
      error: 'JSON 解析失败: boom',
    });

    renderWithBridge({ hasTerminal: false });
    await act(async () => { await flushPromises(); });

    const fixBtn = host.querySelector<HTMLButtonElement>('.scenario-load-error-btn');
    expect(fixBtn).not.toBeNull();

    const { openFlowScenariosFile } = await import('../services/flowScenarioService');
    await act(async () => {
      fixBtn!.click();
      await flushPromises();
    });
    expect(openFlowScenariosFile).toHaveBeenCalled();
  });

  it('loadError 不会被 apply 操作误清', async () => {
    vi.mocked(readFlowScenarios).mockResolvedValueOnce({
      scenarios: [TEST_SCENARIO],
      error: '读场景注册表失败: disk error',
    });

    const bridge = renderWithBridge({ hasTerminal: true });
    await act(async () => { await flushPromises(); });

    expect(host.querySelector('.scenario-load-error')).not.toBeNull();

    // 点 apply —— 不应清掉 loadError
    const btn = host.querySelector<HTMLButtonElement>('.scenario-apply-btn');
    await act(async () => {
      btn?.click();
      await flushPromises();
    });
    expect(host.querySelector('.scenario-load-error')).not.toBeNull();
    expect(bridge.injectText).toHaveBeenCalled();
  });
});
