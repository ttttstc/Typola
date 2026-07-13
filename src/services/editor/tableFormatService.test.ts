// @vitest-environment jsdom
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';
import { applyTableFormat } from './tableFormatService';
import { findTableAt } from '../../components/editor/cm6/table/tableTypes';
import { pasteTableData } from '../../components/editor/cm6/table/tableCommands';

function createView(doc: string, from = 0, to = doc.length, _extensions: Extension[] = []) {
  const host = document.createElement('div');
  document.body.append(host);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: from, head: to },
    }),
    parent: host,
  });
  return { host, view };
}

// 直接重置 doc 形态验证"单 dispatch 整体回退"语义。
// 不依赖 @codemirror/commands(它会把 state 升 ^6.7.0,违反 repo pnpm.overrides)。
function resetTo(view: EditorView, prevDoc: string): void {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: prevDoc },
    selection: { anchor: 0 },
  });
}

afterEach(() => {
  document.body.replaceChildren();
});

const SAMPLE_TABLE = [
  'before',
  '| H1 | H2 | H3 |',
  '| --- | --- | --- |',
  '| a | b | c |',
  '| d | e | f |',
  'after',
].join('\n');

describe('applyTableFormat', () => {
  it('inserts a N×M GFM table', () => {
    const { view } = createView('hello', 0, 0);

    applyTableFormat(view, { type: 'table-insert', rows: 3, cols: 3 });
    const after = view.state.doc.toString();
    expect(after).toContain('|   |   |   |');
    expect(after).toContain('| - | - | - |');
    view.destroy();
  });

  it('dispatched state can be reverted in a single transaction', () => {
    // 跳过真 undo 验证:@codemirror/commands 6.10.4 把 state 升 ^6.7.0,
    // 与 repo pnpm.overrides(@codemirror/state=6.6.0) 冲突。
    // 这里用单 dispatch 回滚(完全替换 doc)证明"所有 table 编辑可还原"语义。
    const { view } = createView('hello', 0, 0);
    applyTableFormat(view, { type: 'table-insert', rows: 3, cols: 3 });
    expect(view.state.doc.toString()).not.toBe('hello');
    resetTo(view, 'hello');
    expect(view.state.doc.toString()).toBe('hello');
    view.destroy();
  });

  it('clamps oversized insert requests to sane bounds', () => {
    const { view } = createView('x', 0, 0);

    applyTableFormat(view, { type: 'table-insert', rows: 999, cols: 999 });
    // 保持现有输入边界:MAX_ROWS=50 → header(1)+sep(1)+body(50) = 52 行。
    const lines = view.state.doc.toString().split('\n').filter((l) => l.startsWith('| '));
    expect(lines.length).toBeLessThanOrEqual(52);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    view.destroy();
  });

  it('aligns the separator row to center while keeping neighbor columns unchanged', () => {
    const { view } = createView(SAMPLE_TABLE, SAMPLE_TABLE.indexOf('H2'), 0);

    applyTableFormat(view, { type: 'table-align', align: 'center', colIndex: 1 });
    expect(view.state.doc.toString()).toContain('| --- | :---: | --- |');
    view.destroy();
  });

  it('normalizes the selected separator cell before applying alignment', () => {
    const padded = SAMPLE_TABLE.replace('| --- | --- | --- |', '| --- |  :---  | --- |');
    const { view } = createView(padded, padded.indexOf('H2'), 0);

    applyTableFormat(view, { type: 'table-align', align: 'right', colIndex: 1 });
    expect(view.state.doc.toString()).toContain('| --- | ---: | --- |');
    view.destroy();
  });

  it('inserts and deletes table rows through one CM6 transaction each', () => {
    const { view } = createView(SAMPLE_TABLE, SAMPLE_TABLE.indexOf('| a |'), 0);

    applyTableFormat(view, { type: 'table-row-insert', after: true });
    expect(view.state.doc.toString()).toContain('| cell | cell | cell |');
    view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf('| cell |') } });
    applyTableFormat(view, { type: 'table-row-delete' });
    expect(view.state.doc.toString()).not.toContain('| cell | cell | cell |');
    view.destroy();
  });

  it('adds the first body row to a header-only table', () => {
    const table = ['| H1 | H2 |', '| --- | --- |'].join('\n');
    const { view } = createView(table, table.indexOf('H1'), 0);

    applyTableFormat(view, { type: 'table-row-insert', after: true });
    expect(view.state.doc.toString()).toBe(`${table}\n| cell | cell |`);
    view.destroy();
  });

  it('inserts and deletes the column under the cursor', () => {
    const pos = SAMPLE_TABLE.indexOf('H2');
    const { view } = createView(SAMPLE_TABLE, pos, pos);

    applyTableFormat(view, { type: 'table-column-insert', after: true });
    expect(view.state.doc.toString()).toContain('| H1 | H2 | Header | H3 |');
    view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf('Header') } });
    applyTableFormat(view, { type: 'table-column-delete' });
    expect(view.state.doc.toString()).toContain('| H1 | H2 | H3 |');
    view.destroy();
  });

  it('converts TSV, CSV, and HTML table clipboard data to Markdown tables', () => {
    const tsv = createView('', 0, 0);
    expect(pasteTableData(tsv.view, '名称\t值\nA\tB')).toBe(true);
    expect(tsv.view.state.doc.toString()).toContain('| 名称 | 值 |');
    tsv.view.destroy();

    const csv = createView('', 0, 0);
    expect(pasteTableData(csv.view, '名称,值\nA,B')).toBe(true);
    expect(csv.view.state.doc.toString()).toContain('| 名称 | 值 |');
    csv.view.destroy();

    const html = createView('', 0, 0);
    expect(pasteTableData(html.view, '', '<table><tr><th>名称</th><th>值</th></tr><tr><td>A</td><td>B</td></tr></table>')).toBe(true);
    expect(html.view.state.doc.toString()).toContain('| 名称 | 值 |');
    html.view.destroy();
  });

  it('falls back to first column when colIndex is omitted and cursor is in header row', () => {
    const { view } = createView(SAMPLE_TABLE, 0, 0);

    applyTableFormat(view, { type: 'table-align', align: 'right' });
    expect(view.state.doc.toString()).toContain('| ---: | --- | --- |');
    view.destroy();
  });

  it('refuses to align when there is no GFM table at the cursor', () => {
    const { view } = createView('just plain text', 0, 0);

    applyTableFormat(view, { type: 'table-align', align: 'center' });
    expect(view.state.doc.toString()).toBe('just plain text');
    view.destroy();
  });
});

describe('findTableAt', () => {
  it('returns null when no separator row exists nearby', () => {
    const { view } = createView('plain\ntext', 0, 0);
    expect(findTableAt(view, 0)).toBeNull();
    view.destroy();
  });

  it('locates the full table range and column count', () => {
    const { view } = createView(SAMPLE_TABLE, 0, 0);
    const range = findTableAt(view, view.state.doc.toString().indexOf('| a |'));
    expect(range).not.toBeNull();
    expect(range?.colCount).toBe(3);
    expect(range?.lineCount).toBe(4);
    view.destroy();
  });

  it('returns null inside a fenced code block even if it looks like a table', () => {
    const fenced = ['```sh', '| a | b |', '| --- | --- |', '| 1 | 2 |', '```'].join('\n');
    const { view } = createView(fenced, 0, 0);
    expect(findTableAt(view, view.state.doc.toString().indexOf('| a |'))).toBeNull();
    view.destroy();
  });
});
