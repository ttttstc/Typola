import { describe, expect, it } from 'vitest';
import { parseAIReviewFindings, resolveAIReviewAnchor, resolveStoredReviewAnchor } from './aiReviewResult';

describe('aiReviewResult', () => {
  it('只接受最小且合法的 AI 检视结果', () => {
    expect(parseAIReviewFindings(JSON.stringify({ comments: [
      { originalText: '原句', text: '存在重复论证', prefixHint: '前文' },
      { originalText: '', text: '无锚点' },
      { originalText: '缺意见' },
    ] }))).toEqual([{ originalText: '原句', text: '存在重复论证', prefixHint: '前文' }]);
  });

  it('只在文本锚点可唯一恢复时创建意见位置', () => {
    expect(resolveAIReviewAnchor('前文原句\n后文', 'a.md', {
      originalText: '原句', prefixHint: '前文', text: '意见',
    })).toEqual(expect.objectContaining({ filePath: 'a.md', from: 2, to: 4 }));
    expect(resolveAIReviewAnchor('重复 重复', 'a.md', {
      originalText: '重复', text: '意见',
    })).toBeNull();
  });

  it('保存位置仍匹配时优先跳到原始坐标，避免重复文本失去跳转能力', () => {
    const source = '重复文本\n中间内容\n重复文本';
    expect(resolveStoredReviewAnchor(source, 'a.md', {
      filePath: 'a.md', from: 10, to: 14, originalText: '重复文本',
    })).toEqual(expect.objectContaining({ from: 10, to: 14 }));
  });

  it('区分没有问题和无效结果', () => {
    expect(parseAIReviewFindings('{"comments":[]}')).toEqual([]);
    expect(parseAIReviewFindings('```json\n{"comments":[]}\n```')).toEqual([]);
    expect(() => parseAIReviewFindings('not-json')).toThrow('不是合法 JSON');
    expect(() => parseAIReviewFindings('{}')).toThrow('缺少 comments');
  });
});
