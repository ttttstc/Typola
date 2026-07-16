import { describe, expect, it } from 'vitest';
import { blockStartLineNumbers, shouldShowBlockLineNumber } from './sourceLineNumberGutter';

describe('shouldShowBlockLineNumber', () => {
  it('首个非空行和空行后的正文显示源码行号', () => {
    expect(shouldShowBlockLineNumber('# 标题', undefined)).toBe(true);
    expect(shouldShowBlockLineNumber('新段落', '')).toBe(true);
  });

  it('普通段落的连续源码行不重复显示', () => {
    expect(shouldShowBlockLineNumber('续写内容', '上一行内容')).toBe(false);
  });

  it('标题、列表、引用和围栏即使紧邻上一块也显示', () => {
    expect(shouldShowBlockLineNumber('## 标题', '上一段')).toBe(true);
    expect(shouldShowBlockLineNumber('- 列表项', '上一段')).toBe(true);
    expect(shouldShowBlockLineNumber('> 引用', '上一段')).toBe(true);
    expect(shouldShowBlockLineNumber('```ts', '上一段')).toBe(true);
  });

  it('空行本身不显示', () => {
    expect(shouldShowBlockLineNumber('   ', '上一段')).toBe(false);
  });

  it('围栏代码只显示起始行，不把内部伪块和闭合围栏当作块起点', () => {
    expect([...blockStartLineNumbers([
      '```md',
      '# 代码中的标题',
      '- 代码中的列表',
      '```',
      '',
      '正文',
    ].join('\n'))]).toEqual([1, 6]);
  });

  it('连续引用和表格只显示各自块的第一行', () => {
    expect([...blockStartLineNumbers([
      '> 引用第一行',
      '> 引用第二行',
      '',
      '| A | B |',
      '| - | - |',
    ].join('\n'))]).toEqual([1, 4]);
  });
});
