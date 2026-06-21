import { describe, expect, it } from 'vitest';
import {
  EMPTY_REVIEW_STATE,
  addReviewComment,
  buildReviewMarkdown,
  clearReviewState,
  markReviewClean,
  removeReviewComment,
  updateReviewComment,
} from './reviewState';
import type { SelectionAnchor } from '../agent/types';

function mkAnchor(originalText: string, prefixHint?: string): SelectionAnchor {
  return { filePath: 'a.md', from: 0, to: originalText.length, originalText, prefixHint };
}

describe('reviewState - mutations', () => {
  it('addReviewComment 给空文本不变更', () => {
    const next = addReviewComment(EMPTY_REVIEW_STATE, 'a.md', mkAnchor('x'), '   ');
    expect(next).toBe(EMPTY_REVIEW_STATE);
    expect(next.dirty).toBe(false);
  });

  it('addReviewComment 加一条意见 → dirty=true,id 唯一', () => {
    const s1 = addReviewComment(EMPTY_REVIEW_STATE, 'a.md', mkAnchor('hello'), '太啰嗦');
    expect(s1.comments).toHaveLength(1);
    expect(s1.comments[0].text).toBe('太啰嗦');
    expect(s1.dirty).toBe(true);
    const s2 = addReviewComment(s1, 'a.md', mkAnchor('world'), '改成 hi');
    expect(s2.comments).toHaveLength(2);
    expect(s2.comments[0].id).not.toBe(s2.comments[1].id);
  });

  it('updateReviewComment 改文本 → dirty 重置为 true', () => {
    const s1 = addReviewComment(EMPTY_REVIEW_STATE, 'a.md', mkAnchor('x'), '原意见');
    const clean = markReviewClean(s1);
    expect(clean.dirty).toBe(false);
    const s2 = updateReviewComment(clean, s1.comments[0].id, '改后的意见');
    expect(s2.comments[0].text).toBe('改后的意见');
    expect(s2.dirty).toBe(true);
  });

  it('updateReviewComment 改成相同文本不动状态', () => {
    const s1 = addReviewComment(EMPTY_REVIEW_STATE, 'a.md', mkAnchor('x'), '原意见');
    const clean = markReviewClean(s1);
    const s2 = updateReviewComment(clean, s1.comments[0].id, '原意见');
    expect(s2).toBe(clean);
  });

  it('updateReviewComment 改成空文本 → 退化为删除', () => {
    const s1 = addReviewComment(EMPTY_REVIEW_STATE, 'a.md', mkAnchor('x'), '原意见');
    const s2 = updateReviewComment(s1, s1.comments[0].id, '   ');
    expect(s2.comments).toHaveLength(0);
  });

  it('removeReviewComment 删一条', () => {
    const s1 = addReviewComment(EMPTY_REVIEW_STATE, 'a.md', mkAnchor('x'), '意见 A');
    const s2 = addReviewComment(s1, 'a.md', mkAnchor('y'), '意见 B');
    const s3 = removeReviewComment(s2, s1.comments[0].id);
    expect(s3.comments).toHaveLength(1);
    expect(s3.comments[0].text).toBe('意见 B');
    expect(s3.dirty).toBe(true);
  });

  it('clearReviewState 总是返回干净空状态', () => {
    expect(clearReviewState()).toEqual(EMPTY_REVIEW_STATE);
  });
});

describe('buildReviewMarkdown', () => {
  it('无意见 → 返回原文', () => {
    const src = '# 标题\n\n段落 A。';
    expect(buildReviewMarkdown(src, [])).toBe(src);
  });

  it('一条意见 → 在被批注段落末尾插入「检视意见,请处理」块,格式正确', () => {
    const src = '# 标题\n\n这段太啰嗦了需要精简。\n\n下一段。';
    const s1 = addReviewComment(EMPTY_REVIEW_STATE, 'a.md', mkAnchor('这段太啰嗦了需要精简。', '# 标题\n\n'), '保留核心信息');
    const out = buildReviewMarkdown(src, s1.comments);
    expect(out).toContain('> **检视意见，请处理**：保留核心信息');
    // 检视块应该在「下一段」之前
    const reviewIdx = out.indexOf('> **检视意见');
    const nextSegIdx = out.indexOf('下一段');
    expect(reviewIdx).toBeLessThan(nextSegIdx);
    // 不带 emoji
    expect(out).not.toMatch(/💬|📝|🔖/);
  });

  it('多条意见在不同段落 → 都被插入', () => {
    const src = '段落一文本。\n\n段落二文本。\n\n段落三文本。';
    let state = addReviewComment(EMPTY_REVIEW_STATE, 'a.md', mkAnchor('段落一文本。'), '改 1');
    state = addReviewComment(state, 'a.md', mkAnchor('段落二文本。'), '改 2');
    state = addReviewComment(state, 'a.md', mkAnchor('段落三文本。'), '改 3');
    const out = buildReviewMarkdown(src, state.comments);
    expect(out).toContain('> **检视意见，请处理**：改 1');
    expect(out).toContain('> **检视意见，请处理**：改 2');
    expect(out).toContain('> **检视意见，请处理**：改 3');
  });

  it('锚点定位失败的意见 → 走文档末「失效的检视意见」fallback,不丢', () => {
    const src = '段落 A。\n\n段落 B。';
    const orphan = addReviewComment(EMPTY_REVIEW_STATE, 'a.md', mkAnchor('已经被删掉的片段'), '改 orphan');
    const out = buildReviewMarkdown(src, orphan.comments);
    expect(out).toContain('## 失效的检视意见');
    expect(out).toContain('改 orphan');
    expect(out).toContain('已经被删掉的片段');
  });

  it('用 prefixHint 区分多处重复 originalText 的歧义', () => {
    // 同一句话出现两次,通过 prefixHint 能定位到第二次出现的那条
    const src = '介绍\n\n关键观点。\n\n再来一段\n\n关键观点。';
    const targetSecond = addReviewComment(
      EMPTY_REVIEW_STATE,
      'a.md',
      mkAnchor('关键观点。', '再来一段\n\n'),
      '是的就是这一处',
    );
    const out = buildReviewMarkdown(src, targetSecond.comments);
    // 检视块应该在第二次「关键观点」之后,而不是第一次
    const secondHitIdx = out.indexOf('关键观点。', src.indexOf('再来一段'));
    const reviewIdx = out.indexOf('> **检视意见');
    expect(reviewIdx).toBeGreaterThan(secondHitIdx);
  });
});
