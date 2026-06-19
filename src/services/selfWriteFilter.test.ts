import { describe, expect, it } from 'vitest';
import { filterSelfWritePaths, isSelfWritePath, type SelfWriteMark } from './selfWriteFilter';

describe('selfWriteFilter (P0-B 自写抑制)', () => {
  const NOW = 1_700_000_000_000;

  it('last.path 为空时永远不是自写', () => {
    const last: SelfWriteMark = { path: '', at: NOW - 100 };
    expect(isSelfWritePath('C:/foo.md', last, NOW)).toBe(false);
  });

  it('路径不匹配时不是自写', () => {
    const last: SelfWriteMark = { path: 'C:/foo.md', at: NOW - 100 };
    expect(isSelfWritePath('C:/bar.md', last, NOW)).toBe(false);
  });

  it('路径大小写 + 反斜杠归一化后仍匹配', () => {
    const last: SelfWriteMark = { path: 'C:\\Foo\\bar.md', at: NOW - 100 };
    expect(isSelfWritePath('c:/foo/BAR.md', last, NOW)).toBe(true);
  });

  it('1500ms 窗口内是自写', () => {
    const last: SelfWriteMark = { path: 'C:/foo.md', at: NOW - 1499 };
    expect(isSelfWritePath('C:/foo.md', last, NOW)).toBe(true);
  });

  it('1500ms 窗口外不是自写(>=1500 视为过期)', () => {
    const last: SelfWriteMark = { path: 'C:/foo.md', at: NOW - 1500 };
    expect(isSelfWritePath('C:/foo.md', last, NOW)).toBe(false);
  });

  it('filterSelfWritePaths 保留非自写路径,过滤掉自写路径', () => {
    const last: SelfWriteMark = { path: 'C:/self.md', at: NOW - 500 };
    const paths = ['C:/agent.md', 'C:/self.md', 'D:/other.md'];
    expect(filterSelfWritePaths(paths, last, NOW)).toEqual(['C:/agent.md', 'D:/other.md']);
  });

  it('filterSelfWritePaths 全部自写时返回空数组(handler 应直接 return)', () => {
    const last: SelfWriteMark = { path: 'C:/self.md', at: NOW - 500 };
    expect(filterSelfWritePaths(['C:/self.md'], last, NOW)).toEqual([]);
  });

  it('filterSelfWritePaths 空 paths 输入返空数组', () => {
    const last: SelfWriteMark = { path: 'C:/self.md', at: NOW - 500 };
    expect(filterSelfWritePaths([], last, NOW)).toEqual([]);
  });
});
