// @vitest-environment jsdom
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';
import { pasteTableData } from '../../components/editor/cm6/table/tableCommands';
import { applyTableFormat } from './tableFormatService';

function createView(doc: string, from = 0, to = doc.length) {
  const host = document.createElement('div');
  document.body.append(host);
  const view = new EditorView({
    state: EditorState.create({ doc, selection: { anchor: from, head: to } }),
    parent: host,
  });
  return { host, view };
}

afterEach(() => document.body.replaceChildren());

describe('applyTableFormat', () => {
  it('delegates table insertion to the upstream command', () => {
    const { view } = createView('hello', 0, 0);
    applyTableFormat(view, { type: 'table-insert', rows: 3, cols: 3 });
    expect(view.state.doc.toString()).toContain('|   |   |   |');
    expect(view.state.doc.toString()).toContain('| - | - | - |');
    view.destroy();
  });

  it('clamps oversized insert requests before calling upstream', () => {
    const { view } = createView('x', 0, 0);
    applyTableFormat(view, { type: 'table-insert', rows: 999, cols: 999 });
    const lines = view.state.doc.toString().split('\n').filter((line) => line.startsWith('| '));
    expect(lines.length).toBeLessThanOrEqual(52);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    view.destroy();
  });
});

describe('external table clipboard adapter', () => {
  it('converts TSV, CSV, and HTML data to Markdown only outside the upstream widget', () => {
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
});
