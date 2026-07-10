// @vitest-environment jsdom
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history, undo } from '@codemirror/commands';
import { afterEach, describe, expect, it } from 'vitest';
import { applyTableFormat } from './tableFormatService';
import { findTableAt } from '../../components/editor/cm6/table/tableTypes';

function createView(doc: string, from = 0, to = doc.length) {
  const host = document.createElement('div');
  document.body.append(host);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: from, head: to },
      extensions: [history()],
    }),
    parent: host,
  });
  return { host, view };
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
  it('inserts a N×M GFM table and undoes as a single transaction', () => {
    const { view } = createView('hello', 0, 0);

    applyTableFormat(view, { type: 'table-insert', rows: 3, cols: 3 });
    const after = view.state.doc.toString();
    expect(after).toContain('| Header 1 | Header 2 | Header 3 |');
    expect(after).toContain('| --- | --- | --- |');
    expect(after).toContain('| cell | cell | cell |');

    undo(view);
    expect(view.state.doc.toString()).toBe('hello');
    view.destroy();
  });

  it('clamps oversized insert requests to sane bounds', () => {
    const { view } = createView('x', 0, 0);

    applyTableFormat(view, { type: 'table-insert', rows: 999, cols: 999 });
    // MAX_ROWS=50 → header(1)+sep(1)+body(50) = 52 行;clamp 后不再更多。
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
