import type { EditorView } from '@codemirror/view';
import { insertEmptyMarkdownTable } from 'codemirror-markdown-tables';
import { MAX_COLS, MAX_ROWS } from '../../components/editor/cm6/table/tableCommands';

type TableInsertAction = { type: 'table-insert'; rows: number; cols: number };

export function applyTableFormat(view: EditorView, action: TableInsertAction): void {
  const rows = Math.max(2, Math.min(MAX_ROWS, Math.floor(action.rows)));
  const cols = Math.max(1, Math.min(MAX_COLS, Math.floor(action.cols)));
  insertEmptyMarkdownTable({ size: { rows, cols } })(view);
}
