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

const SEP_LINE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const PIPE_LINE = /^\s*\|.*\|\s*$/;

function isEscapedPipe(text: string, index: number): boolean {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === '\\'; cursor--) slashes++;
  return slashes % 2 === 1;
}

export function splitTableCells(text: string): string[] {
  const trimmed = text.trim();
  const start = trimmed.startsWith('|') ? 1 : 0;
  const end = trimmed.endsWith('|') && !isEscapedPipe(trimmed, trimmed.length - 1) ? trimmed.length - 1 : trimmed.length;
  const cells: string[] = [];
  let cell = '';
  for (let index = start; index < end; index++) {
    if (trimmed[index] === '|' && !isEscapedPipe(trimmed, index)) {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += trimmed[index];
    }
  }
  cells.push(cell.trim());
  return cells;
}

export function formatTableRow(cells: string[]): string {
  return `| ${cells.join(' | ')} |`;
}

export function tableCellPositionAt(view: EditorView, range: TableRange, rowIndex: number, colIndex: number): number | null {
  if (
    !Number.isInteger(rowIndex)
    || !Number.isInteger(colIndex)
    || rowIndex < 0
    || rowIndex >= range.lineCount - 1
    || colIndex < 0
    || colIndex >= range.colCount
  ) return null;
  const line = rowIndex === 0 ? view.state.doc.lineAt(range.headerFrom) : view.state.doc.line(range.firstBodyLine + rowIndex);
  let column = -1;
  for (let index = 0; index < line.text.length; index++) {
    if (line.text[index] !== '|' || isEscapedPipe(line.text, index)) continue;
    column++;
    if (column === colIndex) return line.from + Math.min(index + 1, line.text.length);
  }
  return null;
}

export function findTableAt(view: EditorView, pos: number): TableRange | null {
  const doc = view.state.doc;
  const lines = doc.toString().split('\n');
  const fenceOpen = lines.map(() => false);
  let open = false;
  for (let index = 0; index < lines.length; index++) {
    fenceOpen[index] = open;
    if (/^\s*(```|~~~)/.test(lines[index])) open = !open;
  }

  const cursorLine = doc.lineAt(pos).number - 1;
  let sepIndex = cursorLine;
  while (sepIndex >= 0 && (fenceOpen[sepIndex] || !SEP_LINE.test(lines[sepIndex]))) sepIndex--;
  if (sepIndex < 0) {
    sepIndex = cursorLine + 1;
    while (sepIndex < lines.length && (fenceOpen[sepIndex] || !SEP_LINE.test(lines[sepIndex]))) sepIndex++;
  }
  if (sepIndex >= lines.length || fenceOpen[sepIndex]) return null;

  const headerIndex = sepIndex - 1;
  if (headerIndex < 0 || fenceOpen[headerIndex] || !PIPE_LINE.test(lines[headerIndex])) return null;
  const colCount = splitTableCells(lines[sepIndex]).length;
  if (colCount === 0 || splitTableCells(lines[headerIndex]).length !== colCount) return null;

  let lastBodyLine = sepIndex;
  for (let index = sepIndex + 1; index < lines.length && !fenceOpen[index] && PIPE_LINE.test(lines[index]); index++) {
    if (splitTableCells(lines[index]).length !== colCount) break;
    lastBodyLine = index;
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
