import type { EditorView } from '@codemirror/view';
import { insertEmptyMarkdownTable } from 'codemirror-markdown-tables';
import type { TableAction } from '../../components/editor/cm6/table/tableTypes';
import { applyTableAction, MAX_COLS, MAX_ROWS } from '../../components/editor/cm6/table/tableCommands';

export function applyTableFormat(view: EditorView, action: TableAction): void {
  if (action.type === 'table-insert') {
    const rows = Math.max(2, Math.min(MAX_ROWS, Math.floor(action.rows)));
    const cols = Math.max(1, Math.min(MAX_COLS, Math.floor(action.cols)));
    insertEmptyMarkdownTable({ size: { rows, cols } })(view);
    return;
  }
  applyTableAction(view, action);
}
