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
    onPreviewHtml?: (path: string) => void;
  }) {
    act(() => {
      root.render(
        <ArtifactCenterPanel
          records={props.records}
          onOpen={vi.fn()}
          onCompare={vi.fn()}
          onArchive={vi.fn()}
          onDelete={vi.fn()}
          onOverwrite={vi.fn()}
          onUndoOverwrite={vi.fn()}
          onRefresh={vi.fn()}
          onClose={vi.fn()}
          onPreviewHtml={props.onPreviewHtml}
        />,
      );
    });
  }

  it('shows the preview button only for HTML artifacts and routes to onPreviewHtml', async () => {
    const onPreviewHtml = vi.fn();
    const htmlPath = 'C:/work/.typola-output/ai-workbench/case.html';
    const mdPath = 'C:/work/.typola-output/ai-workbench/outline.md';

    render({
      records: [makeRecord('html', htmlPath), makeRecord('markdown', mdPath)],
      onPreviewHtml,
    });
    await act(async () => { await flushPromises(); });

    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>('.artifact-center-card-actions button'));
    const previewButton = buttons.find((button) => button.textContent?.includes('预览'));
    expect(previewButton).toBeDefined();

    act(() => {
      previewButton!.click();
    });

    expect(onPreviewHtml).toHaveBeenCalledWith(htmlPath);
  });

  it('does not show the preview button when onPreviewHtml is not provided', async () => {
    const htmlPath = 'C:/work/.typola-output/ai-workbench/case.html';

    render({
      records: [makeRecord('html', htmlPath)],
    });
    await act(async () => { await flushPromises(); });

    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>('.artifact-center-card-actions button'));
    expect(buttons.some((button) => button.textContent?.includes('预览'))).toBe(false);
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
  });
});