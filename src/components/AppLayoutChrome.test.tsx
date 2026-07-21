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
    const props = {
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
    };

    act(() => root.render(<AppLayoutChrome {...props} />));
    expect(host.querySelector<HTMLElement>('.editor-tab-indicator')?.style.transform).toBe('translateX(260px)');

    act(() => root.render(<AppLayoutChrome {...props} openTabs={[tab('second'), tab('third')]} />));

    expect(host.querySelector<HTMLElement>('.editor-tab-indicator')?.style.transform).toBe('translateX(136px)');
  });
});
