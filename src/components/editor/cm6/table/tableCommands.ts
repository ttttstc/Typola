import type { EditorView } from '@codemirror/view';
import { findTableAt, formatTableRow, splitTableCells, type TableAction, type TableAlign } from './tableTypes';

export const MAX_ROWS = 50;
export const MAX_COLS = 20;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

export function setColumnAlignment(view: EditorView, align: TableAlign, colIndex?: number): void {
  const range = findTableAt(view, view.state.selection.main.from);
  if (!range) return;
  const cells = splitTableCells(view.state.doc.sliceString(range.sepFrom, range.sepTo));
  const index = clamp(colIndex ?? columnIndexAt(view, range), 0, cells.length - 1);
  cells[index] = align === 'left' ? ':---' : align === 'center' ? ':---:' : '---:';
  replaceLine(view, range.sepFrom, range.sepTo, formatTableRow(cells));
}

export function insertTableRow(view: EditorView, after = true): void {
  const range = findTableAt(view, view.state.selection.main.from);
  if (!range) return;
  const row = formatTableRow(Array.from({ length: range.colCount }, () => 'cell'));
  if (range.lastBodyLine < range.firstBodyLine) {
    const at = view.state.doc.line(range.lastBodyLine + 1).to;
    view.dispatch({ changes: { from: at, insert: `\n${row}` }, selection: { anchor: at + 3 } });
    view.focus();
    return;
  }
  const current = view.state.doc.lineAt(view.state.selection.main.from).number - 1;
  const target = Math.max(range.firstBodyLine, Math.min(range.lastBodyLine, current));
  const at = view.state.doc.line((after ? target + 1 : target) + 1).from;
  view.dispatch({ changes: { from: at, insert: `${row}\n` }, selection: { anchor: at + 2 } });
  view.focus();
}

export function deleteTableRow(view: EditorView): void {
  const range = findTableAt(view, view.state.selection.main.from);
  if (!range || range.lastBodyLine < range.firstBodyLine) return;
  const current = view.state.doc.lineAt(view.state.selection.main.from).number - 1;
  if (current < range.firstBodyLine || current > range.lastBodyLine) return;
  const line = view.state.doc.line(current + 1);
  const to = current < range.lastBodyLine ? line.to + 1 : line.to;
  view.dispatch({ changes: { from: line.from, to }, selection: { anchor: line.from } });
  view.focus();
}

export function insertTableColumn(view: EditorView, after = true): void {
  const range = findTableAt(view, view.state.selection.main.from);
  if (!range || range.colCount >= MAX_COLS) return;
  const index = clamp(columnIndexAt(view, range) + (after ? 1 : 0), 0, range.colCount);
  rewriteColumns(view, range, (cells, line) => {
    cells.splice(index, 0, line === 0 ? 'Header' : line === 1 ? '---' : 'cell');
    return cells;
  });
}

export function deleteTableColumn(view: EditorView): void {
  const range = findTableAt(view, view.state.selection.main.from);
  if (!range || range.colCount <= 1) return;
  const index = clamp(columnIndexAt(view, range), 0, range.colCount - 1);
  rewriteColumns(view, range, (cells) => { cells.splice(index, 1); return cells; });
}

export function pasteTableData(view: EditorView, plain: string, html?: string): boolean {
  const rows = html ? htmlTableRows(html) : plainTableRows(plain);
  if (!rows || rows.length === 0 || rows.some((row) => row.length === 0)) return false;
  const width = Math.min(MAX_COLS, Math.max(...rows.map((row) => row.length)));
  const normalized = rows.slice(0, MAX_ROWS).map((row) => Array.from({ length: width }, (_, index) => escapeCell(row[index] ?? '')));
  const header = normalized[0].map((cell, index) => cell || `Header ${index + 1}`);
  const body = normalized.slice(1).map((row) => row.map((cell) => cell || 'cell'));
  const markdown = [formatTableRow(header), formatTableRow(header.map(() => '---')), ...body.map(formatTableRow)].join('\n');
  const selection = view.state.selection.main;
  view.dispatch({ changes: { from: selection.from, to: selection.to, insert: markdown }, selection: { anchor: selection.from + 2 } });
  view.focus();
  return true;
}

export function applyTableAction(view: EditorView, action: TableAction): void {
  switch (action.type) {
    case 'table-align': setColumnAlignment(view, action.align, action.colIndex); return;
    case 'table-row-insert': insertTableRow(view, action.after); return;
    case 'table-row-delete': deleteTableRow(view); return;
    case 'table-column-insert': insertTableColumn(view, action.after); return;
    case 'table-column-delete': deleteTableColumn(view); return;
  }
}

function replaceLine(view: EditorView, from: number, to: number, text: string): void {
  view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } });
  view.focus();
}

function columnIndexAt(view: EditorView, range: NonNullable<ReturnType<typeof findTableAt>>): number {
  const pos = view.state.selection.main.from;
  const line = view.state.doc.lineAt(pos);
  const cells = splitTableCells(line.text);
  if (cells.length !== range.colCount) return 0;
  const before = line.text.slice(0, Math.max(0, pos - line.from));
  return clamp(Math.max(0, before.split('|').length - 2), 0, range.colCount - 1);
}

function rewriteColumns(view: EditorView, range: NonNullable<ReturnType<typeof findTableAt>>, transform: (cells: string[], line: number) => string[]): void {
  const doc = view.state.doc;
  const changes = [];
  for (let lineNo = doc.lineAt(range.headerFrom).number - 1; lineNo <= range.lastBodyLine; lineNo++) {
    const line = doc.line(lineNo + 1);
    const cells = transform(splitTableCells(line.text), lineNo - (doc.lineAt(range.headerFrom).number - 1));
    changes.push({ from: line.from, to: line.to, insert: formatTableRow(cells) });
  }
  view.dispatch({ changes, selection: { anchor: range.from } });
  view.focus();
}

function plainTableRows(text: string): string[][] | null {
  const lines = text.trim().split(/\r?\n/u).filter(Boolean);
  if (lines.length === 0) return null;
  if (lines.some((line) => line.includes('\t'))) return lines.map((line) => line.split('\t'));
  if (lines.length > 1 && lines.every((line) => line.includes(','))) return lines.map(parseCsvLine);
  return null;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') { cell += '"'; index++; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { cells.push(cell); cell = ''; }
    else cell += char;
  }
  cells.push(cell);
  return cells;
}

function htmlTableRows(html: string): string[][] | null {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const rows = Array.from(document.querySelectorAll('tr')).map((row) => (
    Array.from(row.querySelectorAll('th,td')).map((cell) => cell.textContent?.trim() ?? '')
  )).filter((row) => row.length > 0);
  return rows.length > 0 ? rows : null;
}

function escapeCell(value: string): string {
  return value.replace(/\|/gu, '\\|').replace(/\r?\n/gu, '<br>');
}
