// Vditor IR 表格序列化 / 反序列化 —— 纯函数,不依赖 React。
//
// Vditor IR 把 markdown pipe table 渲染为:
//   <div data-type="table" data-block="0">
//     <table data-type="table">
//       <thead data-type="table-header">
//         <tr data-type="table-row">
//           <th data-type="table-cell" data-colwidth="100">header</th>
//         </tr>
//       </thead>
//       <tbody data-type="table-body">
//         <tr data-type="table-row">
//           <td data-type="table-cell">cell</td>
//         </tr>
//       </tbody>
//     </table>
//   </div>
//
// 本模块把 IR DOM 读成 `string[][]` + `colAligns: Align[]`,再反序列化为 pipe table Markdown source。
// 所有表格编辑操作都走 `string[][]` → mutate → `serializeTable` → `editor.updateValue(newSource)` 管线。

export type Align = 'left' | 'center' | 'right';

export interface TableData {
  /** 行优先;每行等长(不含分隔行)。 */
  cells: string[][];
  /** 每列对齐,与 cells[0] 等长。 */
  colAligns: Align[];
}

/** 从 IR DOM 的 `<table>` 元素读 table 结构。 */
export function parseTableFromIr(tableEl: HTMLTableElement): TableData {
  const rows = Array.from(tableEl.querySelectorAll(':scope > thead > tr, :scope > tbody > tr'));
  const cells: string[][] = [];
  for (const row of rows) {
    const rowCells = Array.from(row.querySelectorAll(':scope > th, :scope > td'));
    cells.push(rowCells.map((c) => (c.textContent ?? '').replace(/\s+$/, '')));
  }
  // 对齐:从每个 th/td 的 style.textAlign 推断。
  const firstRow = rows[0];
  const colAligns: Align[] = [];
  if (firstRow) {
    const rowCells = Array.from(firstRow.querySelectorAll(':scope > th, :scope > td'));
    for (const c of rowCells) {
      const style = (c as HTMLElement).style.textAlign;
      colAligns.push(style === 'center' ? 'center' : style === 'right' ? 'right' : 'left');
    }
  }
  return { cells, colAligns };
}

/** 把 `string[][]` 序列化为 pipe table Markdown source。 */
export function serializeTable(data: TableData): string {
  const { cells, colAligns } = data;
  if (cells.length === 0) return '';
  const colCount = cells[0].length;
  // 每列最小宽度 3(留 `---`),header 行按实际 cell 长度。
  const widths: number[] = new Array(colCount).fill(3);
  for (const row of cells) {
    for (let c = 0; c < colCount; c += 1) {
      const w = (row[c] ?? '').length;
      if (w > widths[c]) widths[c] = w;
    }
  }
  // 分隔行最少保留 3 个 '-' 并与列对齐匹配
  widths.forEach((w, idx) => {
    if (w < 3) widths[idx] = 3;
  });
  const formatRow = (row: string[]): string =>
    '| ' + row.map((cell, c) => cell.padEnd(widths[c], ' ')).join(' | ') + ' |';
  const sepRow = colAligns.map((a, c) => {
    const w = widths[c];
    if (a === 'center') return ':' + '-'.repeat(Math.max(1, w - 2)) + ':';
    if (a === 'right') return '-'.repeat(Math.max(1, w - 1)) + ':';
    return '-'.repeat(w);
  });
  const sepLine = '| ' + sepRow.map((s) => s.padEnd(3, ' ')).join(' | ') + ' |';
  const lines: string[] = [];
  lines.push(formatRow(cells[0]));
  lines.push(sepLine);
  for (let r = 1; r < cells.length; r += 1) {
    lines.push(formatRow(cells[r]));
  }
  return lines.join('\n');
}
