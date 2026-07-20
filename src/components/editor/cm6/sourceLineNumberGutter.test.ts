import { describe, expect, it } from 'vitest';
import { shouldShowSourceLineNumber, sourceLineNumbers } from './sourceLineNumberGutter';

describe('shouldShowSourceLineNumber', () => {
  it('每一行都显示源码行号', () => {
    expect(shouldShowSourceLineNumber('# 标题', undefined)).toBe(true);
    expect(shouldShowSourceLineNumber('新段落', '')).toBe(true);
    expect(shouldShowSourceLineNumber('续写内容', '上一行内容')).toBe(true);
    expect(shouldShowSourceLineNumber('## 标题', '上一段')).toBe(true);
    expect(shouldShowSourceLineNumber('   ', '上一段')).toBe(true);
  });

  it('返回文档中的全部源码行', () => {
    expect([...sourceLineNumbers([
      '```md',
      '# 代码中的标题',
      '- 代码中的列表',
      '```',
      '',
      '正文',
    ].join('\n'))]).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
