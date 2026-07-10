// Vditor IR 表格编辑 —— 纯函数 mutate `string[][]`。
//
// 所有函数都是纯函数:输入 TableData,返回新 TableData,不修改原对象。
// 上层 React 组件拿到新 TableData 后调用 `serializeTable` → `editor.updateValue`。

import type { Align, TableData } from './tableSerializer';

export type { TableData } from './tableSerializer';

/** 在 rowIdx 前插入一行空单元格(默认 '')。返回新 TableData。 */
export function insertRow(data: TableData, rowIdx: number): TableData {
  const colCount = data.cells[0]?.length ?? 0;
  const newRow = new Array(colCount).fill('');
  const cells = [...data.cells.slice(0, rowIdx), newRow, ...data.cells.slice(rowIdx)];
  return { cells, colAligns: [...data.colAligns] };
}

/** 删除 rowIdx 行。若删后行数 < 1 则返回原数据(禁删最后一行)。 */
export function deleteRow(data: TableData, rowIdx: number): TableData {
  if (data.cells.length <= 1) return data;
  const cells = data.cells.filter((_, i) => i !== rowIdx);
  return { cells, colAligns: [...data.colAligns] };
}

/** 在 colIdx 前插入一列。返回新 TableData。 */
export function insertCol(data: TableData, colIdx: number): TableData {
  const cells = data.cells.map((row) => [...row.slice(0, colIdx), '', ...row.slice(colIdx)]);
  const colAligns: Align[] = [...data.colAligns.slice(0, colIdx), 'left', ...data.colAligns.slice(colIdx)];
  return { cells, colAligns };
}

/** 删除 colIdx 列。若删后列数 < 1 则返回原数据(禁删最后一列)。 */
export function deleteCol(data: TableData, colIdx: number): TableData {
  if ((data.cells[0]?.length ?? 0) <= 1) return data;
  const cells = data.cells.map((row) => row.filter((_, i) => i !== colIdx));
  const colAligns = data.colAligns.filter((_, i) => i !== colIdx);
  return { cells, colAligns };
}

/** 改某一列的对齐。 */
export function setColAlign(data: TableData, colIdx: number, align: Align): TableData {
  const colAligns = [...data.colAligns];
  colAligns[colIdx] = align;
  return { cells: data.cells.map((r) => [...r]), colAligns };
}

/** 改某个单元格的文本。 */
export function setCellText(data: TableData, rowIdx: number, colIdx: number, text: string): TableData {
  const cells = data.cells.map((r) => [...r]);
  cells[rowIdx][colIdx] = text;
  return { cells, colAligns: [...data.colAligns] };
}
