// @vitest-environment jsdom
import React, { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDiffReview, type DiffReviewController } from '../../hooks/useDiffReview';
import { DiffReviewPane, type DiffFeedbackRequest } from './DiffReviewPane';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Harness({
  onFeedback,
  onRecheck,
  onController,
}: {
  onFeedback: (request: DiffFeedbackRequest) => Promise<void>;
  onRecheck: () => Promise<void>;
  onController?: (controller: DiffReviewController) => void;
}) {
  const controller = useDiffReview();
  onController?.(controller);
  useEffect(() => {
    controller.open({
      source: 'review',
      documentPath: 'a.md',
      originalContent: '# 标题\n\n旧段',
      proposedContent: '# 标题\n\n新段',
      selfCheckStatus: 'fresh',
    });
  }, []);
  return <DiffReviewPane controller={controller} onFeedback={onFeedback} onRecheck={onRecheck} />;
}

function setTextareaValue(element: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('DiffReviewPane 双栏候选稿', () => {
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

  it('左侧基线只读,右侧候选可编辑且编辑后自检过期', async () => {
    await act(async () => root.render(
      <Harness onFeedback={async () => {}} onRecheck={async () => {}} />,
    ));

    expect(host.querySelector('[aria-label="修改前原文"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="候选稿"]')).not.toBeNull();
    expect(host.textContent).toContain('旧段');

    const candidate = Array.from(host.querySelectorAll<HTMLTextAreaElement>('[data-candidate-hunk]'))
      .find((textarea) => textarea.value === '新段');
    expect(candidate).not.toBeNull();
    await act(async () => {
      setTextareaValue(candidate!, '新段（手改）');
    });

    expect(host.textContent).toContain('自检已过期');
    expect(host.textContent).toContain('旧段');
  });

  it('反馈在候选页提交并明确作用范围', async () => {
    const onFeedback = vi.fn(async (_request: DiffFeedbackRequest) => {});
    await act(async () => root.render(
      <Harness onFeedback={onFeedback} onRecheck={async () => {}} />,
    ));

    const feedback = host.querySelector<HTMLTextAreaElement>('[aria-label="改稿反馈"]');
    const scope = host.querySelector<HTMLSelectElement>('[aria-label="反馈范围"]');
    await act(async () => {
      setTextareaValue(feedback!, '结论再明确一点');
      scope!.value = 'all-candidate';
      scope!.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const submit = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('继续修改'));
    await act(async () => submit!.click());

    expect(onFeedback).toHaveBeenCalledWith(expect.objectContaining({
      text: '结论再明确一点',
      scope: 'all-candidate',
      candidateContent: '# 标题\n\n新段',
    }));
  });

  it('手动编辑后只在用户点击时重新检视', async () => {
    const onRecheck = vi.fn(async () => {});
    await act(async () => root.render(
      <Harness onFeedback={async () => {}} onRecheck={onRecheck} />,
    ));
    const candidate = Array.from(host.querySelectorAll<HTMLTextAreaElement>('[data-candidate-hunk]'))
      .find((textarea) => textarea.value === '新段');
    await act(async () => {
      setTextareaValue(candidate!, '手动调整');
    });
    expect(onRecheck).not.toHaveBeenCalled();

    const recheck = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('重新检视'));
    await act(async () => recheck!.click());
    expect(onRecheck).toHaveBeenCalledOnce();
  });

  it('源文档变化时展示两种显式处理，不允许静默应用', async () => {
    let controller!: DiffReviewController;
    await act(async () => root.render(
      <Harness
        onFeedback={async () => {}}
        onRecheck={async () => {}}
        onController={(value) => { controller = value; }}
      />,
    ));
    await act(async () => controller.markBaselineStale('外部更新后的原文'));

    expect(host.textContent).toContain('源文档已在候选稿生成后发生变化');
    expect(host.textContent).toContain('以最新文档重新开始');
    expect(host.textContent).toContain('保留候选稿并重新对比');
    const applyButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('应用'));
    expect(applyButton?.disabled).toBe(true);
  });
});
