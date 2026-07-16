import { describe, expect, it } from 'vitest';
import {
  EMPTY_REVIEW_STATE,
  addAIReviewComment,
  addReviewComment,
  buildReviewMarkdown,
  getActiveReviewComments,
  parseReviewMarkdown,
  setReviewCommentIgnored,
} from './reviewState';
import type { SelectionAnchor } from '../agent/types';

function anchor(originalText: string, from = 0): SelectionAnchor {
  return {
    filePath: 'a.md',
    from,
    to: from + originalText.length,
    originalText,
  };
}

describe('统一检视意见模型', () => {
  it('人工意见不要求类型,AI 意见保留来源和检视依据', () => {
    const human = addReviewComment(EMPTY_REVIEW_STATE, 'a.md', anchor('原文'), '人工意见');
    const mixed = addAIReviewComment(
      human,
      'a.md',
      anchor('另一段'),
      'AI 意见',
      { kind: 'style', label: 'style.md' },
    );

    expect(mixed.comments[0]).toMatchObject({ source: 'human', status: 'active' });
    expect(mixed.comments[0]).not.toHaveProperty('type');
    expect(mixed.comments[1]).toMatchObject({
      source: 'ai',
      status: 'active',
      basis: { kind: 'style', label: 'style.md' },
    });
  });

  it('忽略意见可恢复,默认活动列表不包含忽略项', () => {
    const added = addReviewComment(EMPTY_REVIEW_STATE, 'a.md', anchor('原文'), '改短');
    const id = added.comments[0].id;
    const ignored = setReviewCommentIgnored(added, id, true);

    expect(ignored.comments[0].status).toBe('ignored');
    expect(getActiveReviewComments(ignored.comments)).toEqual([]);

    const restored = setReviewCommentIgnored(ignored, id, false);
    expect(restored.comments[0].status).toBe('active');
    expect(getActiveReviewComments(restored.comments)).toHaveLength(1);
  });
});

describe('检视版往返识别', () => {
  it('忽略意见不进入导出内容', () => {
    let state = addReviewComment(EMPTY_REVIEW_STATE, 'a.md', anchor('正文段落。'), '保留这条');
    state = addReviewComment(state, 'a.md', anchor('正文段落。'), '忽略这条');
    state = setReviewCommentIgnored(state, state.comments[1].id, true);

    const exported = buildReviewMarkdown('正文段落。', state.comments);
    expect(exported).toContain('保留这条');
    expect(exported).not.toContain('忽略这条');
  });

  it('导出写入不可见版本化元数据,重新打开可恢复人工和 AI 意见', () => {
    const source = '第一段。\n\n第二段。';
    let state = addReviewComment(EMPTY_REVIEW_STATE, 'a.md', anchor('第一段。'), '人工意见');
    state = addAIReviewComment(
      state,
      'a.md',
      anchor('第二段。', 6),
      'AI 意见',
      { kind: 'skill', label: '精炼表达' },
    );

    const exported = buildReviewMarkdown(source, state.comments);
    expect(exported).toContain('<!-- typola-review-document:v1 -->');
    expect(exported).toContain('<!-- typola-review:v2:');
    expect(exported).not.toContain('%E6');

    const parsed = parseReviewMarkdown(exported, 'a-检视版1.md');
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({
      filePath: 'a-检视版1.md',
      source: 'human',
      status: 'active',
      text: '人工意见',
    });
    expect(parsed[1]).toMatchObject({
      filePath: 'a-检视版1.md',
      source: 'ai',
      basis: { kind: 'skill', label: '精炼表达' },
      text: 'AI 意见',
    });
    expect(parsed[1].anchor.filePath).toBe('a-检视版1.md');
  });

  it('兼容旧版 URL 编码元数据', () => {
    const legacy = encodeURIComponent(JSON.stringify({
      version: 1,
      id: 'legacy',
      anchor: anchor('原文'),
      text: '旧意见',
      createdAt: 1,
      source: 'human',
      status: 'active',
    })).replace(/-/g, '%2D');
    const source = `<!-- typola-review-document:v1 -->\n<!-- typola-review:v1:${legacy} -->`;

    expect(parseReviewMarkdown(source, 'legacy.md')).toEqual([expect.objectContaining({
      id: 'legacy',
      filePath: 'legacy.md',
      text: '旧意见',
    })]);
  });

  it('损坏或伪造的元数据不会让整个检视版解析失败', () => {
    const source = '<!-- typola-review-document:v1 -->\n<!-- typola-review:v1:not-json -->';
    expect(parseReviewMarkdown(source, 'broken.md')).toEqual([]);
  });

  it('导出时按当前正文重新计算锚点和 Markdown 行号', () => {
    const state = addReviewComment(
      EMPTY_REVIEW_STATE,
      'a.md',
      anchor('目标段落。', 0),
      '检查这里',
    );
    const source = '新增段落。\n\n目标段落。';
    const exported = buildReviewMarkdown(source, state.comments);
    const parsed = parseReviewMarkdown(exported, 'a-检视版1.md');

    expect(exported).toContain('第 3 行');
    expect(parsed[0].anchor.from).toBe(source.indexOf('目标段落。'));
  });
});
