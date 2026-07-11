import type { EditorView } from '@codemirror/view';
import type { TableAction } from '../../components/editor/cm6/table/tableTypes';
import { applyTableAction } from '../../components/editor/cm6/table/tableCommands';

export function applyTableFormat(view: EditorView, action: TableAction): void {
  applyTableAction(view, action);
}
