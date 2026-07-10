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
//
// 关键设计(新年检 #177 修复):
//  - **全文编辑不再走 editor.updateValue**。updateValue 在 IR 模式下是"把 Markdown 插入当前选区",
//    不是全文替换,会破坏正文。全文编辑必须走上层受控 onChange → editor.setValue + IR 重渲染。
//  - **定位表格用 Lute 自身的序列化**。自己手写的 pipe table serializer 与 Vditor/Lute
//    输出的 Markdown 格式不一致 (分隔行宽度、转义细节),无法定位。我们改用
//    `vditor.lute.VditorIRDOM2Md(tableParent.innerHTML)` 得到与 getValue() 同源的字符串做定位。
//  - **对齐由 `align` 属性读取**,而非 `style.textAlign`。IR DOM 实际使用 `align="center/right"`
//    保存对齐,`style.textAlign` 只在用户通过 CSS 设置时才会出现。我们 `align` + style 双兼容。

import type Vditor from 'vditor';

export type Align = 'left' | 'center' | 'right';

export interface TableData {
  /** 行优先;每行等长(不含分隔行)。 */
  cells: string[][];
  /** 每列对齐,与 cells[0] 等长。 */
  colAligns: Align[];
}

/** 编辑操作函数类型:输入 TableData,返回新 TableData。纯函数。 */
export type IrMutate = (data: TableData) => TableData;

function parseAlign(el: HTMLElement): Align {
  // IR DOM 对齐保存在 `align` 属性,style.textAlign 作为兜底。
  const attr = el.getAttribute('align');
  if (attr === 'center' || attr === 'right' || attr === 'left') return attr;
  const style = el.style.textAlign;
  return style === 'center' ? 'center' : style === 'right' ? 'right' : 'left';
}

/** 从 IR DOM 的 `<table>` 元素读 table 结构。 */
export function parseTableFromIr(tableEl: HTMLTableElement): TableData {
  const rows = Array.from(tableEl.querySelectorAll(':scope > thead > tr, :scope > tbody > tr'));
  const cells: string[][] = [];
  for (const row of rows) {
    const rowCells = Array.from(row.querySelectorAll(':scope > th, :scope > td'));
    cells.push(rowCells.map((c) => unescapeCell(c.textContent ?? '')));
  }
  const firstRow = rows[0];
  const colAligns: Align[] = [];
  if (firstRow) {
    const rowCells = Array.from(firstRow.querySelectorAll(':scope > th, :scope > td'));
    for (const c of rowCells) {
      colAligns.push(parseAlign(c as HTMLElement));
    }
  }
  return { cells, colAligns };
}

/** 把单个 cell 文本中的 `\|` 反义回 `|`、`<br>` 反义回 `\\n`。 */
export function unescapeCell(s: string): string {
  return s
    .split('<br>')
    .join('\n')
    .split('\\|')
    .join('|')
    .split('<br/>')
    .join('\n')
    .split('<br />')
    .join('\n');
}

/** 把单个 cell 原始文本中 `|` 以及换行义成 IR 安全的形式。 */
export function escapeCell(s: string): string {
  return s
    .split('|')
    .join('\\|')
    .split('\n')
    .join('<br>');
}

/** 把 `string[][]` 序列化为 pipe table Markdown source。 */
export function serializeTable(data: TableData): string {
  const { cells, colAligns } = data;
  if (cells.length === 0) return '';
  const colCount = cells[0].length;
  const widths: number[] = new Array(colCount).fill(3);
  for (const row of cells) {
    for (let c = 0; c < colCount; c += 1) {
      const w = escapeCell(row[c] ?? '').length;
      if (w > widths[c]) widths[c] = w;
    }
  }
  widths.forEach((w, idx) => {
    if (w < 3) widths[idx] = 3;
  });
  const formatRow = (row: string[]): string =>
    '| ' + row.map((cell, c) => escapeCell(cell).padEnd(widths[c], ' ')).join(' | ') + ' |';
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

// Lute 引用类型:我们只用一个极小的子集。
interface LuteMdFn {
  VditorIRDOM2Md: (html: string) => string;
}

/** 取 Vditor 内置的 Lute 引用,用于把 IR DOM 片段转成 Markdown source。 */
function getLute(editor: Vditor): LuteMdFn | null {
  const lute = (editor as unknown as { lute?: LuteMdFn }).lute;
  return lute ?? null;
}

/** 取 Vditor IR 顶层容器。 */
function getIrElement(editor: Vditor): HTMLElement | null {
  return (editor as unknown as { vditor?: { ir?: { element?: HTMLElement } } }).vditor?.ir?.element ?? null;
}

/**
 * 把 table 编辑操作的结果提交给上层受控 state。
 *  - 不使用 hand-rolled serializeTable 定位,而是:
 *    1. 用 Lute `VditorIRDOM2Md(tableParent.innerHTML)` 得到当前表格的 Markdown 字符串
 *       (与 editor.getValue() 同源,格式必然一致)
 *    2. 用 `indexOf` 在全文中定位这次 Lute 生成的片段
 *    3. 把片段替换成 hand-rolled serializeTable 输出的新 pipe table
 *  - 返回 null 表示定位失败(多相同 table 时无法唯一定位) → 拒绝操作,不清空正文。
 */
export function computeLuteTableSource(
  editor: Vditor,
  tableParentHtml: string,
  next: TableData,
): string | null {
  const lute = getLute(editor);
  if (!lute) {
    console.warn('[tableSubmenu] lute unavailable; abort');
    return null;
  }
  const irEl = getIrElement(editor);
  if (!irEl) return null;
  const fullMarkdown = lute.VditorIRDOM2Md(irEl.innerHTML);
  const oldTableMd = lute.VditorIRDOM2Md(tableParentHtml);
  const newTableMd = serializeTable(next);
  const idx = fullMarkdown.indexOf(oldTableMd);
  if (idx < 0 || fullMarkdown.indexOf(oldTableMd, idx + oldTableMd.length) !== -1) {
    console.warn('[tableSubmenu] table source is missing or ambiguous (Lute); abort');
    return null;
  }
  return fullMarkdown.slice(0, idx) + newTableMd + fullMarkdown.slice(idx + oldTableMd.length);
}

/** 读取 IR 顶层 table div 在 Lute 全文 Markdown 中对应片段,并用 serializeTable(next) 替代。 */
export function spliceTableSource(
  editor: Vditor,
  tableParentHtml: string,
  next: TableData,
): string | null {
  return computeLuteTableSource(editor, tableParentHtml, next);
}
