// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDiffReview, type DiffReviewController } from './useDiffReview';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Harness({
  persistenceKey,
  onController,
  onApply,
}: {
  persistenceKey: string;
  onController: (controller: DiffReviewController) => void;
  onApply?: (merged: string) => void | Promise<void>;
}) {
  const controller = useDiffReview(onApply, persistenceKey);
  onController(controller);
  return null;
}

describe('useDiffReview 持续候选稿', () => {
  let host: HTMLDivElement;
  let root: Root;
  let controller: DiffReviewController;

  beforeEach(() => {
    localStorage.clear();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.clearAllMocks();
  });

  it('手动编辑只更新候选稿,保留基线并把自检标记为过期', async () => {
    await act(async () => root.render(
      <Harness persistenceKey="conv-1::a.md" onController={(value) => { controller = value; }} />,
    ));
    await act(async () => controller.open({
      source: 'review',
      documentPath: 'a.md',
      candidatePath: 'a.ai改1.md',
      originalContent: '原文',
      proposedContent: '候选一',
      selfCheckStatus: 'fresh',
    }));
    await act(async () => controller.updateCandidate('候选二'));

    expect(controller.state.originalContent).toBe('原文');
    expect(controller.state.proposedContent).toBe('候选二');
    expect(controller.state.selfCheckStatus).toBe('stale');
    expect(controller.state.dirty).toBe(true);
  });

  it('同一会话和文档重新挂载后恢复候选稿与 Diff 状态', async () => {
    await act(async () => root.render(
      <Harness persistenceKey="conv-1::a.md" onController={(value) => { controller = value; }} />,
    ));
    await act(async () => controller.open({
      source: 'review',
      documentPath: 'a.md',
      originalContent: '原文',
      proposedContent: '候选稿',
      selfCheckStatus: 'warning',
    }));

    await act(async () => root.unmount());
    root = createRoot(host);
    await act(async () => root.render(
      <Harness persistenceKey="conv-1::a.md" onController={(value) => { controller = value; }} />,
    ));

    expect(controller.state.isOpen).toBe(true);
    expect(controller.state.proposedContent).toBe('候选稿');
    expect(controller.state.selfCheckStatus).toBe('warning');
  });

  it('放弃候选稿并立即切换文档时不会留下旧候选稿', async () => {
    await act(async () => root.render(
      <Harness persistenceKey="conv-1::a.md" onController={(value) => { controller = value; }} />,
    ));
    await act(async () => controller.open({
      source: 'review', originalContent: '原文', proposedContent: '候选稿',
    }));
    expect(localStorage.getItem('typola.diff-review.v1:conv-1::a.md')).not.toBeNull();

    await act(async () => {
      controller.close();
      root.render(
        <Harness persistenceKey="conv-1::b.md" onController={(value) => { controller = value; }} />,
      );
    });
    expect(localStorage.getItem('typola.diff-review.v1:conv-1::a.md')).toBeNull();
  });

  it('阻断自检不能应用,警告和通过可以应用', async () => {
    const onApply = vi.fn();
    await act(async () => root.render(
      <Harness
        persistenceKey="conv-1::a.md"
        onController={(value) => { controller = value; }}
        onApply={onApply}
      />,
    ));
    await act(async () => controller.open({
      source: 'review',
      documentPath: 'a.md',
      originalContent: '原文',
      proposedContent: '候选稿',
      selfCheckStatus: 'blocked',
    }));
    await act(async () => controller.apply());
    expect(onApply).not.toHaveBeenCalled();
    expect(controller.state.isOpen).toBe(true);

    await act(async () => controller.setSelfCheckStatus('warning'));
    await act(async () => controller.apply());
    expect(onApply).toHaveBeenCalledWith('候选稿', '原文');
  });

  it('源文档变化后阻止应用，并支持重置或保留候选稿重新对比', async () => {
    const onApply = vi.fn();
    await act(async () => root.render(
      <Harness persistenceKey="conv-1::a.md" onController={(value) => { controller = value; }} onApply={onApply} />,
    ));
    await act(async () => controller.open({
      source: 'review',
      documentPath: 'a.md',
      originalContent: '原文',
      proposedContent: '候选稿',
    }));
    await act(async () => controller.markBaselineStale('外部新原文'));
    await act(async () => controller.apply());
    expect(onApply).not.toHaveBeenCalled();

    await act(async () => controller.rebaseCandidateToLatestSource());
    expect(controller.state.originalContent).toBe('外部新原文');
    expect(controller.state.proposedContent).toBe('候选稿');
    expect(controller.state.selfCheckStatus).toBe('warning');

    await act(async () => controller.markBaselineStale('更新后的原文'));
    await act(async () => controller.resetToLatestSource());
    expect(controller.state.originalContent).toBe('更新后的原文');
    expect(controller.state.proposedContent).toBe('更新后的原文');
  });

  it('源文档过期后继续编辑候选稿不会清除过期保护', async () => {
    await act(async () => root.render(
      <Harness persistenceKey="conv-1::a.md" onController={(value) => { controller = value; }} />,
    ));
    await act(async () => controller.open({
      source: 'review', originalContent: '原文', proposedContent: '候选稿',
    }));
    await act(async () => controller.markBaselineStale('外部新原文'));
    await act(async () => controller.updateCandidate('继续修改后的候选稿', 'fresh'));

    expect(controller.state.baselineStatus).toBe('stale');
    expect(controller.state.latestSourceContent).toBe('外部新原文');
  });

  it('异步历史保存完成后才关闭候选稿，失败时保留候选稿', async () => {
    let release!: () => void;
    const onApply = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    await act(async () => root.render(
      <Harness persistenceKey="conv-1::a.md" onController={(value) => { controller = value; }} onApply={onApply} />,
    ));
    await act(async () => controller.open({
      source: 'review', originalContent: '原文', proposedContent: '候选稿',
    }));
    let applying!: Promise<boolean>;
    await act(async () => { applying = controller.apply(); });
    expect(controller.state.isOpen).toBe(true);
    await act(async () => { release(); await applying; });
    expect(controller.state.isOpen).toBe(false);

    const failed = vi.fn(async () => { throw new Error('历史保存失败'); });
    await act(async () => root.render(
      <Harness persistenceKey="conv-2::a.md" onController={(value) => { controller = value; }} onApply={failed} />,
    ));
    await act(async () => controller.open({ source: 'review', originalContent: '原文', proposedContent: '候选稿' }));
    await expect(act(async () => { await controller.apply(); })).rejects.toThrow('历史保存失败');
    expect(controller.state.isOpen).toBe(true);
  });
});
