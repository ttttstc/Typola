// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useReviewState } from './useReviewState';
import type { SelectionAnchor } from '../services/agent/types';
import type { ReviewComment, ReviewStateSnapshot } from '../services/review/reviewState';
import { reviewStateStorageKey, saveReviewState } from '../services/review/reviewStatePersistence';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type ReviewStateController = ReturnType<typeof useReviewState>;

function Harness({
  filePath,
  onController,
}: {
  filePath: string | undefined;
  onController: (controller: ReviewStateController) => void;
}) {
  const controller = useReviewState(filePath);
  onController(controller);
  return null;
}

function anchor(filePath: string, originalText = '正文'): SelectionAnchor {
  return {
    filePath,
    from: 0,
    to: originalText.length,
    originalText,
  };
}

function persistedComment(filePath: string, text: string, status: ReviewComment['status'] = 'active'): ReviewComment {
  return {
    id: `persisted-${text}`,
    filePath,
    anchor: anchor(filePath),
    text,
    createdAt: 1,
    source: 'human',
    status,
  };
}

describe('useReviewState 持久化', () => {
  let host: HTMLDivElement;
  let root: Root;
  let controller!: ReviewStateController;

  beforeEach(() => {
    localStorage.clear();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('意见变更写回后,跨挂载按规范化路径恢复 comments 与 dirty', async () => {
    const originalPath = String.raw`d:\docs\article.md`;

    await act(async () => root.render(
      <Harness filePath={originalPath} onController={(value) => { controller = value; }} />,
    ));
    await act(async () => controller.addComment(anchor(originalPath), '跨挂载意见'));

    expect(JSON.parse(localStorage.getItem(reviewStateStorageKey(originalPath)) ?? 'null')).toMatchObject({
      version: 1,
      dirty: true,
    });

    await act(async () => root.unmount());
    root = createRoot(host);
    await act(async () => root.render(
      <Harness filePath="d:/docs/article.md" onController={(value) => { controller = value; }} />,
    ));

    expect(controller.state.comments).toHaveLength(1);
    expect(controller.state.comments[0].text).toBe('跨挂载意见');
    expect(controller.state.dirty).toBe(true);
  });

  it('文档路径切换时恢复目标文档的已持久化状态', async () => {
    const firstPath = 'D:/docs/first.md';
    const secondPath = String.raw`d:\docs\second.md`;
    const snapshot: ReviewStateSnapshot = {
      comments: [persistedComment(secondPath, '第二份文档意见', 'ignored')],
      dirty: false,
    };
    saveReviewState(secondPath, snapshot);

    await act(async () => root.render(
      <Harness filePath={firstPath} onController={(value) => { controller = value; }} />,
    ));
    expect(controller.state.comments).toEqual([]);

    await act(async () => root.render(
      <Harness filePath="d:/docs/second.md" onController={(value) => { controller = value; }} />,
    ));

    expect(controller.state).toEqual(snapshot);
  });

  it('检视版 metadata hydrate 不覆盖已恢复或本轮已修改的内存状态', async () => {
    const filePath = 'D:/docs/article.md';
    const restored = persistedComment(filePath, '已恢复');
    saveReviewState(filePath, { comments: [restored], dirty: true });

    await act(async () => root.render(
      <Harness filePath={filePath} onController={(value) => { controller = value; }} />,
    ));
    await act(async () => controller.hydrateComments([persistedComment(filePath, '检视版旧意见')]));
    expect(controller.state.comments).toEqual([restored]);
    expect(controller.state.dirty).toBe(true);

    await act(async () => root.render(
      <Harness filePath="D:/docs/new.md" onController={(value) => { controller = value; }} />,
    ));
    await act(async () => controller.addComment(anchor('D:/docs/new.md'), '本轮新意见'));
    await act(async () => controller.hydrateComments([persistedComment('D:/docs/new.md', 'metadata 意见')]));

    expect(controller.state.comments).toHaveLength(1);
    expect(controller.state.comments[0].text).toBe('本轮新意见');
    expect(controller.state.dirty).toBe(true);
  });

  it('损坏记录不阻断普通文档打开,后续仍可创建意见', async () => {
    const filePath = 'D:/docs/broken.md';
    localStorage.setItem(reviewStateStorageKey(filePath), '{broken');

    await expect(act(async () => root.render(
      <Harness filePath={filePath} onController={(value) => { controller = value; }} />,
    ))).resolves.toBeUndefined();
    expect(controller.state.comments).toEqual([]);
    expect(controller.state.dirty).toBe(false);

    await act(async () => controller.addComment(anchor(filePath), '损坏记录后的新意见'));
    expect(controller.state.comments[0].text).toBe('损坏记录后的新意见');
  });
});
