// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HtmlPreviewPane } from './HtmlPreviewPane';

vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn(async () => '<h1>Hello Preview</h1>'),
  readFile: vi.fn(async () => new Uint8Array()),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  openPath: vi.fn(async () => undefined),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => undefined),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function flushPromises(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

function queryButton(host: HTMLElement, label: string): HTMLButtonElement {
  const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!button) throw new Error(`missing button: ${label}`);
  return button;
}

describe('HtmlPreviewPane (Issue #156)', () => {
  let host: HTMLDivElement;
  let root: Root;
  // 让组件内 "__TAURI_INTERNALS__ in window" 走真实 Tauri 路径,触发 plugin-fs 读取。
  let originalInternals: PropertyDescriptor | undefined;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    originalInternals = Object.getOwnPropertyDescriptor(window, '__TAURI_INTERNALS__');
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {},
      configurable: true,
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    if (originalInternals) {
      Object.defineProperty(window, '__TAURI_INTERNALS__', originalInternals);
    } else {
      // @ts-expect-error cleanup when property didn't exist
      delete window.__TAURI_INTERNALS__;
    }
    vi.clearAllMocks();
  });

  it('reads the HTML file and renders it inside a sandboxed iframe with the right toolbar', async () => {
    const onBackToArtifacts = vi.fn();
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        <HtmlPreviewPane
          filePath="/Users/demo/decks/case.html"
          fileName="case.html"
          onBackToArtifacts={onBackToArtifacts}
          onClose={onClose}
        />,
      );
      await flushPromises();
      await flushPromises();
      await flushPromises();
    });

    expect(host.textContent).toContain('HTML 预览');
    expect(host.textContent).toContain('case.html');

    const iframe = host.querySelector<HTMLIFrameElement>('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('sandbox')).toContain('allow-scripts');
    expect(iframe?.getAttribute('sandbox')).not.toContain('allow-same-origin');
    expect(iframe?.srcdoc).toContain('<h1>Hello Preview</h1>');
    expect(iframe?.srcdoc).toContain('<base href="file:///Users/demo/decks/">');
    expect(iframe?.title).toBe('HTML 预览:case.html');
  });

  it('returns to artifact center when the back button is clicked', async () => {
    const onBackToArtifacts = vi.fn();
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        <HtmlPreviewPane
          filePath="/tmp/x.html"
          onBackToArtifacts={onBackToArtifacts}
          onClose={onClose}
        />,
      );
      await flushPromises();
    });

    await act(async () => {
      queryButton(host, '返回产物中心').click();
    });

    expect(onBackToArtifacts).toHaveBeenCalledTimes(1);
  });

  it('opens the file with the system default app when the browser button is clicked', async () => {
    const onBackToArtifacts = vi.fn();
    const onClose = vi.fn();
    const opener = await import('@tauri-apps/plugin-opener');

    await act(async () => {
      root.render(
        <HtmlPreviewPane
          filePath="/tmp/x.html"
          onBackToArtifacts={onBackToArtifacts}
          onClose={onClose}
        />,
      );
      await flushPromises();
    });

    await act(async () => {
      queryButton(host, '在浏览器打开').click();
      await flushPromises();
    });

    expect(opener.openPath).toHaveBeenCalledWith('/tmp/x.html');
  });

  it('clears the preview when the close button is clicked', async () => {
    const onBackToArtifacts = vi.fn();
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        <HtmlPreviewPane
          filePath="/tmp/x.html"
          onBackToArtifacts={onBackToArtifacts}
          onClose={onClose}
        />,
      );
      await flushPromises();
    });

    await act(async () => {
      queryButton(host, '关闭预览').click();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('re-reads the file and rebuilds the iframe when the refresh button is clicked', async () => {
    const fs = await import('@tauri-apps/plugin-fs');
    const readTextFile = fs.readTextFile as ReturnType<typeof vi.fn>;

    await act(async () => {
      root.render(
        <HtmlPreviewPane
          filePath="/tmp/x.html"
          onBackToArtifacts={vi.fn()}
          onClose={vi.fn()}
        />,
      );
      await flushPromises();
      await flushPromises();
      await flushPromises();
    });

    const initialCallCount = readTextFile.mock.calls.length;

    await act(async () => {
      queryButton(host, '刷新').click();
      await flushPromises();
      await flushPromises();
      await flushPromises();
    });

    expect(readTextFile.mock.calls.length).toBeGreaterThan(initialCallCount);
  });

  it('surfaces an empty state when the file content is blank', async () => {
    const fs = await import('@tauri-apps/plugin-fs');
    (fs.readTextFile as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => '   \n  ');

    await act(async () => {
      root.render(
        <HtmlPreviewPane
          filePath="/tmp/empty.html"
          onBackToArtifacts={vi.fn()}
          onClose={vi.fn()}
        />,
      );
      await flushPromises();
      await flushPromises();
    });

    expect(host.querySelector('iframe')).toBeNull();
    expect(host.textContent).toContain('HTML 内容为空');
  });

  it('falls back to the error state with the browser-open option when reading fails', async () => {
    const fs = await import('@tauri-apps/plugin-fs');
    (fs.readTextFile as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      throw new Error('disk gone');
    });

    await act(async () => {
      root.render(
        <HtmlPreviewPane
          filePath="/tmp/missing.html"
          onBackToArtifacts={vi.fn()}
          onClose={vi.fn()}
        />,
      );
      await flushPromises();
      await flushPromises();
    });

    expect(host.querySelector('iframe')).toBeNull();
    expect(host.textContent).toContain('预览失败');
    expect(host.querySelector<HTMLElement>('.html-preview-status-error')).not.toBeNull();
  });
});