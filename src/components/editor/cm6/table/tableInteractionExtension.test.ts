import { describe, expect, it } from 'vitest';
import { translateTableMenuLabel } from './tableInteractionExtension';

describe('translateTableMenuLabel', () => {
  it.each([
    ['Sort by column (A-Z)', '按列排序（A-Z）'],
    ['Align center', '居中对齐'],
    ['Add row below', '在下方插入行'],
    ['Move column left', '向左移动列'],
    ['Duplicate row', '复制行'],
    ['Clear column', '清空列'],
    ['Delete row', '删除行'],
  ])('translates %s', (source, expected) => {
    expect(translateTableMenuLabel('zh-CN', source)).toBe(expected);
  });

  it('keeps the upstream label for non-Chinese locales', () => {
    expect(translateTableMenuLabel('en-US', 'Align center')).toBe('Align center');
  });
});
