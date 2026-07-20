// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewCommentEditor } from './ReviewCommentEditor';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function setTextareaValue(element: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('ReviewCommentEditor 连续检视', () => {
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

  it('展示当前位置并支持上一条、下一条', async () => {
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    await act(async () => root.render(
      <ReviewCommentEditor
        open
        x={10}
        y={10}
        originalText="原文"
        initialText="现有意见"
        basis={{ kind: 'style', label: 'style.md' }}
        currentIndex={1}
        total={3}
        onPrevious={onPrevious}
        onNext={onNext}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    ));

    expect(host.textContent).toContain('2 / 3');
    expect(host.textContent).toContain('依据');
    expect(host.textContent).toContain('style.md');
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="上一条检视意见"]')!.click());
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="下一条检视意见"]')!.click());
    expect(onPrevious).toHaveBeenCalledOnce();
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('人工意见没有依据时明确显示为空', async () => {
    await act(async () => root.render(
      <ReviewCommentEditor
        open
        x={10}
        y={10}
        originalText="原文"
        initialText="人工意见"
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    ));

    expect(host.textContent).toContain('依据');
    expect(host.textContent).toContain('暂无依据');
  });

  it('存在未保存修改时阻止切换，保存后由上层继续导航', async () => {
    const onSave = vi.fn();
    await act(async () => root.render(
      <ReviewCommentEditor
        open
        x={10}
        y={10}
        originalText="原文"
        initialText="现有意见"
        currentIndex={0}
        total={2}
        onNext={vi.fn()}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    ));
    const textarea = host.querySelector<HTMLTextAreaElement>('.review-comment-editor-textarea')!;
    await act(async () => setTextareaValue(textarea, '修改后的意见'));

    expect(host.querySelector<HTMLButtonElement>('[aria-label="下一条检视意见"]')?.disabled).toBe(true);
    const save = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('保存'))!;
    await act(async () => save.click());
    expect(onSave).toHaveBeenCalledWith('修改后的意见');
  });
});
