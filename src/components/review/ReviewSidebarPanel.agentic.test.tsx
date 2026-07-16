// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewSidebarPanel } from './ReviewSidebarPanel';
import type { ReviewComment } from '../../services/review/reviewState';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function comment(overrides: Partial<ReviewComment>): ReviewComment {
  return {
    id: 'comment',
    filePath: 'a.md',
    anchor: { filePath: 'a.md', from: 0, to: 2, originalText: '原文' },
    text: '意见',
    createdAt: 1,
    source: 'human',
    status: 'active',
    ...overrides,
  };
}

function props(comments: ReviewComment[]) {
  return {
    comments,
    dirty: false,
    currentFilePath: 'a.md',
    currentSource: '原文',
    onJump: vi.fn(),
    onEdit: vi.fn(),
    onRemove: vi.fn(),
    onSetIgnored: vi.fn(),
    onExport: vi.fn(),
    onSendToAI: vi.fn(),
    onClose: vi.fn(),
    revisions: [],
    onOpenRevision: vi.fn(),
    onReviewRevision: vi.fn(),
    onRefreshRevisions: vi.fn(),
  };
}

describe('ReviewSidebarPanel 统一意见列表', () => {
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

  it('人工与 AI 意见同列展示,AI 显示依据,忽略项默认隐藏且可恢复', async () => {
    const values = props([
      comment({ id: 'human', text: '人工意见' }),
      comment({
        id: 'ai',
        source: 'ai',
        text: 'AI 意见',
        basis: { kind: 'style', label: 'style.md' },
      }),
      comment({ id: 'ignored', text: '已忽略意见', status: 'ignored' }),
    ]);

    await act(async () => root.render(<ReviewSidebarPanel {...values} />));

    expect(host.textContent).toContain('人工意见');
    expect(host.textContent).toContain('AI 意见');
    expect(host.textContent).toContain('style.md');
    expect(host.textContent).not.toContain('已忽略意见');

    const showIgnored = Array.from(host.querySelectorAll<HTMLButtonElement>('.review-sidebar-filter'))
      .find((button) => button.textContent?.includes('已忽略'));
    expect(showIgnored).not.toBeNull();
    await act(async () => showIgnored!.click());
    expect(host.textContent).toContain('已忽略意见');
    expect(host.textContent).not.toContain('人工意见');

    const restore = host.querySelector<HTMLButtonElement>('[aria-label="恢复意见"]');
    await act(async () => restore!.click());
    expect(values.onSetIgnored).toHaveBeenCalledWith('ignored', false);
  });

  it('AI 检视只暴露 style、Skill 与本次要求，不展示完整 Prompt', async () => {
    const values = props([]);
    const onStartAIReview = vi.fn();
    await act(async () => root.render(
      <ReviewSidebarPanel
        {...values}
        styleGuidePath="D:\\docs\\style.md"
        reviewSkills={[{ name: 'humanizer-zh', label: '中文去 AI 味' }]}
        onStartAIReview={onStartAIReview}
      />,
    ));
    const summary = host.querySelector('summary');
    await act(async () => summary?.click());
    const select = host.querySelector<HTMLSelectElement>('.review-sidebar-ai-field select');
    const requirement = host.querySelector<HTMLTextAreaElement>('.review-sidebar-ai-field textarea');
    await act(async () => {
      select!.value = 'humanizer-zh';
      select!.dispatchEvent(new Event('change', { bubbles: true }));
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(requirement, '检查报告腔');
      requirement!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const start = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('开始检视'));
    await act(async () => start!.click());
    expect(onStartAIReview).toHaveBeenCalledWith({
      useStyleGuide: true,
      skillName: 'humanizer-zh',
      requirement: '检查报告腔',
    });
    expect(host.textContent).not.toContain('完整 Prompt');
  });

  it('只有忽略项时不允许导出或发 AI 修改', async () => {
    const values = props([comment({ status: 'ignored', text: '已忽略意见' })]);
    await act(async () => root.render(<ReviewSidebarPanel {...values} />));

    expect(host.querySelector<HTMLButtonElement>('.review-sidebar-action-export')?.disabled).toBe(true);

    const aiTab = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
      .find((button) => button.textContent?.includes('AI 改稿'));
    await act(async () => aiTab!.click());
    expect(host.querySelector<HTMLButtonElement>('.review-sidebar-action-send')?.disabled).toBe(true);
  });

  it('在 AI 改稿页用自然语言选择范围并生成候选稿', async () => {
    const values = props([]);
    const onStartAIRewrite = vi.fn();
    await act(async () => root.render(
      <ReviewSidebarPanel {...values} onStartAIRewrite={onStartAIRewrite} />,
    ));
    const aiTab = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
      .find((button) => button.textContent?.includes('AI 改稿'));
    await act(async () => aiTab!.click());

    const panel = host.querySelector<HTMLElement>('.review-sidebar-rewrite-request')!;
    const select = panel.querySelector<HTMLSelectElement>('select')!;
    const textarea = panel.querySelector<HTMLTextAreaElement>('textarea')!;
    await act(async () => {
      select.value = 'document';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(textarea, '全文压缩一成，保留结论');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const start = Array.from(panel.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('生成候选稿'));
    await act(async () => start!.click());
    expect(onStartAIRewrite).toHaveBeenCalledWith({
      scope: 'document',
      requirement: '全文压缩一成，保留结论',
    });
  });
});
