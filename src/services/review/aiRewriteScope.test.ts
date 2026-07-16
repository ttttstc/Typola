import { describe, expect, it } from 'vitest';
import { analyzeMarkdown } from '../markdownAnalysisService';
import { isHighImpactRewrite, resolveAIRewriteScope } from './aiRewriteScope';

const source = '# 第一章\n\n第一段。\n\n## 第二节\n\n第二段。\n';

describe('AI 改稿范围', () => {
  it('按当前章节返回完整章节范围', () => {
    const sections = analyzeMarkdown(source).foldSections;
    const scope = resolveAIRewriteScope(source, 'section', null, sections, 1);
    expect(scope.label).toContain('第二节');
    expect(scope.anchorText).toContain('第二段');
    expect(scope.anchorText).not.toContain('第一段');
  });

  it('WYSIWYG 选区坐标不可用时按唯一文本恢复', () => {
    const scope = resolveAIRewriteScope(
      source,
      'selection',
      { text: '第二段。', from: 0, to: 4 },
      analyzeMarkdown(source).foldSections,
      0,
    );
    expect(scope.anchorText).toBe('第二段。');
  });

  it('只把结构性重写识别为高影响操作', () => {
    expect(isHighImpactRewrite('全文润色一下，语气自然')).toBe(false);
    expect(isHighImpactRewrite('重写全文并重组章节')).toBe(true);
  });
});
