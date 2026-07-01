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

  it('falls back for very large inputs while preserving shared edges', () => {
    const original = `start\n${'a'.repeat(3000)}\nend`;
    const revised = `start\n${'b'.repeat(3000)}\nend`;
    expect(buildInlineDiffParts(original, revised)).toEqual([
      { type: 'equal', text: 'start\n' },
      { type: 'delete', text: 'a'.repeat(3000) },
      { type: 'insert', text: 'b'.repeat(3000) },
      { type: 'equal', text: '\nend' },
    ]);
  });

  it('keeps emoji as a complete character', () => {
    const parts = buildInlineDiffParts('发布 🎉 成功', '发布 成功');
    expect(parts).toContainEqual({ type: 'delete', text: '🎉 ' });
  });

  it('handles CRLF text without dropping line breaks', () => {
    expect(buildInlineDiffParts('第一行\r\n第二行', '第一行\r\n新第二行')).toEqual([
      { type: 'equal', text: '第一行\r\n' },
      { type: 'insert', text: '新' },
      { type: 'equal', text: '第二行' },
    ]);
  });
});
