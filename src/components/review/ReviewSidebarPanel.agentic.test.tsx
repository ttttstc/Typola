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

    const accept = host.querySelector<HTMLButtonElement>('[aria-label="接纳意见"]');
    await act(async () => accept!.click());
    expect(values.onSetIgnored).toHaveBeenCalledWith('ignored', false);
  });

  it('人工、AI 和已忽略意见都可编辑，并以接纳或忽略标记状态', async () => {
    const values = props([
      comment({ id: 'human' }),
      comment({ id: 'ai', source: 'ai' }),
      comment({ id: 'ignored', status: 'ignored' }),
    ]);
    await act(async () => root.render(<ReviewSidebarPanel {...values} />));

    expect(host.querySelectorAll('[aria-label="编辑意见"]')).toHaveLength(2);
    const aiEdit = host.querySelectorAll<HTMLButtonElement>('[aria-label="编辑意见"]')[1];
    await act(async () => aiEdit.click());
    expect(values.onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'ai' }));

    const showIgnored = Array.from(host.querySelectorAll<HTMLButtonElement>('.review-sidebar-filter'))
      .find((button) => button.textContent?.includes('已忽略'))!;
    await act(async () => showIgnored.click());
    expect(host.querySelectorAll('[aria-label="编辑意见"]')).toHaveLength(1);
    expect(host.querySelector<HTMLButtonElement>('[aria-label="忽略意见"]')?.getAttribute('aria-pressed')).toBe('true');
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

    expect(host.querySelector<HTMLButtonElement>('.review-sidebar-action-send')?.disabled).toBe(true);
  });

  it('从检视列表发起 AI 改稿，改稿历史只展示版本查看与对比', async () => {
    const values = {
      ...props([comment({ id: 'accepted' })]),
      revisions: [{ name: 'a.ai改1.md', path: 'D:\\a.ai改1.md', mtime: 1, version: 1 }],
    };
    await act(async () => root.render(<ReviewSidebarPanel {...values} />));

    const rewrite = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('AI 改稿'))!;
    await act(async () => rewrite.click());
    expect(values.onSendToAI).toHaveBeenCalledTimes(1);

    const historyTab = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
      .find((button) => button.textContent?.includes('改稿历史'))!;
    await act(async () => historyTab.click());
    expect(host.textContent).toContain('a.ai改1.md');
    expect(host.textContent).not.toContain('修改范围');

    const compare = host.querySelector<HTMLButtonElement>('[aria-label="以 Diff 审阅"]')!;
    await act(async () => compare.click());
    expect(values.onReviewRevision).toHaveBeenCalledWith('D:\\a.ai改1.md');
  });
});
