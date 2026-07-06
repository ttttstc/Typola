// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HtmlPresentationPane } from './HtmlPresentationPane';

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

describe('HtmlPresentationPane', () => {
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
    vi.clearAllMocks();
  });

  it('默认进 iframe 预览,toolbar 提供 源码/预览 切换 + 浏览器', async () => {
    const onOpenInBrowser = vi.fn();

    await act(async () => {
      root.render(
        <HtmlPresentationPane
          source="<h1>Slide 1</h1>"
          filePath="/Users/demo/deck/index.html"
          onOpenInBrowser={onOpenInBrowser}
        />,
      );
      await flushPromises();
    });

    expect(host.textContent).toContain('HTML 演示模式');
    const iframe = host.querySelector<HTMLIFrameElement>('iframe[title="HTML 演示预览"]');
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('sandbox')).toContain('allow-scripts');
    expect(iframe?.getAttribute('sandbox')).not.toContain('allow-same-origin');
    expect(iframe?.srcdoc).toContain('<h1>Slide 1</h1>');
    expect(iframe?.srcdoc).toContain('<base href="file:///Users/demo/deck/">');
    // 旧版的 上一页/下一页 已被替换为 源码/预览 切换。
    expect(host.querySelector('button[aria-label="上一页"]')).toBeNull();
    expect(host.querySelector('button[aria-label="下一页"]')).toBeNull();

    await act(async () => {
      queryButton(host, '在浏览器打开').click();
      await flushPromises();
    });

    expect(onOpenInBrowser).toHaveBeenCalledTimes(1);
  });

  it('切换到源码模式后渲染 <pre> 显示原始 HTML,不再有 iframe', async () => {
    await act(async () => {
      root.render(
        <HtmlPresentationPane
          source="<h1>Slide 1</h1><p>hello</p>"
          filePath="/Users/demo/deck/index.html"
        />,
      );
      await flushPromises();
    });

    const sourceTab = host.querySelector<HTMLButtonElement>('button[role="tab"][aria-selected="false"]');
    expect(sourceTab?.textContent).toContain('源码');

    await act(async () => {
      sourceTab!.click();
      await flushPromises();
    });

    expect(host.querySelector('iframe')).toBeNull();
    const pre = host.querySelector('pre');
    expect(pre?.textContent).toContain('<h1>Slide 1</h1>');
    expect(pre?.textContent).toContain('<p>hello</p>');
  });

  it('通过 initialMode="source" 直接进入源码视图', async () => {
    await act(async () => {
      root.render(
        <HtmlPresentationPane
          source="<p>raw</p>"
          initialMode="source"
        />,
      );
      await flushPromises();
    });

    expect(host.querySelector('iframe')).toBeNull();
    expect(host.querySelector('pre')?.textContent).toContain('<p>raw</p>');
  });
});
