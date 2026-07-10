import { describe, expect, it } from 'vitest';
import {
  EMPTY_REVIEW_STATE,
  addReviewComment,
  buildReviewMarkdown,
  clearReviewState,
  lineNumberForAnchor,
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

  it('锚点定位失败的意见 → 走文档末「检视意见汇总」兜底,不丢', () => {
    const src = '段落 A。\n\n段落 B。';
    const orphan = addReviewComment(EMPTY_REVIEW_STATE, 'a.md', mkAnchor('已经被删掉的片段'), '改 orphan');
    const out = buildReviewMarkdown(src, orphan.comments);
    expect(out).toContain('## 检视意见汇总');
    expect(out).toContain('改 orphan');
    expect(out).toContain('已经被删掉的片段');
  });

  it('双轨保险:即使所有 anchor 都定位成功,文末汇总也照样输出(协作者/AI 兜底参照)', () => {
    const src = '一二三段落。\n\n四五六段落。';
    let state = addReviewComment(EMPTY_REVIEW_STATE, 'a.md', mkAnchor('一二三段落。'), '改一');
    state = addReviewComment(state, 'a.md', mkAnchor('四五六段落。'), '改二');
    const out = buildReviewMarkdown(src, state.comments);
    // 段后内嵌
    expect(out).toContain('> **检视意见，请处理**：改一');
    expect(out).toContain('> **检视意见，请处理**：改二');
    // 文末汇总(双轨)
    expect(out).toContain('## 检视意见汇总');
    expect(out).toMatch(/### 1\. 第 1 行 · 针对片段「一二三段落。」\n\n改一/);
    expect(out).toMatch(/### 2\. 第 1 行 · 针对片段「四五六段落。」\n\n改二/);
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

describe('buildReviewMarkdown 行号前缀', () => {
  it('anchor.from = 0 → 文末汇总显示「第 1 行」', () => {
    const src = '第一行内容。\n\n第二行内容。';
    const s = addReviewComment(EMPTY_REVIEW_STATE, 'a.md', mkAnchor('第一行内容。'), '改一');
    const out = buildReviewMarkdown(src, s.comments);
    expect(out).toContain('### 1. 第 1 行 · 针对片段「第一行内容。」');
  });

  it('anchor.from 指向第二段开头 → 文末汇总显示「第 3 行」', () => {
    const src = '第一行内容。\n\n第二行内容。';
    // '第一行内容。' 占 6 字符(索引 0..5),\n\n 在 6/7,'第二行内容。' 从索引 8 起
    const s = addReviewComment(
      EMPTY_REVIEW_STATE,
      'a.md',
      { filePath: 'a.md', from: 8, to: 13, originalText: '第二行内容。' },
      '改二',
    );
    const out = buildReviewMarkdown(src, s.comments);
    expect(out).toContain('### 1. 第 3 行 · 针对片段「第二行内容。」');
  });

  it('anchor.from 越界 → 文末汇总显示「定位失效」,意见正文仍保留', () => {
    const src = '正常段落。\n\n另一段。';
    const orphan = addReviewComment(
      EMPTY_REVIEW_STATE,
      'a.md',
      { filePath: 'a.md', from: 9999, to: 9999, originalText: '已被改掉的文本' },
      '改 orphan',
    );
    const out = buildReviewMarkdown(src, orphan.comments);
    expect(out).toContain('### 1. 定位失效 · 针对片段「已被改掉的文本」');
    expect(out).toContain('改 orphan');
  });

  it('文末汇总 escape 反引号/井号/星号,避免意见内容破坏 ### N. 标题行渲染', () => {
    const src = '正文段落。';
    const evil = addReviewComment(
      EMPTY_REVIEW_STATE,
      'a.md',
      { filePath: 'a.md', from: 0, to: 2, originalText: '伪 ## 标题' },
      '含 `伪#代码块` 和 *星号*',
    );
    const out = buildReviewMarkdown(src, evil.comments);
    expect(out).toContain('\\`伪\\#代码块\\`');
    expect(out).toContain('\\*星号\\*');
    // ### N. 行仍保持完整标题结构,不被井号破坏(## → \#\#)
    expect(out).toContain('### 1. 第 1 行 · 针对片段「伪 \\#\\# 标题」');
  });

  it('anchor.from 为负 → 文末汇总显示「定位失效」', () => {
    const src = '正常段落。';
    const s = addReviewComment(
      EMPTY_REVIEW_STATE,
      'a.md',
      { filePath: 'a.md', from: -5, to: -5, originalText: '某段' },
      '改',
    );
    const out = buildReviewMarkdown(src, s.comments);
    expect(out).toContain('### 1. 定位失效 · 针对片段「某段」');
  });
});

describe('lineNumberForAnchor', () => {
  it('offset = 0 返回 1', () => {
    expect(lineNumberForAnchor('abc', 0)).toBe(1);
  });
  it('offset 在第一行内返回 1', () => {
    expect(lineNumberForAnchor('abc\ndef', 3)).toBe(1);
  });
  it('offset 跨过第一个 \\n 返回 2', () => {
    expect(lineNumberForAnchor('abc\ndef', 4)).toBe(2);
  });
  it('多行多 \\n 累加', () => {
    expect(lineNumberForAnchor('a\nb\nc', 4)).toBe(3);
  });
  it('offset 等于 source.length 返回最后一行的行号', () => {
    expect(lineNumberForAnchor('a\nb\nc', 5)).toBe(3);
  });
  it('offset 为负 → null', () => {
    expect(lineNumberForAnchor('abc', -1)).toBeNull();
  });
  it('offset 越界 → null', () => {
    expect(lineNumberForAnchor('abc', 4)).toBeNull();
  });
});
