// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReviewComment, ReviewStateSnapshot } from './reviewState';
import {
  loadReviewState,
  normalizeReviewDocumentPath,
  removeReviewStatesUnder,
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
  afterEach(() => vi.unstubAllGlobals());

  it('按规范化文档路径写入 version=1 记录并完整 round-trip', () => {
    const filePath = String.raw`d:\docs\article.md`;
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

  it('只在 Windows 主机折叠路径大小写', () => {
    vi.stubGlobal('navigator', { platform: 'Win32', userAgent: 'Windows' });
    expect(normalizeReviewDocumentPath('D:/Docs/Article.md')).toBe('d:/docs/article.md');

    vi.stubGlobal('navigator', { platform: 'Linux x86_64', userAgent: 'Linux' });
    expect(normalizeReviewDocumentPath('/ws/Note.md')).toBe('/ws/Note.md');
    expect(normalizeReviewDocumentPath('/ws/note.md')).toBe('/ws/note.md');
  });

  it('删除文件或文件夹时清理对应记录但保留同级文件', () => {
    saveReviewState('/ws/docs/a.md', { comments: [], dirty: false });
    saveReviewState('/ws/docs/nested/b.md', { comments: [], dirty: false });
    saveReviewState('/ws/other.md', { comments: [], dirty: false });

    removeReviewStatesUnder('/ws/docs');

    expect(loadReviewState('/ws/docs/a.md')).toBeUndefined();
    expect(loadReviewState('/ws/docs/nested/b.md')).toBeUndefined();
    expect(loadReviewState('/ws/other.md')).toEqual({ comments: [], dirty: false });
  });
});
