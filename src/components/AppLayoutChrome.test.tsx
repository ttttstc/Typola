// @vitest-environment jsdom
import React, { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppLayoutChrome } from './AppLayoutChrome';
import type { OpenFileTab } from '../hooks/useFileTabs';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('./Toolbar', () => ({ Toolbar: () => null }));

function tab(id: string): OpenFileTab {
  return {
    id,
    file: {
      path: `D:/docs/${id}.md`,
      name: `${id}.md`,
      content: '',
      lastSavedContent: '',
      dirty: false,
      fileType: 'markdown',
    },
  };
}

function makeProps(overrides: Partial<Parameters<typeof AppLayoutChrome>[0]> = {}) {
  return {
    appStyle: {},
    toolbarProps: {} as never,
    mainContentRef: createRef<HTMLDivElement>(),
    mainContentClassName: 'main-content',
    rightPanelWidth: 420,
    leftRailMode: 'none' as const,
    workspacePanelWidth: 300,
    leftResizing: 'none' as const,
    onToggleWorkspacePanel: vi.fn(),
    onToggleAiPanel: vi.fn(),
    conversationPanelProps: {} as never,
    fileTreeProps: {} as never,
    onLeftPanelResize: vi.fn(),
    showToc: false,
    tocProps: {} as never,
    externalChangeConflict: null,
    onViewDiff: vi.fn(),
    onAcceptExternal: vi.fn(),
    onKeepMine: vi.fn(),
    shouldShowTabbar: true,
    openTabs: [tab('first'), tab('second'), tab('third')],
    activeTabId: 'third',
    renameTitle: '重命名',
    renameTitleUnsaved: '未保存文档',
    onSwitchTab: vi.fn(),
    onRequestRename: vi.fn(),
    onCloseTab: vi.fn(),
    isDocx: false,
    editorPane: <div />,
    docxPane: <div />,
    rightPanelMode: 'none' as const,
    resizing: false,
    rightPanelResizeLabel: '',
    rightPanelResizeTitle: '',
    onRightPanelResize: vi.fn(),
    onResetRightPanelWidth: vi.fn(),
    rightPanel: <div />,
    onSetRightPanelMode: vi.fn(),
    terminalNode: null,
    statusBarNode: null,
    ...overrides,
  };
}

describe('AppLayoutChrome editor tab indicator', () => {
  let host: HTMLDivElement;
  let root: Root;
  let rectMock: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    rectMock = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function rect() {
      if (this.classList.contains('editor-tabbar')) return new DOMRect(0, 0, 600, 44);
      if (this.classList.contains('editor-tab')) {
        const tabs = Array.from(this.parentElement?.querySelectorAll('.editor-tab') ?? []);
        return new DOMRect(12 + tabs.indexOf(this) * 124, 6, 118, 32);
      }
      return new DOMRect();
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    rectMock.mockRestore();
    vi.unstubAllGlobals();
  });

  it('moves the active indicator after closing a tab before it', () => {
    const props = makeProps();
    act(() => root.render(<AppLayoutChrome {...props} />));
    expect(host.querySelector<HTMLElement>('.editor-tab-indicator')?.style.transform).toBe('translateX(260px)');

    act(() => root.render(<AppLayoutChrome {...props} openTabs={[tab('second'), tab('third')]} />));

    expect(host.querySelector<HTMLElement>('.editor-tab-indicator')?.style.transform).toBe('translateX(136px)');
  });

  it('激活标签与未保存圆点可同时标识（issue #264）', () => {
    const dirtyActive = tab('unsaved');
    dirtyActive.file.dirty = true;
    const cleanInactive = tab('clean');

    act(() => root.render(
      <AppLayoutChrome
        {...makeProps({ openTabs: [dirtyActive, cleanInactive], activeTabId: 'unsaved' })}
      />,
    ));

    const tabs = host.querySelectorAll<HTMLElement>('.editor-tab');
    expect(tabs).toHaveLength(2);

    // 激活 + 未保存共存:active 类、下划线标识类与圆点同时存在。
    expect(tabs[0].classList.contains('active')).toBe(true);
    expect(tabs[0].classList.contains('is-dirty')).toBe(true);
    expect(tabs[0].querySelector('.editor-tab-dirty-dot')).not.toBeNull();
    // 星号前缀退役,避免与激活态混淆。
    expect(tabs[0].textContent).not.toContain('*unsaved.md');

    // 未激活但干净:既无 dirty 类也无圆点,保持弱化可读。
    expect(tabs[1].classList.contains('active')).toBe(false);
    expect(tabs[1].classList.contains('is-dirty')).toBe(false);
    expect(tabs[1].querySelector('.editor-tab-dirty-dot')).toBeNull();
  });
});
