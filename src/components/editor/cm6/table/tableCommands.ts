import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

export const MAX_ROWS = 50;
export const MAX_COLS = 20;

function tableNodeAt(state: EditorState, pos: number) {
  const tree = syntaxTree(state);
  let node = tree.resolveInner(Math.max(0, Math.min(pos, state.doc.length)), 1);
  while (node.parent && node.name !== 'Table') node = node.parent;
  if (node.name === 'Table') return node;
  if (pos <= 0) return null;
  node = tree.resolveInner(pos - 1, -1);
  while (node.parent && node.name !== 'Table') node = node.parent;
  return node.name === 'Table' ? node : null;
}

export function selectedMarkdownTable(state: EditorState): { from: number; to: number } | null {
  const range = state.selection.main;
  if (range.empty) return null;
  const node = tableNodeAt(state, range.from);
  return node && node.from === range.from && node.to === range.to ? { from: node.from, to: node.to } : null;
}

export function markdownTableBeforeCursor(state: EditorState): { from: number; to: number } | null {
  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  if (line.from !== pos) return null;
  const node = tableNodeAt(state, Math.max(0, pos - 1));
  if (!node || !/^\n+$/u.test(state.doc.sliceString(node.to, pos))) return null;
  return { from: node.from, to: node.to };
}

export function deleteMarkdownTableAt(view: EditorView, pos: number): boolean {
  const node = tableNodeAt(view.state, pos);
  if (!node) return false;

  const doc = view.state.doc;
  let from = node.from;
  let to = node.to;
  while (from > 0 && doc.sliceString(from - 1, from) === '\n') from -= 1;
  while (to < doc.length && doc.sliceString(to, to + 1) === '\n') to += 1;
  const insert = from > 0 && to < doc.length ? '\n\n' : '';
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + insert.length },
  });
  view.focus();
  return true;
}
export function pasteTableData(view: EditorView, plain: string, html?: string): boolean {
  const rows = html ? htmlTableRows(html) : plainTableRows(plain);
  if (!rows || rows.length === 0 || rows.some((row) => row.length === 0)) return false;
  const width = Math.min(MAX_COLS, Math.max(...rows.map((row) => row.length)));
  const normalized = rows.slice(0, MAX_ROWS).map((row) => Array.from({ length: width }, (_, index) => escapeCell(row[index] ?? '')));
  const header = normalized[0].map((cell, index) => cell || `Header ${index + 1}`);
  const body = normalized.slice(1).map((row) => row.map((cell) => cell || 'cell'));
  const formatRow = (cells: string[]) => `| ${cells.join(' | ')} |`;
  const markdown = [formatRow(header), formatRow(header.map(() => '---')), ...body.map(formatRow)].join('\n');
  const selection = view.state.selection.main;
  view.dispatch({ changes: { from: selection.from, to: selection.to, insert: markdown }, selection: { anchor: selection.from + 2 } });
  view.focus();
  return true;
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
