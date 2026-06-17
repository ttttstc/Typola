// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// P1-F:md 产物改走 PreviewPane(Vditor 渲染),而非裸 <pre>。
// 渲染管线本身在 PreviewPane 内部有自身测试覆盖,ArtifactPreview 这一层只验:
//   1) md 不再渲染 .artifact-markdown <pre> 源码
//   2) md 渲染时调用 PreviewPane,且传入 source = 文件内容、filePath = artifact 路径
const previewPaneMock = vi.fn();
vi.mock('./PreviewPane', () => ({
  // 用 forwardRef 风格不可行,这里直接用普通函数组件占位
  PreviewPane: (props: { source: string; filePath?: string }) => {
    previewPaneMock(props);
    return <div className="preview-shell-mock" data-file-path={props.filePath}>{props.source}</div>;
  },
}));

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (cmd: string, args: unknown) => invokeMock(cmd, args),
}));

import { ArtifactPreview, type ArtifactItem } from './ArtifactPreview';

function flushPromises(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function utf8Bytes(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

const MD_PATH = 'C:/work/outline.md';
const HTML_PATH = 'C:/work/deck.html';
const TEXT_PATH = 'C:/work/notes.txt';

const MD_CONTENT = '# 标题\n\n这是 **加粗** 与 `代码`。\n\n- 列表项 A\n- 列表项 B';
const HTML_CONTENT = '<!doctype html><html><body><h1>Demo</h1></body></html>';
const TEXT_CONTENT = 'plain text body';

function makeArtifact(path: string, kind: ArtifactItem['kind']): ArtifactItem {
  return { path, name: path.split(/[\\/]/).pop() ?? path, ts: 1, kind };
}

describe('ArtifactPreview (P1-F markdown 产物渲染)', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    previewPaneMock.mockReset();
    invokeMock.mockReset();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.clearAllTimers();
  });

  function render(props: { artifacts: ArtifactItem[]; onOpenFile?: (p: string) => void }) {
    act(() => {
      root.render(
        <ArtifactPreview
          artifacts={props.artifacts}
          {...(props.onOpenFile ? { onOpenFile: props.onOpenFile } : {})}
        />,
      );
    });
  }

  it('md 产物走 PreviewPane,不再用 .artifact-markdown 源码 <pre>', async () => {
    invokeMock.mockResolvedValueOnce(utf8Bytes(MD_CONTENT));
    render({ artifacts: [makeArtifact(MD_PATH, 'markdown')] });

    // 切到 md 后 invoke 读文件
    await act(async () => { await flushPromises(); });
    expect(invokeMock).toHaveBeenCalledWith('read_opened_document', { path: MD_PATH });

    // 等 setContent 完成 + PreviewPane 渲染
    await act(async () => { await flushPromises(); });

    // 旧 .artifact-markdown 源码 <pre> 应该消失
    expect(host.querySelector('pre.artifact-markdown')).toBeNull();
    // 改走 PreviewPane(在 mock 里渲染为 .preview-shell-mock)
    expect(host.querySelector('.preview-shell-mock')).not.toBeNull();
    // PreviewPane 收到的 source 必须是文件内容,filePath 必须是 artifact 路径
    expect(previewPaneMock).toHaveBeenCalled();
    const lastCall = previewPaneMock.mock.calls.at(-1)?.[0];
    expect(lastCall?.source).toBe(MD_CONTENT);
    expect(lastCall?.filePath).toBe(MD_PATH);
  });

  it('html 产物继续走 iframe(不被 md 改动影响)', async () => {
    invokeMock.mockResolvedValueOnce(utf8Bytes(HTML_CONTENT));
    render({ artifacts: [makeArtifact(HTML_PATH, 'html')] });
    await act(async () => { await flushPromises(); });
    await act(async () => { await flushPromises(); });

    const iframe = host.querySelector<HTMLIFrameElement>('iframe.artifact-iframe');
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('srcdoc')).toBe(HTML_CONTENT);
    // 没有走 PreviewPane
    expect(previewPaneMock).not.toHaveBeenCalled();
  });

  it('text 产物继续走 <pre>(不被 md 改动影响)', async () => {
    invokeMock.mockResolvedValueOnce(utf8Bytes(TEXT_CONTENT));
    render({ artifacts: [makeArtifact(TEXT_PATH, 'text')] });
    await act(async () => { await flushPromises(); });
    await act(async () => { await flushPromises(); });

    const pre = host.querySelector<HTMLPreElement>('pre.artifact-text');
    expect(pre).not.toBeNull();
    expect(pre?.textContent).toBe(TEXT_CONTENT);
    expect(previewPaneMock).not.toHaveBeenCalled();
  });

  it('切换 artifact 时 source + filePath 都跟着变', async () => {
    invokeMock.mockResolvedValueOnce(utf8Bytes(MD_CONTENT));
    const items: ArtifactItem[] = [
      makeArtifact(MD_PATH, 'markdown'),
      makeArtifact('C:/work/other.md', 'markdown'),
    ];
    render({ artifacts: items });
    await act(async () => { await flushPromises(); });
    await act(async () => { await flushPromises(); });

    // 切到第二个
    invokeMock.mockResolvedValueOnce(utf8Bytes('## 第二份\n\n其他内容'));
    await act(async () => {
      const chips = host.querySelectorAll<HTMLButtonElement>('.artifact-chip');
      chips[1]?.click();
      await flushPromises();
      await flushPromises();
    });

    const lastCall = previewPaneMock.mock.calls.at(-1)?.[0];
    expect(lastCall?.source).toBe('## 第二份\n\n其他内容');
    expect(lastCall?.filePath).toBe('C:/work/other.md');
  });
});
