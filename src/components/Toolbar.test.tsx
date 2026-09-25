// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toolbar } from './Toolbar';
import type { FormatAction } from './EditorContextMenu';

vi.mock('../hooks/useSettings', () => ({
  useSettings: () => ({ locale: 'zh-CN' }),
}));

vi.mock('./DocumentModeSwitcher', () => ({
  DocumentModeSwitcher: () => <div data-testid="document-mode-switcher" />,
}));

vi.mock('./defineColor/DefineColorToolbarButton', () => ({
  DefineColorToolbarButton: () => <div data-testid="define-color-button" />,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
const hosts: HTMLDivElement[] = [];

function renderToolbar(
  onFormat: (action: FormatAction) => void,
  overrides: Partial<{ rightPanelAvailable: boolean; rightPanelOpen: boolean; rightPanelCollapsed: boolean }> = {},
): HTMLDivElement {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  hosts.push(host);
  act(() => {
    root.render(
      <Toolbar
        editorMode="wysiwyg"
        workspacePanelVisible={false}
        wordPreviewVisible={false}
        wechatPreviewVisible={false}
        rightPanelAvailable={overrides.rightPanelAvailable ?? false}
        rightPanelOpen={overrides.rightPanelOpen ?? false}
        rightPanelCollapsed={overrides.rightPanelCollapsed ?? false}
        terminalVisible={false}
        editingDisabled={false}
        docMode="read"
        onToggleEditorMode={() => {}}
        onFormat={onFormat}
        onToggleWorkspacePanel={() => {}}
        onToggleWordPreview={() => {}}
        onToggleWechatPreview={() => {}}
        onToggleRightPanel={() => {}}
        onToggleTerminal={() => {}}
        onSetDocMode={() => {}}
        onNew={() => {}}
        onOpen={() => {}}
        onSave={() => {}}
        onSaveAs={() => {}}
        onOpenSettings={() => {}}
      />,
    );
  });
  return host;
}

describe('Toolbar format actions', () => {
  afterEach(() => {
    for (const root of roots) act(() => root.unmount());
    for (const host of hosts) host.remove();
    roots.length = 0;
    hosts.length = 0;
  });

  it('只保留高频格式按钮,其余收进「更多格式」下拉', () => {
    const host = renderToolbar(() => {});
    const group = host.querySelector('.toolbar-format-actions');
    expect(group).not.toBeNull();
    const buttons = Array.from(group!.querySelectorAll('button'));
    expect(buttons).toHaveLength(7);
    const tooltips = buttons.map((button) => button.dataset.tooltip);
    expect(tooltips).toEqual([
      '加粗 (Ctrl+B)',
      '斜体 (Ctrl+I)',
      '链接 (Ctrl+K)',
      '代码块 (Ctrl+Shift+K)',
      '无序列表',
      '有序列表',
      '更多格式',
    ]);
    // 低频格式不再占独立按钮位（工具栏内容需 ≤ 常见窗口宽度）
    for (const gone of ['删除线', '高亮', '公式块 (Ctrl+Shift+M)', '引用块', '任务列表', '分隔线', '格式刷']) {
      expect(group!.querySelector(`[data-tooltip="${gone}"]`)).toBeNull();
    }
    const trigger = group!.querySelector('.split-chevron-solo');
    // floating-ui 的 useRole 会把它写成 aria-haspopup="menu"(比裸 true 更准确)
    expect(trigger?.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
  });

  it.each([
    ['代码块 (Ctrl+Shift+K)', { type: 'codeblock' }],
    ['链接 (Ctrl+K)', { type: 'link' }],
    ['无序列表', { type: 'ul' }],
    ['有序列表', { type: 'ol' }],
  ] as const)('click %s → onFormat(%j)', (tooltip, action) => {
    const onFormat = vi.fn();
    const host = renderToolbar(onFormat);
    const button = Array.from(host.querySelectorAll<HTMLButtonElement>('.toolbar-format-actions button'))
      .find((item) => item.dataset.tooltip === tooltip);
    expect(button).toBeTruthy();
    act(() => { button!.click(); });
    expect(onFormat).toHaveBeenCalledWith(action);
  });
});

describe('Toolbar 右栏折叠按钮', () => {
  afterEach(() => {
    for (const root of roots) act(() => root.unmount());
    for (const host of hosts) host.remove();
    roots.length = 0;
    hosts.length = 0;
  });

  it('位于工具栏最右端(最后一个 group),不在 view 组中间', () => {
    const host = renderToolbar(() => {}, { rightPanelAvailable: true, rightPanelOpen: true });
    const right = host.querySelector('.toolbar-right');
    expect(right).not.toBeNull();
    const groups = Array.from(right!.children);
    const lastGroup = groups[groups.length - 1] as HTMLElement;
    expect(lastGroup.classList.contains('toolbar-panel-actions')).toBe(true);
    expect(lastGroup.querySelector('button')?.getAttribute('aria-label')).toBe('折叠右栏');
    // view 组里不应再有折叠按钮,避免出现两个入口。
    expect(host.querySelector('.toolbar-view-actions')?.querySelector('[aria-label="折叠右栏"]')).toBeNull();
  });

  it('无右栏时常驻并显示「打开右栏」', () => {
    const host = renderToolbar(() => {}, { rightPanelAvailable: true, rightPanelOpen: false });
    const toggle = host.querySelector<HTMLButtonElement>('.toolbar-panel-actions button');
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute('aria-label')).toBe('打开右栏');
    expect(toggle?.getAttribute('aria-pressed')).toBe('true');
  });

  it('折叠态显示「展开右栏」并回传 onToggleRightPanel', () => {
    const onToggleRightPanel = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);
    hosts.push(host);
    act(() => {
      root.render(
        <Toolbar
          editorMode="wysiwyg"
          workspacePanelVisible={false}
          wordPreviewVisible={false}
          wechatPreviewVisible={false}
          rightPanelAvailable
          rightPanelOpen
          rightPanelCollapsed
          terminalVisible={false}
          editingDisabled={false}
          docMode="read"
          onToggleEditorMode={() => {}}
          onFormat={() => {}}
          onToggleWorkspacePanel={() => {}}
          onToggleWordPreview={() => {}}
          onToggleWechatPreview={() => {}}
          onToggleRightPanel={onToggleRightPanel}
          onToggleTerminal={() => {}}
          onSetDocMode={() => {}}
          onNew={() => {}}
          onOpen={() => {}}
          onSave={() => {}}
          onSaveAs={() => {}}
          onOpenSettings={() => {}}
        />,
      );
    });
    const toggle = host.querySelector<HTMLButtonElement>('.toolbar-panel-actions button');
    expect(toggle?.getAttribute('aria-label')).toBe('展开右栏');
    act(() => { toggle!.click(); });
    expect(onToggleRightPanel).toHaveBeenCalledTimes(1);
  });
});
