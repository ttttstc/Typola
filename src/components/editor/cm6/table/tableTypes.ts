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
