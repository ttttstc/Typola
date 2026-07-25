// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toolbar } from './Toolbar';

vi.mock('./defineColor/DefineColorToolbarButton', () => ({
  DefineColorToolbarButton: () => <button type="button" aria-label="编辑主题颜色" />,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Toolbar', () => {
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

  const renderToolbar = (overrides: Partial<Parameters<typeof Toolbar>[0]> = {}) => {
    const noop = vi.fn();
    act(() => root.render(
      <Toolbar
        editorMode="wysiwyg"
        workspacePanelVisible={false}
        wordPreviewVisible={false}
        wechatPreviewVisible={false}
        rightPanelAvailable
        rightPanelCollapsed={false}
        terminalVisible={false}
        editingDisabled={false}
        docMode="read"
        onToggleEditorMode={noop}
        onFormat={noop}
        onToggleWorkspacePanel={noop}
        onToggleWordPreview={noop}
        onToggleWechatPreview={noop}
        onToggleRightPanel={noop}
        onToggleTerminal={noop}
        onOpenToc={noop}
        onSetDocMode={noop}
        onNew={noop}
        onOpen={noop}
        onOpenFolder={noop}
        onSave={noop}
        onSaveAs={noop}
        onInsertImage={noop}
        onExportPdf={noop}
        onExportWord={noop}
        onOpenSettings={noop}
        {...overrides}
      />,
    ));
  };

  it('keeps every file and insert entry directly visible in the file group', () => {
    renderToolbar();
    const fileGroup = host.querySelector('.toolbar-file-actions');
    expect(fileGroup).not.toBeNull();
    [
      '新建文档',
      '打开文件',
      '打开文件夹',
      '保存当前文件',
      '另存为新文件',
      '插入表格',
      '插入图片',
      '导出',
    ].forEach((label) => {
      expect(fileGroup?.querySelector(`button[aria-label="${label}"]`)).not.toBeNull();
    });
  });

  it('uses a mirrored right-sidebar toggle without closing the active panel', () => {
    const onToggleRightPanel = vi.fn();
    renderToolbar({ onToggleRightPanel });
    const button = host.querySelector<HTMLButtonElement>('button[aria-label="收起右侧栏"]');
    expect(button?.disabled).toBe(false);
    expect(button?.getAttribute('aria-pressed')).toBe('true');
    expect(button?.querySelector('.toolbar-panel-right-icon')).not.toBeNull();
    act(() => button?.click());
    expect(onToggleRightPanel).toHaveBeenCalledOnce();
  });
});
