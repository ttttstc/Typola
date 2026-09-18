import { describe, expect, it } from 'vitest';
import type { SelectionAnchor } from '../agent/types';
import {
  EMPTY_REVIEW_STATE,
  addAIReviewComment,
  addReviewComment,
  clearReviewState,
  getActiveReviewComments,
  getExportableReviewComments,
  markReviewClean,
  markReviewCommentsApplied,
  removeReviewComment,
  resolveAppliedCommentIds,
  setReviewCommentIgnored,
  updateReviewComment,
} from './reviewState';

function makeAnchor(overrides: Partial<SelectionAnchor> = {}): SelectionAnchor {
  return {
    filePath: '/test/doc.md',
    from: 0,
    to: 5,
    originalText: 'hello world',
    ...overrides,
  };
}

describe('reviewState', () => {
  describe('addReviewComment / addAIReviewComment', () => {
    it('添加人工意见标记 dirty=true 与 source=human', () => {
      const next = addReviewComment(EMPTY_REVIEW_STATE, '/test/doc.md', makeAnchor(), '建议改');
      expect(next.dirty).toBe(true);
      expect(next.comments).toHaveLength(1);
      expect(next.comments[0].source).toBe('human');
      expect(next.comments[0].text).toBe('建议改');
      expect(next.comments[0].status).toBe('active');
    });

    it('AI 意见可带 basis（style / skill / request）', () => {
      const next = addAIReviewComment(
        EMPTY_REVIEW_STATE,
        '/test/doc.md',
        makeAnchor(),
        'AI 建议',
        { kind: 'skill', label: 'polish' },
      );
      expect(next.comments[0].source).toBe('ai');
      expect(next.comments[0].basis).toEqual({ kind: 'skill', label: 'polish' });
    });

    it('空文本 / 全空白文本时不添加意见', () => {
      const next1 = addReviewComment(EMPTY_REVIEW_STATE, '/test/doc.md', makeAnchor(), '');
      const next2 = addReviewComment(EMPTY_REVIEW_STATE, '/test/doc.md', makeAnchor(), '   ');
      expect(next1.comments).toHaveLength(0);
      expect(next2.comments).toHaveLength(0);
      expect(next1).toBe(EMPTY_REVIEW_STATE);
    });

    it('意见 id 唯一（多次添加生成不同 id）', () => {
      const s1 = addReviewComment(EMPTY_REVIEW_STATE, '/test/doc.md', makeAnchor(), 'first');
      const s2 = addReviewComment(s1, '/test/doc.md', makeAnchor(), 'second');
      expect(s2.comments[0].id).not.toBe(s2.comments[1].id);
    });
  });

  describe('updateReviewComment / removeReviewComment', () => {
    it('更新意见文本触发 dirty=true', () => {
      const s1 = addReviewComment(EMPTY_REVIEW_STATE, '/test/doc.md', makeAnchor(), '原文');
      const id = s1.comments[0].id;
      const s2 = updateReviewComment(s1, id, '新文本');
      expect(s2.dirty).toBe(true);
      expect(s2.comments[0].text).toBe('新文本');
    });

    it('更新为空文本等价于删除', () => {
      const s1 = addReviewComment(EMPTY_REVIEW_STATE, '/test/doc.md', makeAnchor(), '原文');
      const id = s1.comments[0].id;
      const s2 = updateReviewComment(s1, id, '   ');
      expect(s2.comments).toHaveLength(0);
    });

    it('更新不存在的 id 不触发 dirty 与 comments 变更', () => {
      const s1 = addReviewComment(EMPTY_REVIEW_STATE, '/test/doc.md', makeAnchor(), 'x');
      const s2 = updateReviewComment(s1, 'not-exist', 'y');
      expect(s2.comments).toBe(s1.comments);
    });

    it('removeReviewComment 删除指定意见', () => {
      const s1 = addReviewComment(EMPTY_REVIEW_STATE, '/test/doc.md', makeAnchor(), 'a');
      const s2 = addReviewComment(s1, '/test/doc.md', makeAnchor(), 'b');
      const id = s2.comments[0].id;
      const s3 = removeReviewComment(s2, id);
      expect(s3.comments).toHaveLength(1);
      expect(s3.comments[0].text).toBe('b');
      expect(s3.dirty).toBe(true);
    });

    it('removeReviewComment 删除不存在的 id 返回原 state', () => {
      const s1 = addReviewComment(EMPTY_REVIEW_STATE, '/test/doc.md', makeAnchor(), 'a');
      const s2 = removeReviewComment(s1, 'not-exist');
      expect(s2).toBe(s1);
    });
  });

  describe('setReviewCommentIgnored', () => {
    it('忽略意见 → status=ignored', () => {
      const s1 = addReviewComment(EMPTY_REVIEW_STATE, '/test/doc.md', makeAnchor(), 'x');
      const id = s1.comments[0].id;
      const s2 = setReviewCommentIgnored(s1, id, true);
      expect(s2.comments[0].status).toBe('ignored');
    });

    it('取消忽略 → status=active', () => {
      const s1 = addReviewComment(EMPTY_REVIEW_STATE, '/test/doc.md', makeAnchor(), 'x');
      const id = s1.comments[0].id;
      const s2 = setReviewCommentIgnored(setReviewCommentIgnored(s1, id, true), id, false);
      expect(s2.comments[0].status).toBe('active');
    });

    it('重复设置同一状态不触发 dirty', () => {
      const s1 = addReviewComment(EMPTY_REVIEW_STATE, '/test/doc.md', makeAnchor(), 'x');
      const id = s1.comments[0].id;
      const s2 = setReviewCommentIgnored(s1, id, false);
      expect(s2).toBe(s1);
    });
  });

  describe('getActiveReviewComments / getExportableReviewComments', () => {
    it('getActiveReviewComments 排除 ignored 与已应用', () => {
      const s1 = addReviewComment(EMPTY_REVIEW_STATE, '/a.md', makeAnchor({ filePath: '/a.md' }), 'a');
      const s2 = addReviewComment(s1, '/b.md', makeAnchor({ filePath: '/b.md' }), 'b');
      const s3 = addReviewComment(s2, '/c.md', makeAnchor({ filePath: '/c.md' }), 'c');
      const idA = s3.comments[0].id;
      const idB = s3.comments[1].id;
      const s4 = setReviewCommentIgnored(s3, idA, true);
      const s5 = markReviewCommentsApplied(s4, [idB]);
      const active = getActiveReviewComments(s5.comments);
      expect(active).toHaveLength(1);
      expect(active[0].text).toBe('c');
    });

    it('getExportableReviewComments 仅排除 ignored，保留已应用（PR #268 修复）', () => {
      const s1 = addReviewComment(EMPTY_REVIEW_STATE, '/a.md', makeAnchor({ filePath: '/a.md' }), 'a');
      const s2 = addReviewComment(s1, '/b.md', makeAnchor({ filePath: '/b.md' }), 'b');
      const idA = s2.comments[0].id;
      const idB = s2.comments[1].id;
      const s3 = setReviewCommentIgnored(s2, idA, true);
      const s4 = markReviewCommentsApplied(s3, [idB]);
      const exportable = getExportableReviewComments(s4.comments);
      expect(exportable).toHaveLength(1);
      expect(exportable[0].text).toBe('b');
      expect(exportable[0].appliedAt).toBeDefined();
    });
  });

  describe('markReviewCommentsApplied', () => {
    it('标记 appliedAt 后意见保留但不再计入 active', () => {
      const s1 = addReviewComment(EMPTY_REVIEW_STATE, '/a.md', makeAnchor({ filePath: '/a.md' }), 'x');
      const id = s1.comments[0].id;
      const s2 = markReviewCommentsApplied(s1, [id], 1700000000000);
      expect(s2.comments[0].appliedAt).toBe(1700000000000);
      expect(s2.dirty).toBe(true);
      expect(getActiveReviewComments(s2.comments)).toHaveLength(0);
    });

    it('空数组 / 已应用的 id 不触发变更', () => {
      const s1 = addReviewComment(EMPTY_REVIEW_STATE, '/a.md', makeAnchor({ filePath: '/a.md' }), 'x');
      const id = s1.comments[0].id;
      const s2 = markReviewCommentsApplied(s1, []);
      expect(s2).toBe(s1);
      const s3 = markReviewCommentsApplied(s1, [id], 100);
      const s4 = markReviewCommentsApplied(s3, [id], 200);
      expect(s4.comments[0].appliedAt).toBe(100);
    });
  });

  describe('resolveAppliedCommentIds（PR #268 closure 检测）', () => {
    it('锚点原文不再出现在合并稿中 → 该意见标记为 applied', () => {
      const originalText = '这段要改';
      const comment = {
        id: 'rv-1',
        filePath: '/a.md',
        anchor: makeAnchor({ originalText }),
        text: '改写这段',
        createdAt: 0,
        source: 'ai' as const,
        status: 'active' as const,
      };
      const merged = '重写后的正文，不含原句';
      const applied = resolveAppliedCommentIds(merged, [comment], ['rv-1']);
      expect(applied).toEqual(['rv-1']);
    });

    it('锚点原文仍在合并稿中 → 视为 AI 跳过，不算 applied', () => {
      const originalText = '这段要改';
      const comment = {
        id: 'rv-1',
        filePath: '/a.md',
        anchor: makeAnchor({ originalText }),
        text: '改写这段',
        createdAt: 0,
        source: 'ai' as const,
        status: 'active' as const,
      };
      const merged = '这段要改，但加了引言';
      const applied = resolveAppliedCommentIds(merged, [comment], ['rv-1']);
      expect(applied).toEqual([]);
    });

    it('空 originalText 的意见（无可验证锚点）保持待处理', () => {
      const comment = {
        id: 'rv-1',
        filePath: '/a.md',
        anchor: makeAnchor({ originalText: '' }),
        text: '模糊意见',
        createdAt: 0,
        source: 'ai' as const,
        status: 'active' as const,
      };
      const merged = '任何内容';
      const applied = resolveAppliedCommentIds(merged, [comment], ['rv-1']);
      expect(applied).toEqual([]);
    });

    it('不存在的 id 不出现在结果', () => {
      const originalText = '要改的句';
      const comment = {
        id: 'rv-1',
        filePath: '/a.md',
        anchor: makeAnchor({ originalText }),
        text: 'x',
        createdAt: 0,
        source: 'ai' as const,
        status: 'active' as const,
      };
      const merged = '没原句';
      const applied = resolveAppliedCommentIds(merged, [comment], ['rv-not-exist']);
      expect(applied).toEqual([]);
    });

    it('多意见混合：合并稿完全替换原文的标记 applied，部分替换的不算', () => {
      const c1 = {
        id: 'rv-1',
        filePath: '/a.md',
        anchor: makeAnchor({ originalText: '需要完全替换的句子' }),
        text: 'a',
        createdAt: 0,
        source: 'ai' as const,
        status: 'active' as const,
      };
      const c2 = {
        id: 'rv-2',
        filePath: '/a.md',
        anchor: makeAnchor({ originalText: '保留不动的句子' }),
        text: 'b',
        createdAt: 0,
        source: 'ai' as const,
        status: 'active' as const,
      };
      // c1 原文整句被改写 → applied
      // c2 原文仍原样保留 → 未 applied
      const merged = '这里是改写后的新版正文。保留不动的句子也还在。';
      const applied = resolveAppliedCommentIds(merged, [c1, c2], ['rv-1', 'rv-2']);
      expect(applied).toEqual(['rv-1']);
    });
  });

  describe('clearReviewState / markReviewClean', () => {
    it('clearReviewState 返回空 state 且 dirty=false', () => {
      const result = clearReviewState();
      expect(result).toEqual({ comments: [], dirty: false });
    });

    it('markReviewClean 清除 dirty 但保留 comments', () => {
      const s1 = addReviewComment(EMPTY_REVIEW_STATE, '/a.md', makeAnchor({ filePath: '/a.md' }), 'x');
      const s2 = markReviewClean(s1);
      expect(s2.dirty).toBe(false);
      expect(s2.comments).toHaveLength(1);
    });

    it('markReviewClean 在已 clean 时返回原 state（不复制）', () => {
      const s2 = markReviewClean(EMPTY_REVIEW_STATE);
      expect(s2).toBe(EMPTY_REVIEW_STATE);
    });
  });
});
