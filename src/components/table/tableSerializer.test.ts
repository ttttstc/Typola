// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseTableFromIr, serializeTable } from './tableSerializer';

function makeTableDom(html: string): HTMLTableElement {
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  return wrap.querySelector('table') as HTMLTableElement;
}

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
