import { describe, expect, it } from 'vitest';
import {
  deleteCol,
  deleteRow,
  insertCol,
  insertRow,
  setColAlign,
  setCellText,
} from './tableMutations';
import type { TableData } from './tableSerializer';

const base: TableData = {
  cells: [
    ['h1', 'h2'],
    ['a', 'b'],
    ['c', 'd'],
  ],
  colAligns: ['left', 'left'],
};

describe('insertRow', () => {
  it('inserts empty row before index', () => {
    const next = insertRow(base, 1);
    expect(next.cells).toEqual([
      ['h1', 'h2'],
      ['', ''],
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
});

describe('deleteRow', () => {
  it('deletes row at index', () => {
    const next = deleteRow(base, 2);
    expect(next.cells).toEqual([
      ['h1', 'h2'],
      ['a', 'b'],
    ]);
  });

  it('refuses to delete last row', () => {
    const small: TableData = { cells: [['a']], colAligns: ['left'] };
    expect(deleteRow(small, 0)).toBe(small);
  });
});

describe('insertCol', () => {
  it('inserts empty col before index', () => {
    const next = insertCol(base, 1);
    expect(next.cells).toEqual([
      ['h1', '', 'h2'],
      ['a', '', 'b'],
      ['c', '', 'd'],
    ]);
    expect(next.colAligns).toEqual(['left', 'left', 'left']);
  });
});

describe('deleteCol', () => {
  it('deletes col at index', () => {
    const next = deleteCol(base, 0);
    expect(next.cells).toEqual([
      ['h2'],
      ['b'],
      ['d'],
    ]);
    expect(next.colAligns).toEqual(['left']);
  });

  it('refuses to delete last col', () => {
    const small: TableData = { cells: [['a']], colAligns: ['left'] };
    expect(deleteCol(small, 0)).toBe(small);
  });
});

describe('setColAlign', () => {
  it('sets col align', () => {
    const next = setColAlign(base, 1, 'center');
    expect(next.colAligns).toEqual(['left', 'center']);
  });
});

describe('setCellText', () => {
  it('sets cell text', () => {
    const next = setCellText(base, 1, 0, 'A');
    expect(next.cells[1][0]).toBe('A');
  });
});
