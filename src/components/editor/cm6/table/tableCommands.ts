import type { EditorView } from '@codemirror/view';
import { findTableAt, type TableAction, type TableAlign } from './tableTypes';

const MIN_ROWS = 2;
const MIN_COLS = 1;
const MAX_ROWS = 50;
const MAX_COLS = 20;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function normalInsert(rows: number, cols: number): { header: string; sep: string; body: string } {
  const r = clamp(Math.floor(rows), MIN_ROWS, MAX_ROWS);
  const c = clamp(Math.floor(cols), MIN_COLS, MAX_COLS);
  const headerCells = Array.from({ length: c }, (_, i) => `Header ${i + 1}`);
  const sepCells = Array.from({ length: c }, () => '---');
  const bodyCells = Array.from({ length: c }, () => 'cell');
  const header = `| ${headerCells.join(' | ')} |`;
  const sep = `| ${sepCells.join(' | ')} |`;
  const body = Array.from({ length: r - 1 }, () => `| ${bodyCells.join(' | ')} |`).join('\n');
  return { header, sep, body };
}

export function insertTable(view: EditorView, rows: number, cols: number): void {
  const sel = view.state.selection.main;
  const cur = view.state.doc.lineAt(sel.from);
  const prevChar = cur.from === 0 ? '\n' : view.state.sliceDoc(cur.from - 1, cur.from);
  const prefix = prevChar === '\n' ? '' : '\n\n';

  const { header, sep, body } = normalInsert(rows, cols);
  const table = `${header}\n${sep}\n${body}\n`;

  view.dispatch({
    changes: { from: cur.from, insert: `${prefix}${table}` },
    selection: { anchor: cur.from + prefix.length + table.length },
  });
  view.focus();
}

function alignmentMark(align: TableAlign): string {
  switch (align) {
    case 'left':
      return ':---';
    case 'center':
      return ':---:';
    case 'right':
      return '---:';
  }
}

function splitSepCells(text: string): string[] {
  const trimmed = text.replace(/^\s*\|/, '').replace(/\|\s*$/, '');
  if (!trimmed.includes('|')) return [];
  return trimmed.split('|').map((c) => c.trim());
}

export function setColumnAlignment(
  view: EditorView,
  align: TableAlign,
  colIndex?: number,
): void {
  const range = findTableAt(view, view.state.selection.main.from);
  if (!range) return;

  const sepText = view.state.sliceDoc(range.sepFrom, range.sepTo);
  const cells = splitSepCells(sepText);
  if (cells.length === 0) return;

  const idx = clamp(colIndex ?? 0, 0, cells.length - 1);
  const next = cells
    .map((cell, i) => (i === idx ? alignmentMark(align) : cell))
    .join(' | ');

  const replacement = `| ${next} |`;

  view.dispatch({
    changes: { from: range.sepFrom, to: range.sepTo, insert: replacement },
    selection: { anchor: range.sepFrom + replacement.length },
  });
  view.focus();
}

export function applyTableAction(view: EditorView, action: TableAction): void {
  switch (action.type) {
    case 'table-insert':
      insertTable(view, action.rows, action.cols);
      return;
    case 'table-align':
      setColumnAlignment(view, action.align, action.colIndex);
      return;
  }
}
