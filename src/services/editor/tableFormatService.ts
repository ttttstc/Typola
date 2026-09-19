import type { Transaction } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { insertEmptyMarkdownTable } from 'codemirror-markdown-tables';
import { MAX_COLS, MAX_ROWS } from '../../components/editor/cm6/table/tableCommands';

type TableInsertAction = { type: 'table-insert'; rows: number; cols: number };

const SINGLE_HYPHEN_TABLE_SEPARATOR_RE = /^\|\s*-\s*(?:\|\s*-\s*)+\|$/gmu;
const GFM_TABLE_SEPARATOR_RE = /^\|\s*---\s*(?:\|\s*---\s*)+\|$/gmu;

/**
 * codemirror-markdown-tables 生成的是可解析但非规范的单横线分隔行。
 * 对外保留合法 GFM 的三横线写法，避免切换源码模式时表格变成占位字符。
 */
export function normalizeGfmTableSeparators(source: string): string {
  return source.replace(SINGLE_HYPHEN_TABLE_SEPARATOR_RE, (line) => line.replace(/-/gu, '---'));
}

/**
 * 表格扩展动态挂载时使用上游组件的内部单横线形态，避免它在重建 widget
 * 时把已经规范化的 GFM 分隔行误判成待编辑源码。
 */
export function normalizeTableSeparatorsForWidget(source: string): string {
  return source.replace(GFM_TABLE_SEPARATOR_RE, (line) => line.replace(/---/gu, '-'));
}

export function applyTableFormat(view: EditorView, action: TableInsertAction): void {
  const rows = Math.max(2, Math.min(MAX_ROWS, Math.floor(action.rows)));
  const cols = Math.max(1, Math.min(MAX_COLS, Math.floor(action.cols)));
  const upstreamView = {
    state: view.state,
    dispatch: (transaction: Transaction) => {
      const upstreamSource = transaction.newDoc.toString();
      const source = normalizeGfmTableSeparators(upstreamSource);
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: source },
        selection: transaction.selection,
      });
    },
  };
  insertEmptyMarkdownTable({ size: { rows, cols } })(upstreamView);
}
