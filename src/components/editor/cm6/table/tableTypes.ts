import type { EditorView } from '@codemirror/view';

export type TableAlign = 'left' | 'center' | 'right';

export type TableAction =
  | { type: 'table-insert'; rows: number; cols: number }
  | { type: 'table-align'; align: TableAlign; colIndex?: number }
  | { type: 'table-row-insert'; after?: boolean }
  | { type: 'table-row-delete' }
  | { type: 'table-column-insert'; after?: boolean }
  | { type: 'table-column-delete' };

export type TableRange = {
  from: number;
  to: number;
  sepFrom: number;
  sepTo: number;
  headerFrom: number;
  headerTo: number;
  firstBodyLine: number;
  lastBodyLine: number;
  colCount: number;
  lineCount: number;
};

const SEP_LINE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/;
const PIPE_LINE = /^\s*\|.*\|\s*$/;

export function splitTableCells(text: string): string[] {
  const trimmed = text.replace(/^\s*\|/, '').replace(/\|\s*$/, '');
  return trimmed.includes('|') ? trimmed.split('|').map((cell) => cell.trim()) : [];
}

export function formatTableRow(cells: string[]): string {
  return `| ${cells.join(' | ')} |`;
}

export function findTableAt(view: EditorView, pos: number): TableRange | null {
  const doc = view.state.doc;
  const text = view.state.doc.toString();
  const lines = text.split('\n');

  // 单 pass 计算每行是否在 fenced code block 内(```/~~~ 行切换 open)。
  // inFence[i] = true 表示 lines[i] 处于 fence 内,不是 GFM 表的一部分。
  const fenceOpen: boolean[] = new Array(lines.length).fill(false);
  let open = false;
  const fenceRe = /^\s*(```|~~~)/;
  for (let i = 0; i < lines.length; i += 1) {
    if (fenceRe.test(lines[i])) open = !open;
    fenceOpen[i] = open;
  }

  const cursorLine = doc.lineAt(pos).number - 1;

  // 向上优先找 sep;落到 cell 内也能命中。
  let sepIdx = cursorLine;
  while (sepIdx >= 0 && (fenceOpen[sepIdx] || !SEP_LINE.test(lines[sepIdx]))) sepIdx -= 1;
  // 光标在表内(sep 行上方)时,向下兜底找一次。
  if (sepIdx < 0) {
    let down = cursorLine + 1;
    while (down < lines.length && (fenceOpen[down] || !SEP_LINE.test(lines[down]))) down += 1;
    if (down >= lines.length || fenceOpen[down]) return null;
    sepIdx = down;
  } else if (fenceOpen[sepIdx]) {
    return null;
  }
  if (sepIndex >= lines.length || fenceOpen[sepIndex]) return null;

  const headerLine = sepIdx - 1;
  if (headerLine < 0 || fenceOpen[headerLine] || !PIPE_LINE.test(lines[headerLine])) return null;
  const sepCols = pipeCount(lines[sepIdx]);
  const headerCols = pipeCount(lines[headerLine]);
  if (sepCols !== headerCols) return null;

  let endLine = sepIdx + 1;
  while (endLine < lines.length && !fenceOpen[endLine] && PIPE_LINE.test(lines[endLine])) {
    if (pipeCount(lines[endLine]) !== sepCols) {
      endLine -= 1;
      break;
    }
    endLine += 1;
  }
  const start = doc.line(headerIndex + 1);
  const end = doc.line(lastBodyLine + 1);
  const separator = doc.line(sepIndex + 1);
  return {
    from: start.from,
    to: end.to,
    sepFrom: separator.from,
    sepTo: separator.to,
    headerFrom: start.from,
    headerTo: start.to,
    firstBodyLine: sepIndex + 1,
    lastBodyLine,
    colCount,
    lineCount: lastBodyLine - headerIndex + 1,
  };
}
