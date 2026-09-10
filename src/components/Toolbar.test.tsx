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

function renderToolbar(onFormat: (action: FormatAction) => void): HTMLDivElement {
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
        rightPanelAvailable={false}
        rightPanelCollapsed={false}
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

  it('renders the extended format group with localized tooltips', () => {
    const host = renderToolbar(() => {});
    const group = host.querySelector('.toolbar-format-actions');
    expect(group).not.toBeNull();
    const buttons = Array.from(group!.querySelectorAll('button'));
    expect(buttons).toHaveLength(13);
    const tooltips = buttons.map((button) => button.dataset.tooltip);
    expect(tooltips).toEqual([
      '加粗 (Ctrl+B)',
      '斜体 (Ctrl+I)',
      '删除线',
      '高亮',
      '链接 (Ctrl+K)',
      '代码块 (Ctrl+Shift+K)',
      '公式块 (Ctrl+Shift+M)',
      '引用块',
      '无序列表',
      '有序列表',
      '任务列表',
      '分隔线',
      '格式刷',
    ]);
  });

  it.each([
    ['代码块 (Ctrl+Shift+K)', { type: 'codeblock' }],
    ['公式块 (Ctrl+Shift+M)', { type: 'math-block' }],
    ['删除线', { type: 'strike' }],
    ['高亮', { type: 'highlight' }],
    ['分隔线', { type: 'hr' }],
    ['链接 (Ctrl+K)', { type: 'link' }],
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
