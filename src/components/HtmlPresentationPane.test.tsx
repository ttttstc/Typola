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

  it('renders an isolated sandbox iframe from the HTML source and supports toolbar actions', async () => {
    const onBack = vi.fn();

    await act(async () => {
      root.render(
        <HtmlPresentationPane
          source="<h1>Slide 1</h1>"
          filePath="/Users/demo/deck/index.html"
          onBack={onBack}
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

    const postMessage = vi.spyOn(iframe!.contentWindow!, 'postMessage').mockImplementation(() => undefined);

    await act(async () => {
      queryButton(host, '下一页').click();
      queryButton(host, '上一页').click();
      queryButton(host, '返回阅读预览').click();
      await flushPromises();
    });

    expect(postMessage).toHaveBeenNthCalledWith(
      1,
      { source: 'typola-html-presentation', command: 'next' },
      '*',
    );
    expect(postMessage).toHaveBeenNthCalledWith(
      2,
      { source: 'typola-html-presentation', command: 'previous' },
      '*',
    );
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
