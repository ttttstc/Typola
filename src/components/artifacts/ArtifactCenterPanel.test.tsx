// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArtifactCenterPanel } from './ArtifactCenterPanel';
import type { ArtifactManifest, ArtifactRecord } from '../../services/artifacts/types';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function makeRecord(kind: ArtifactManifest['kind'], primaryFile: string): ArtifactRecord {
  return {
    manifest: {
      id: `${primaryFile}#${kind}`,
      title: primaryFile.split(/[\\/]/).pop() ?? primaryFile,
      kind,
      status: 'done',
      primaryFile,
      createdAt: '2026-07-05T00:00:00.000Z',
      updatedAt: '2026-07-05T00:00:00.000Z',
      source: { type: 'flow_generation' },
    },
    legacy: true,
  };
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

describe('ArtifactCenterPanel (Issue #156: HTML preview entry)', () => {
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
    records: ArtifactRecord[];
    onOpen?: (path: string) => void;
    onOpenExternal?: (path: string) => void;
    onRevealInFolder?: (path: string) => void;
    onPreviewHtml?: (path: string) => void;
    onOpenSource?: (path: string) => void;
  }) {
    act(() => {
      root.render(
        <ArtifactCenterPanel
          records={props.records}
          onOpen={props.onOpen ?? vi.fn()}
          onCompare={vi.fn()}
          onArchive={vi.fn()}
          onDelete={vi.fn()}
          onOverwrite={vi.fn()}
          onUndoOverwrite={vi.fn()}
          onRefresh={vi.fn()}
          onClose={vi.fn()}
          onOpenExternal={props.onOpenExternal}
          onRevealInFolder={props.onRevealInFolder}
          onPreviewHtml={props.onPreviewHtml}
          onOpenSource={props.onOpenSource}
        />,
      );
    });
  }

  it('uses HTML preview as the default primary action and exposes a 源码 button for source editing', async () => {
    const onPreviewHtml = vi.fn();
    const onOpen = vi.fn();
    const htmlPath = 'C:/work/.typola-output/ai-workbench/case.html';
    const mdPath = 'C:/work/.typola-output/ai-workbench/outline.md';

    render({
      records: [makeRecord('html', htmlPath), makeRecord('markdown', mdPath)],
      onOpen,
      onPreviewHtml,
    });

    const htmlCard = host.querySelectorAll<HTMLLIElement>('.artifact-center-card')[0];
    const mdCard = host.querySelectorAll<HTMLLIElement>('.artifact-center-card')[1];

    const htmlTitleButton = htmlCard.querySelector<HTMLButtonElement>('.artifact-center-card-title button');
    expect(htmlTitleButton).toBeDefined();

    act(() => {
      htmlTitleButton!.click();
    });
    expect(onPreviewHtml).toHaveBeenCalledWith(htmlPath);

    const htmlActions = Array.from(htmlCard.querySelectorAll<HTMLButtonElement>('.artifact-center-card-actions button'));
    const htmlPreview = htmlActions.find((button) => button.textContent?.includes('预览'));
    const htmlSource = htmlActions.find((button) => button.textContent?.includes('源码'));
    expect(htmlPreview?.classList.contains('primary')).toBe(true);
    expect(htmlSource).toBeDefined();

    const mdTitleButton = mdCard.querySelector<HTMLButtonElement>('.artifact-center-card-title button');
    expect(mdTitleButton).toBeDefined();
    const mdActions = Array.from(mdCard.querySelectorAll<HTMLButtonElement>('.artifact-center-card-actions button'));
    const mdOpen = mdActions.find((button) => button.textContent?.trim() === '打开');
    expect(mdOpen).toBeDefined();
    act(() => {
      mdTitleButton!.click();
    });
    expect(onOpen).toHaveBeenCalledWith(mdPath);
    expect(mdActions.some((button) => button.textContent?.includes('预览'))).toBe(false);
    expect(mdActions.some((button) => button.textContent?.includes('源码'))).toBe(false);
  });

  it('opens image artifacts with the system image app instead of the editor', async () => {
    const onOpen = vi.fn();
    const onOpenExternal = vi.fn();
    const imagePath = 'C:/work/.typola-output/ai-workbench/card.png';

    render({
      records: [makeRecord('asset', imagePath)],
      onOpen,
      onOpenExternal,
    });

    const titleButton = host.querySelector<HTMLButtonElement>('.artifact-center-card-title button');
    expect(titleButton).toBeDefined();

    act(() => {
      titleButton!.click();
    });

    expect(onOpenExternal).toHaveBeenCalledWith(imagePath);
    expect(onOpen).not.toHaveBeenCalled();

    const openButton = Array.from(host.querySelectorAll<HTMLButtonElement>('.artifact-center-card-actions button'))
      .find((button) => button.textContent?.trim() === '打开');
    expect(openButton?.classList.contains('primary')).toBe(true);
  });

  it('offers a reveal-in-folder action for artifacts', async () => {
    const onRevealInFolder = vi.fn();
    const mdPath = 'C:/work/.typola-output/ai-workbench/outline.md';

    render({
      records: [makeRecord('markdown', mdPath)],
      onRevealInFolder,
    });

    const revealButton = Array.from(host.querySelectorAll<HTMLButtonElement>('.artifact-center-card-actions button'))
      .find((button) => button.textContent?.includes('所在文件夹'));
    expect(revealButton).toBeDefined();

    act(() => {
      revealButton!.click();
    });

    expect(onRevealInFolder).toHaveBeenCalledWith(mdPath);
  });

  it('falls back to onOpen for HTML when onPreviewHtml is not provided', async () => {
    const htmlPath = 'C:/work/.typola-output/ai-workbench/case.html';

    render({
      records: [makeRecord('html', htmlPath)],
    });
    await act(async () => { await flushPromises(); });

    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>('.artifact-center-card-actions button'));
    expect(buttons.some((button) => button.textContent?.includes('预览'))).toBe(false);
    expect(buttons.some((button) => button.textContent?.includes('打开'))).toBe(true);
  });

  it('does not show the preview button for non-HTML artifacts', async () => {
    const onPreviewHtml = vi.fn();
    const mdPath = 'C:/work/.typola-output/ai-workbench/outline.md';

    render({
      records: [makeRecord('markdown', mdPath)],
      onPreviewHtml,
    });
    await act(async () => { await flushPromises(); });

    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>('.artifact-center-card-actions button'));
    expect(buttons.some((button) => button.textContent?.includes('预览'))).toBe(false);
    expect(buttons.some((button) => button.textContent?.includes('源码'))).toBe(false);
  });

  it('源码 按钮在 HTML 上调用 onOpenSource,fallback 到 onOpen', async () => {
    const onOpen = vi.fn();
    const onOpenSource = vi.fn();
    const htmlPath = 'C:/work/.typola-output/ai-workbench/case.html';

    render({
      records: [makeRecord('html', htmlPath)],
      onOpen,
      onOpenSource,
    });

    const sourceButton = Array.from(host.querySelectorAll<HTMLButtonElement>('.artifact-center-card-actions button'))
      .find((button) => button.textContent?.includes('源码'));
    expect(sourceButton).toBeDefined();
    expect(sourceButton?.title).toContain('源码');

    act(() => {
      sourceButton!.click();
    });

    expect(onOpenSource).toHaveBeenCalledWith(htmlPath);
    expect(onOpen).not.toHaveBeenCalled();

    // Fallback: without onOpenSource, 源码 退化到 onOpen。
    act(() => root.unmount());
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    const fallbackOnOpen = vi.fn();
    render({
      records: [makeRecord('html', htmlPath)],
      onOpen: fallbackOnOpen,
    });

    const fallbackSource = Array.from(host.querySelectorAll<HTMLButtonElement>('.artifact-center-card-actions button'))
      .find((button) => button.textContent?.includes('源码'));
    expect(fallbackSource?.title).toContain('主编辑器打开');
    act(() => {
      fallbackSource!.click();
    });
    expect(fallbackOnOpen).toHaveBeenCalledWith(htmlPath);
  });
});
