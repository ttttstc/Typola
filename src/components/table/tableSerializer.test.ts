// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { escapeCell, parseTableFromIr, serializeTable, unescapeCell } from './tableSerializer';

function makeTableDom(html: string): HTMLTableElement {
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  return wrap.querySelector('table') as HTMLTableElement;
}

describe('escapeCell + unescapeCell', () => {
  it('roundtrips pipe character', () => {
    expect(unescapeCell(escapeCell('a|b|c'))).toBe('a|b|c');
  });

  it('roundtrips newline', () => {
    expect(unescapeCell(escapeCell('line1\nline2'))).toBe('line1\nline2');
  });

  it('escapes pipe to HTML entity-safe form', () => {
    expect(escapeCell('a|b')).toBe('a\\|b');
  });

  it('escapes newlines to <br>', () => {
    expect(escapeCell('line1\nline2')).toBe('line1<br>line2');
  });
});

describe('parseTableFromIr', () => {
  it('reads 2x2 pipe table IR DOM', () => {
    const table = makeTableDom(
      '<table>' +
        '<thead><tr><th data-type="table-cell">h1</th><th data-type="table-cell">h2</th></tr></thead>' +
        '<tbody><tr><td data-type="table-cell">a</td><td data-type="table-cell">b</td></tr></tbody>' +
        '</table>',
    );
    const data = parseTableFromIr(table);
    expect(data.cells).toEqual([
      ['h1', 'h2'],
      ['a', 'b'],
    ]);
    expect(data.colAligns).toEqual(['left', 'left']);
  });

  it('reads textAlign style as align', () => {
    const table = makeTableDom(
      '<table>' +
        '<thead><tr><th style="text-align:center">c</th><th style="text-align:right">r</th></tr></thead>' +
        '<tbody><tr><td>x</td><td>y</td></tr></tbody>' +
        '</table>',
    );
    const data = parseTableFromIr(table);
    expect(data.colAligns).toEqual(['center', 'right']);
  });
});

describe('serializeTable', () => {
  it('serializes 2x2 table with default left align', () => {
    const md = serializeTable({
      cells: [
        ['h1', 'h2'],
        ['a', 'b'],
      ],
      colAligns: ['left', 'left'],
    });
    expect(md).toBe(
      '| h1  | h2  |\n' +
      '| --- | --- |\n' +
      '| a   | b   |',
    );
  });

  it('escapes pipe character in cells (H1 regression guard)', () => {
    const md = serializeTable({
      cells: [
        ['a|b', 'c'],
        ['d', 'e'],
      ],
      colAligns: ['left', 'left'],
    });
    // 含 `|` 的 cell 必须转义成 `\\|`,不会造成列错乱。
    expect(md).toContain('a\\|b');
    expect(md).not.toContain('| a|b |');
  });

  it('escapes newline in cells (H2 regression guard)', () => {
    const md = serializeTable({
      cells: [
        ['line1\nline2', 'other'],
        ['x', 'y'],
      ],
      colAligns: ['left', 'left'],
    });
    // 含换行的 cell 必须转义成 <br>,不会切断 pipe table 行。
    expect(md).toContain('line1<br>line2');
    // 所有行以 `|` 开头、`|` 结尾,pipe 行不被 \n 切断。
    expect(md.split('\n').every((ln) => ln.startsWith('|') && ln.endsWith('|'))).toBe(true);
  });

  it('roundtrips through parseTableFromIr → serializeTable → serialize parse', () => {
    const table = makeTableDom(
      '<table>' +
        '<thead><tr><th data-type="table-cell">h1</th><th data-type="table-cell">h2|mixed</th></tr></thead>' +
        '<tbody><tr><td data-type="table-cell">ab</td><td data-type="table-cell">plain</td></tr></tbody>' +
        '</table>',
    );
    const data = parseTableFromIr(table);
    expect(data.cells).toEqual([
      ['h1', 'h2|mixed'],
      ['ab', 'plain'],
    ]);
    const md = serializeTable(data);
    // 含 `|` 的 cell 转义成 `\\|`,含 <br> 的还原文本在本样例不涉及。
    expect(md).toContain('h2\\|mixed');
    // 行数 = header + separator + data 行 = 3。
    expect(md.split('\n').length).toBe(3);
  });

  it('serializes with center/right align separators', () => {
    const md = serializeTable({
      cells: [
        ['col1', 'col2', 'col3'],
        ['a', 'b', 'c'],
      ],
      colAligns: ['left', 'center', 'right'],
    });
    expect(md).toBe(
      '| col1 | col2 | col3 |\n' +
      '| ---- | :--: | ---: |\n' +
      '| a    | b    | c    |',
    );
  });

  it('handles empty cells', () => {
    const md = serializeTable({
      cells: [
        ['', 'h'],
        ['', ''],
      ],
      colAligns: ['left', 'left'],
    });
    expect(md).toBe(
      '|     | h   |\n' +
      '| --- | --- |\n' +
      '|     |     |',
    );
  });
});
