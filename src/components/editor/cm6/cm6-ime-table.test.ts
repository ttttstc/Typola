/**
 * CM6 表格交互回归:上游组件负责单元格编辑、选区、IME、剪贴板与导航,
 * Typola 只验证组件挂载、Markdown 保真和插入命令契约。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { createMarkdownExtensions } from './createMarkdownExtensions';
import { createLivePreviewExtensions } from './createLivePreviewExtensions';
import { applyTableFormat } from '../../../services/editor/tableFormatService';

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({ svg: '<svg><g><text>ok</text></g></svg>' })),
  },
}));

const FIVE_BY_FIVE = [
  '| C1 | C2 | C3 | C4 | C5 |',
  '| --- | --- | --- | --- | --- |',
  '| 1 | 2 | 3 | 4 | 5 |',
  '| a | b | c | d | e |',
  '| 甲 | 乙 | 丙 | 丁 | 戊 |',
  '| α | β | γ | δ | ε |',
].join('\n');

function createView(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: createMarkdownExtensions({
        fontFamily: 'monospace',
        fontSize: 14,
        tabSize: 4,
        wordWrap: true,
        extraExtensions: createLivePreviewExtensions(),
      }),
    }),
    parent,
  });
  view.dispatch({ selection: { anchor: view.state.doc.length } });
  return view;
}

function destroyView(view: EditorView): void {
  const parent = view.dom.parentElement;
  view.destroy();
  parent?.remove();
}

function table(view: EditorView): HTMLTableElement {
  const element = view.contentDOM.querySelector<HTMLTableElement>('.tbl-table');
  expect(element).not.toBeNull();
  return element!;
}

describe('CM6 Markdown table integration', () => {
  let view: EditorView | null = null;

  afterEach(() => {
    if (view && !view.destroyed) destroyView(view);
    view = null;
    document.body.innerHTML = '';
  });

  it('renders the expected header/body grid for a 5×5 table', () => {
    view = createView(FIVE_BY_FIVE);
    const rendered = table(view);

    expect(rendered.querySelectorAll('thead .tbl-cell')).toHaveLength(5);
    expect(rendered.querySelectorAll('tbody .tbl-table-row')).toHaveLength(4);
    expect(Array.from(rendered.querySelectorAll('tbody .tbl-table-row'))
      .every((row) => row.querySelectorAll('.tbl-cell').length === 5)).toBe(true);
  });

  it('keeps empty cells empty without changing the Markdown shape', () => {
    const source = '| A | B |\n| --- | --- |\n|  |  |';
    view = createView(source);
    const rendered = table(view);
    const cells = rendered.querySelectorAll<HTMLElement>('tbody .tbl-cell-view');

    expect(cells).toHaveLength(2);
    expect(Array.from(cells).every((cell) => cell.textContent === '')).toBe(true);
    expect(view.state.doc.toString()).toContain('|   |   |');
  });

  it('renders escaped pipes as cell text while preserving source escaping', () => {
    view = createView('| A | B |\n| --- | --- |\n| a\\|b | c |');
    const cells = table(view).querySelectorAll<HTMLElement>('tbody .tbl-cell-view');

    expect(cells[0]?.textContent).toBe('a|b');
    expect(view.state.doc.toString()).toContain('a\\|b');
  });

  it('uses the upstream CM6 command for table insertion', () => {
    view = createView('正文');
    applyTableFormat(view, { type: 'table-insert', rows: 2, cols: 3 });

    expect(view.state.doc.toString()).toContain('|   |   |   |');
    expect(view.state.doc.toString()).toContain('| - | - | - |');
  });

  it('renders upstream selection and row/column operation handles', () => {
    view = createView('| A | B |\n| --- | --- |\n| a | b |');

    expect(table(view).getAttribute('role')).toBe('grid');
    expect(view.contentDOM.querySelectorAll('.tbl-handle')).not.toHaveLength(0);
    expect(view.contentDOM.querySelectorAll('.tbl-cell-view')).toHaveLength(4);
  });
});
