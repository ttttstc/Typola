// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReviewSidebarPanel } from './ReviewSidebarPanel';
import type { ReviewComment } from '../../services/review/reviewState';
import type { RevisionEntry } from '../../hooks/useRevisionList';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function makeComment(overrides: Partial<ReviewComment> = {}): ReviewComment {
  return {
    id: overrides.id ?? 'rv-1',
    filePath: overrides.filePath ?? '/tmp/a.md',
    anchor: overrides.anchor ?? {
      filePath: '/tmp/a.md',
      from: 0,
      to: 4,
      originalText: 'hello',
    },
    text: overrides.text ?? 'note',
    createdAt: overrides.createdAt ?? 0,
  };
}

function render(props: Partial<React.ComponentProps<typeof ReviewSidebarPanel>> = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const defaults: React.ComponentProps<typeof ReviewSidebarPanel> = {
    comments: [],
    dirty: false,
    currentFilePath: '/tmp/a.md',
    onJump: vi.fn(),
    onEdit: vi.fn(),
    onRemove: vi.fn(),
    onExport: vi.fn(),
    onSendToAI: vi.fn(),
    onClose: vi.fn(),
    revisions: [] as RevisionEntry[],
    onOpenRevision: vi.fn(),
    onReviewRevision: vi.fn(),
    onRefreshRevisions: vi.fn(),
    ...props,
  };
  act(() => { root.render(<ReviewSidebarPanel {...defaults} />); });
  return { host, root };
}

describe('ReviewSidebarPanel — stale indicator (issue #180)', () => {
  let host: HTMLElement;
  let root: Root;

  afterEach(() => {
    act(() => root.unmount());
    host?.remove();
  });

  it('stale 评论在列表里渲染 AlertTriangle 角标', () => {
    const comment = makeComment({ id: 'stale-1' });
    const { host: h, root: r } = render({
      comments: [{ ...comment, isStale: true }],
    });
    host = h;
    root = r;
    const indicator = host.querySelector('.review-sidebar-item-stale');
    expect(indicator).not.toBeNull();
    expect(indicator?.getAttribute('title')).toContain('位置可能已变');
  });

  it('valid 评论不渲染角标', () => {
    const comment = makeComment({ id: 'valid-1' });
    const { host: h, root: r } = render({
      comments: [{ ...comment, isStale: false }],
    });
    host = h;
    root = r;
    expect(host.querySelector('.review-sidebar-item-stale')).toBeNull();
  });

  it('isStale 缺省时不渲染角标(向下兼容旧调用方)', () => {
    const comment = makeComment({ id: 'legacy-1' });
    const { host: h, root: r } = render({ comments: [comment] });
    host = h;
    root = r;
    expect(host.querySelector('.review-sidebar-item-stale')).toBeNull();
  });

  it('点击评论触发 onJump(reviewStateApi 走 AppLayout 端 revealRange)', () => {
    const onJump = vi.fn();
    const comment = makeComment({ id: 'jump-1' });
    const { host: h, root: r } = render({
      comments: [comment],
      onJump,
    });
    host = h;
    root = r;
    const jumpBtn = host.querySelector('.review-sidebar-item-main') as HTMLButtonElement | null;
    expect(jumpBtn).not.toBeNull();
    act(() => { jumpBtn!.click(); });
    expect(onJump).toHaveBeenCalledTimes(1);
    expect(onJump).toHaveBeenCalledWith(comment);
  });

  it('stale 评论的 onClick 触发 onJump(失效也照样跳)', () => {
    const onJump = vi.fn();
    const comment = makeComment({ id: 'jump-stale-1' });
    const { host: h, root: r } = render({
      comments: [{ ...comment, isStale: true }],
      onJump,
    });
    host = h;
    root = r;
    const jumpBtn = host.querySelector('.review-sidebar-item-main') as HTMLButtonElement | null;
    act(() => { jumpBtn!.click(); });
    expect(onJump).toHaveBeenCalledTimes(1);
  });
});