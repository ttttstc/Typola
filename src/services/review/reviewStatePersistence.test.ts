// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { ReviewComment, ReviewStateSnapshot } from './reviewState';
import {
  loadReviewState,
  normalizeReviewDocumentPath,
  reviewStateStorageKey,
  saveReviewState,
} from './reviewStatePersistence';

function comment(filePath: string, status: ReviewComment['status'] = 'active'): ReviewComment {
  return {
    id: 'review-1',
    filePath,
    anchor: {
      filePath,
      from: 2,
      to: 4,
      originalText: '正文',
      prefixHint: '# 标题\n\n',
      headingPath: ['标题'],
      block: { kind: 'paragraph', from: 0, to: 8 },
    },
    text: '保留这条意见',
    createdAt: 1,
    source: 'ai',
    status,
    basis: { kind: 'style', label: 'style.md' },
    appliedAt: 2,
  };
}

describe('检视状态 localStorage 持久化', () => {
  beforeEach(() => localStorage.clear());

  it('按规范化文档路径写入 version=1 记录并完整 round-trip', () => {
    const filePath = String.raw`D:\Docs\Article.md`;
    const snapshot: ReviewStateSnapshot = {
      comments: [comment(filePath, 'ignored')],
      dirty: true,
    };

    saveReviewState(filePath, snapshot);

    expect(normalizeReviewDocumentPath('d:/docs/article.md')).toBe('d:/docs/article.md');
    expect(reviewStateStorageKey(filePath)).toBe('typola.review-state.v1:d:/docs/article.md');
    expect(JSON.parse(localStorage.getItem(reviewStateStorageKey(filePath)) ?? 'null')).toEqual({
      version: 1,
      comments: snapshot.comments,
      dirty: true,
    });
    expect(loadReviewState('d:/docs/article.md')).toEqual(snapshot);
  });

  it('损坏或版本不符记录静默丢弃', () => {
    const filePath = 'D:/docs/broken.md';
    const key = reviewStateStorageKey(filePath);

    localStorage.setItem(key, '{broken');
    expect(() => loadReviewState(filePath)).not.toThrow();
    expect(loadReviewState(filePath)).toBeUndefined();

    localStorage.setItem(key, JSON.stringify({ version: 2, comments: [], dirty: false }));
    expect(loadReviewState(filePath)).toBeUndefined();
  });
});
