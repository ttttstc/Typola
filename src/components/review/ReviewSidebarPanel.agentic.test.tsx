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

  it('人工与 AI 意见同列展示，AI 显示依据，忽略项单独筛选', async () => {
    const values = props([
      comment({ id: 'human', text: '人工意见' }),
      comment({ id: 'ai', source: 'ai', text: 'AI 意见', basis: { kind: 'style', label: 'style.md' } }),
      comment({ id: 'ignored', text: '已忽略意见', status: 'ignored' }),
    ]);
    await act(async () => root.render(<ReviewSidebarPanel {...values} />));

    expect(host.textContent).toContain('人工意见');
    expect(host.textContent).toContain('AI 意见');
    expect(host.textContent).toContain('style.md');
    expect(host.textContent).not.toContain('已忽略意见');

    const showIgnored = Array.from(host.querySelectorAll<HTMLButtonElement>('.review-sidebar-filter'))
      .find((button) => button.textContent?.includes('已忽略'))!;
    await act(async () => showIgnored.click());
    expect(host.textContent).toContain('已忽略意见');
    expect(host.textContent).not.toContain('人工意见');
    expect(host.querySelector('[aria-label="接纳意见"]')).toBeNull();
  });

  it('人工、AI 和已忽略意见都可编辑，活动意见只支持忽略', async () => {
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

    const ignore = host.querySelector<HTMLButtonElement>('[aria-label="忽略意见"]')!;
    await act(async () => ignore.click());
    expect(values.onSetIgnored).toHaveBeenCalledWith('human', true);
    expect(host.querySelector('[aria-label="接纳意见"]')).toBeNull();
  });

  it('AI 检视支持多规则文件、多 Skill 与手工规则', async () => {
    const values = props([]);
    const onStartAIReview = vi.fn();
    const onPickRuleFiles = vi.fn(async () => ['D:\\docs\\style.md', 'D:\\docs\\tone.md']);
    await act(async () => root.render(
      <ReviewSidebarPanel
        {...values}
        reviewSkills={[
          { name: 'humanizer-zh', label: '中文去 AI 味' },
          { name: 'tech-writing', label: '技术写作' },
        ]}
        onPickRuleFiles={onPickRuleFiles}
        onStartAIReview={onStartAIReview}
      />,
    ));
    await act(async () => host.querySelector('summary')?.click());
    const importRules = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('导入 Markdown'))!;
    await act(async () => importRules.click());
    expect(host.textContent).toContain('style.md');
    expect(host.textContent).toContain('tone.md');

    const skills = host.querySelectorAll<HTMLInputElement>('.review-sidebar-skill-list input');
    const requirement = host.querySelector<HTMLTextAreaElement>('.review-sidebar-ai-field textarea')!;
    await act(async () => {
      skills.forEach((skill) => {
        skill.click();
      });
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(requirement, '检查报告腔');
      requirement.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const start = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('开始检视'))!;
    await act(async () => start.click());
    expect(onStartAIReview).toHaveBeenCalledWith({
      rulePaths: ['D:\\docs\\style.md', 'D:\\docs\\tone.md'],
      skillNames: ['humanizer-zh', 'tech-writing'],
      requirement: '检查报告腔',
    });
  });

  it('AI 检视运行时可以停止', async () => {
    const onStopAIReview = vi.fn();
    await act(async () => root.render(
      <ReviewSidebarPanel
        {...props([])}
        aiReviewRunning
        onStartAIReview={vi.fn()}
        onStopAIReview={onStopAIReview}
      />,
    ));
    await act(async () => host.querySelector('summary')?.click());
    const stop = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('停止检视'))!;
    await act(async () => stop.click());
    expect(onStopAIReview).toHaveBeenCalledOnce();
  });

  it('只有忽略项时不允许导出或发 AI 修改', async () => {
    const values = props([comment({ status: 'ignored', text: '已忽略意见' })]);
    await act(async () => root.render(<ReviewSidebarPanel {...values} />));
    expect(host.querySelector<HTMLButtonElement>('.review-sidebar-action-export')?.disabled).toBe(true);
    expect(host.querySelector<HTMLButtonElement>('.review-sidebar-action-send')?.disabled).toBe(true);
  });

  it('从检视列表发起 AI 改稿，改稿历史只展示版本查看与对比', async () => {
    const values = {
      ...props([comment({ id: 'active' })]),
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
