// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArtifactPreview, type ArtifactItem } from './ArtifactPreview';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MD_PATH = 'C:/work/.typola-output/ai-workbench/outline.md';
const HTML_PATH = 'C:/work/.typola-output/ai-workbench/deck.html';

function makeArtifact(path: string, kind: ArtifactItem['kind'], ts = 1): ArtifactItem {
  return { path, name: path.split(/[\\/]/).pop() ?? path, ts, kind };
}

describe('ArtifactPreview (M2 产物 chips)', () => {
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
  });

  function render(props: {
    artifacts: ArtifactItem[];
    onOpenFile?: (path: string) => void;
    onArchiveFile?: (path: string) => void;
    onInsertFile?: (path: string) => void;
    onCopyPath?: (path: string) => void;
    onClose?: () => void;
  }) {
    act(() => {
      root.render(
        <ArtifactPreview
          artifacts={props.artifacts}
          onOpenFile={props.onOpenFile ?? vi.fn()}
          onArchiveFile={props.onArchiveFile}
          onInsertFile={props.onInsertFile}
          onCopyPath={props.onCopyPath}
          onClose={props.onClose}
        />,
      );
    });
  }

  it('只渲染文件 chips,不在右栏预览正文', () => {
    render({ artifacts: [makeArtifact(MD_PATH, 'markdown'), makeArtifact(HTML_PATH, 'html')] });

    expect(host.querySelector('.artifact-preview')).not.toBeNull();
    expect(host.querySelectorAll('.artifact-chip')).toHaveLength(2);
    expect(host.textContent).toContain('outline.md');
    expect(host.textContent).toContain('deck.html');
    expect(host.querySelector('iframe')).toBeNull();
    expect(host.querySelector('pre')).toBeNull();
    expect(host.querySelector('.preview-shell')).toBeNull();
  });

  it('点击 chip 在主编辑器打开对应文件', () => {
    const onOpenFile = vi.fn();
    render({ artifacts: [makeArtifact(MD_PATH, 'markdown')], onOpenFile });

    act(() => {
      host.querySelector<HTMLButtonElement>('.artifact-chip')?.click();
    });

    expect(onOpenFile).toHaveBeenCalledWith(MD_PATH);
  });

  it('归档按钮把暂存产物交给上层保存到工作区', () => {
    const onArchiveFile = vi.fn();
    render({ artifacts: [makeArtifact(HTML_PATH, 'html')], onArchiveFile });

    act(() => {
      host.querySelector<HTMLButtonElement>('.artifact-archive')?.click();
    });

    expect(onArchiveFile).toHaveBeenCalledWith(HTML_PATH);
  });

  it('Markdown 产物可插入当前编辑器并复制路径', () => {
    const onInsertFile = vi.fn();
    const onCopyPath = vi.fn();
    render({ artifacts: [makeArtifact(MD_PATH, 'markdown')], onInsertFile, onCopyPath });

    act(() => {
      host.querySelector<HTMLButtonElement>('.artifact-insert')?.click();
      host.querySelector<HTMLButtonElement>('.artifact-copy')?.click();
    });

    expect(onInsertFile).toHaveBeenCalledWith(MD_PATH);
    expect(onCopyPath).toHaveBeenCalledWith(MD_PATH);
  });

  it('关闭按钮交给上层清空本次产物', () => {
    const onClose = vi.fn();
    render({ artifacts: [makeArtifact(MD_PATH, 'markdown')], onClose });

    act(() => {
      host.querySelector<HTMLButtonElement>('.artifact-clear')?.click();
    });

    expect(onClose).toHaveBeenCalled();
  });

  it('空产物不渲染浮窗', () => {
    render({ artifacts: [] });

    expect(host.querySelector('.artifact-preview')).toBeNull();
  });
});
