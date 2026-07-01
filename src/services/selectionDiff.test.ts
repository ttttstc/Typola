import { describe, expect, it } from 'vitest';
import { buildInlineDiffParts } from './selectionDiff';

describe('buildInlineDiffParts', () => {
  it('returns equal part when text is unchanged', () => {
    expect(buildInlineDiffParts('abc', 'abc')).toEqual([{ type: 'equal', text: 'abc' }]);
  });

  it('marks inserted and deleted text', () => {
    expect(buildInlineDiffParts('你好世界', '你好新世界')).toEqual([
      { type: 'equal', text: '你好' },
      { type: 'insert', text: '新' },
      { type: 'equal', text: '世界' },
    ]);
  });

  it('keeps deletion visible', () => {
    const parts = buildInlineDiffParts('代码资产', '资产');
    expect(parts).toContainEqual({ type: 'delete', text: '代码' });
    expect(parts).toContainEqual({ type: 'equal', text: '资产' });
  });

  it('falls back for very large inputs', () => {
    const original = 'a'.repeat(3000);
    const revised = 'b'.repeat(3000);
    expect(buildInlineDiffParts(original, revised)).toEqual([
      { type: 'delete', text: original },
      { type: 'insert', text: revised },
    ]);
  });
});
