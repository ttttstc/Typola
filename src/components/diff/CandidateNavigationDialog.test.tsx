// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CandidateNavigationDialog } from './CandidateNavigationDialog';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('CandidateNavigationDialog', () => {
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

  it('切换文档前提供应用、另存、放弃和取消四种选择', async () => {
    const onChoice = vi.fn();
    await act(async () => root.render(<CandidateNavigationDialog open onChoice={onChoice} />));
    const labels = Array.from(host.querySelectorAll('button')).map((button) => button.textContent);
    expect(labels).toEqual(['放弃候选稿', '取消切换', '另存为新文档', '应用后切换']);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onChoice).toHaveBeenCalledWith('cancel');
  });
});
