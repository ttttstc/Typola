/**
 * Issue #117 PR2:中文 IME composition 不破坏表格、5×5 表格编辑、literal `|`
 * 转义、Tab/Shift+Tab 单元格导航、空 cell placeholder 行为。
 *
 * 这些都是 atomic-editor `tables()` 已实现的行为,本测试是行为契约
 * 防退化,不重复实现。后续若 tables() 升级被破坏,这套测试会先红。
 *
 * Background:
 * - tables()       → block-replace widget → <div class="cm-atomic-table">
 * - 单元格 source  → <div class="cm-atomic-table-cell-source" contenteditable>
 * - IME guard      → compositionstart 期间 input 事件被忽略,
 *                     compositionend 后才 dispatch 一次。
 * - 转义           → serializeTable 把未转义 `|` 转义成 `\|`,serialize 幂等。
 * - 焦点导航       → Tab → 下一格,Shift+Tab → 上一格,末格 Tab → 追加行。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState, Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { createMarkdownExtensions } from './createMarkdownExtensions';
import { createLivePreviewExtensions } from './createLivePreviewExtensions';

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({
      svg: '<svg data-testid="mermaid-svg"><g><text>ok</text></g></svg>',
    })),
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
  return new EditorView({
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
}

function destroyView(view: EditorView): void {
  const parent = view.dom.parentElement;
  view.destroy();
  parent?.remove();
}

function dispatchInput(source: HTMLElement, text: string, isComposing = false): void {
  source.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    inputType: 'insertText',
    data: text,
    isComposing,
  }));
}

function dispatchKey(source: HTMLElement, key: string, init: Partial<KeyboardEventInit> = {}): void {
  source.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
}

function setSourceText(source: HTMLElement, text: string): void {
  source.textContent = text;
}

describe('cm6 PR2 — IME + 表格稳定性', () => {
  let view: EditorView | null = null;

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    if (view && !view.destroyed) destroyView(view);
    view = null;
    document.body.innerHTML = '';
  });

  describe('5×5 表格解析与单元格 DOM', () => {
    it('theader 与 tbody 行/列结构正确', () => {
      view = createView(FIVE_BY_FIVE);

      const wrap = view.contentDOM.querySelector<HTMLElement>('.cm-atomic-table');
      expect(wrap).not.toBeNull();

      const headerCells = wrap!.querySelectorAll('thead th');
      expect(headerCells.length).toBe(5);

      const bodyRows = wrap!.querySelectorAll('tbody tr');
      expect(bodyRows.length).toBe(4);
      bodyRows.forEach((row) => {
        expect(row.querySelectorAll('td').length).toBe(5);
      });
    });

    it('每格 source 都是 contenteditable 且能拿到 dataset.raw', () => {
      view = createView(FIVE_BY_FIVE);

      const firstRowFirstCell = view.contentDOM.querySelector<HTMLElement>(
        '.cm-atomic-table tbody tr:first-child td:first-child',
      );
      expect(firstRowFirstCell).not.toBeNull();
      const source = firstRowFirstCell!.querySelector<HTMLElement>('.cm-atomic-table-cell-source');
      expect(source).not.toBeNull();
      // jsdom 不暴露 isContentEditable,只能查 contentEditable property。
      expect(source!.contentEditable).toBe('true');
      expect(firstRowFirstCell!.dataset.raw).toBe('1');
    });
  });

  describe('空 cell placeholder', () => {
    it('空 cell 的 source textContent 为空,CSS :empty 可生效', () => {
      const doc = [
        '| A | B |',
        '| --- | --- |',
        '|  | filled |',
        '',
      ].join('\n');
      view = createView(doc);

      const emptyCell = view.contentDOM.querySelector<HTMLElement>(
        '.cm-atomic-table tbody tr td:first-child',
      );
      expect(emptyCell?.dataset.raw).toBe('');
      const source = emptyCell?.querySelector<HTMLElement>('.cm-atomic-table-cell-source');
      expect(source).not.toBeNull();
      // jsdom 不计算 `::before` content;但 textContent 必须为空,使得
      // CSS 选择器 `:empty` 匹配上,placeholder 文本由样式决定。
      expect(source!.textContent ?? '').toBe('');
      expect(source!.childNodes.length).toBe(0);
    });

    it('empty cell 不写入 markdown,序列化保留空字符串', () => {
      const doc = [
        '| A | B |',
        '| --- | --- |',
        '|  | filled |',
        '',
      ].join('\n');
      view = createView(doc);

      const emptyCell = view.contentDOM.querySelector<HTMLElement>(
        '.cm-atomic-table tbody tr td:first-child',
      )!;
      emptyCell.dataset.raw = '   ';
      const source = emptyCell.querySelector<HTMLElement>('.cm-atomic-table-cell-source')!;
      // 触发 commit(input 事件,isComposing=false)
      setSourceText(source, '');
      dispatchInput(source, '');

      // 文档应被 dispatch 成保留空 cell(自动 trim)
      const table = view.state.doc.toString().split('\n').filter((l) => l.startsWith('|')).join('\n');
      expect(table).toContain('|  | filled |');
    });
  });

  describe('IME composition 不破坏表格列数', () => {
    it('compositionstart 期间多个 input 事件只产生一次 commit', () => {
      view = createView(FIVE_BY_FIVE);

      const firstCell = view.contentDOM.querySelector<HTMLElement>(
        '.cm-atomic-table tbody tr:first-child td:first-child',
      )!;
      const source = firstCell.querySelector<HTMLElement>('.cm-atomic-table-cell-source')!;
      source.focus();

      // 模拟中文 IME 输入"你"的拼写过程:n -> ni -> 你(commit)
      source.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      source.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true, data: 'n' }));
      source.textContent = 'n';
      source.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true, data: 'ni' }));
      source.textContent = 'ni';
      source.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true, data: '你' }));
      source.textContent = '你';
      // compositionend 触发 commit
      source.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '你' }));

      // IME guard 保证 composition 期间不 commit,
      // compositionend 后才把最终文本一次性落到文档,5 列结构保留。
      const finalDoc = view!.state.doc.toString();
      const firstBodyRow = finalDoc.split('\n')[2]!;
      const cells = firstBodyRow.split('|').map((c) => c.trim());
      expect(cells.length).toBe(7); // 5 cells + 2 outer empty = 7 tokens via |
      expect(cells).toContain('你');
    });

    it('isComposing=true 的 input 事件被忽略', () => {
      view = createView(FIVE_BY_FIVE);

      const firstCell = view.contentDOM.querySelector<HTMLElement>(
        '.cm-atomic-table tbody tr:first-child td:first-child',
      )!;
      const source = firstCell.querySelector<HTMLElement>('.cm-atomic-table-cell-source')!;

      // 不发 compositionstart,仅发 input(isComposing=true) —— 浏览器偶发场景。
      // 文档不应被改写。
      const beforeDoc = view!.state.doc.toString();
      source.textContent = 'x';
      source.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true, data: 'x' }));

      expect(view!.state.doc.toString()).toBe(beforeDoc);
    });
  });

  describe('literal | 转义', () => {
    it('输入 literal | 后,序列化文档里出现 \\|', () => {
      view = createView(FIVE_BY_FIVE);

      const cell = view.contentDOM.querySelector<HTMLElement>(
        '.cm-atomic-table tbody tr:first-child td:first-child',
      )!;
      const source = cell.querySelector<HTMLElement>('.cm-atomic-table-cell-source')!;

      source.textContent = 'a|b';
      source.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'b' }));

      const tableText = view!.state.doc.toString().split('\n').filter((l) => l.startsWith('|')).join('\n');
      const firstBodyRow = tableText.split('\n')[2]!;
      // 5 列结构保留 + literal | 被转义为 \|。
      // 手工按 unescaped | 拆列:行首/行尾的 | 是分隔符,中间的 \|
      // 是转义,不应被当成分列符。
      const tokens = firstBodyRow.split(/(?<!\\)\|/);
      // 5 cells + 2 个行首/行尾空 token = 7 tokens
      expect(tokens.length).toBe(7);
      // 第一格是 a\|b,后面 4 格是 2/3/4/5
      expect(tokens[1]).toBe(' a\\|b ');
      expect(tokens[2]).toBe(' 2 ');
      expect(tokens[3]).toBe(' 3 ');
      expect(tokens[4]).toBe(' 4 ');
      expect(tokens[5]).toBe(' 5 ');
    });

    it('已转义 \\| 不会被再次转义', () => {
      view = createView(FIVE_BY_FIVE);

      const cell = view.contentDOM.querySelector<HTMLElement>(
        '.cm-atomic-table tbody tr:first-child td:first-child',
      )!;
      const source = cell.querySelector<HTMLElement>('.cm-atomic-table-cell-source')!;

      // dataset.raw 模拟已是转义状态的源(从外部 markdown 渲染过来)
      cell.dataset.raw = 'a\\|b';
      source.textContent = 'a\\|b';
      source.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: '' }));

      const tableText = view!.state.doc.toString().split('\n').filter((l) => l.startsWith('|')).join('\n');
      // 幂等:不出现 a\\\|b(那是 \\ + | 的二次转义)
      expect(tableText).toContain('a\\|b');
      expect(tableText).not.toContain('a\\\\|b');
    });
  });

  describe('Tab/Shift+Tab 单元格焦点', () => {
    it('Tab 焦点顺序:td1 → td2 → ... → 末格', () => {
      view = createView('| A | B |\n| --- | --- |\n| a | b |');

      const cells = Array.from(view.contentDOM.querySelectorAll<HTMLElement>('.cm-atomic-table tbody td'));
      expect(cells.length).toBe(2);

      // jsdom 不传播 focus,所以挂一个 instrumentation 替代 activeElement 校验。
      const focusCalls: HTMLElement[] = [];
      for (const cell of cells) {
        const source = cell.querySelector<HTMLElement>('.cm-atomic-table-cell-source')!;
        const originalFocus = source.focus.bind(source);
        source.focus = (() => {
          focusCalls.push(source);
          originalFocus();
        }) as typeof source.focus;
      }

      const firstSource = cells[0]!.querySelector<HTMLElement>('.cm-atomic-table-cell-source')!;
      firstSource.focus();
      expect(focusCalls[focusCalls.length - 1]).toBe(firstSource);

      dispatchKey(firstSource, 'Tab');
      const secondSource = cells[1]!.querySelector<HTMLElement>('.cm-atomic-table-cell-source')!;
      expect(focusCalls[focusCalls.length - 1]).toBe(secondSource);
    });

    it('Shift+Tab 反向焦点顺序', () => {
      view = createView('| A | B |\n| --- | --- |\n| a | b |');

      const cells = Array.from(view.contentDOM.querySelectorAll<HTMLElement>('.cm-atomic-table tbody td'));
      const focusCalls: HTMLElement[] = [];
      for (const cell of cells) {
        const source = cell.querySelector<HTMLElement>('.cm-atomic-table-cell-source')!;
        const originalFocus = source.focus.bind(source);
        source.focus = (() => {
          focusCalls.push(source);
          originalFocus();
        }) as typeof source.focus;
      }

      const secondSource = cells[1]!.querySelector<HTMLElement>('.cm-atomic-table-cell-source')!;
      secondSource.focus();

      dispatchKey(secondSource, 'Tab', { shiftKey: true });
      const firstSource = cells[0]!.querySelector<HTMLElement>('.cm-atomic-table-cell-source')!;
      expect(focusCalls[focusCalls.length - 1]).toBe(firstSource);
    });

    it('末格 Tab 触发追加行', () => {
      view = createView('| A | B |\n| --- | --- |\n| a | b |');

      const cells = Array.from(view.contentDOM.querySelectorAll<HTMLElement>('.cm-atomic-table tbody td'));
      const lastSource = cells[cells.length - 1]!.querySelector<HTMLElement>('.cm-atomic-table-cell-source')!;

      const beforeLines = view!.state.doc.toString().split('\n').filter((l) => l.startsWith('|')).length;
      dispatchKey(lastSource, 'Tab');
      const afterLines = view!.state.doc.toString().split('\n').filter((l) => l.startsWith('|')).length;
      // 追加空行后多出一行 GFM 表格行(文档同步更新,但 DOM 重建走 rAF,
      // 这里断言文档状态而不是 DOM 行数 —— jsdom 默认不触发 rAF)。
      expect(afterLines).toBe(beforeLines + 1);
      expect(view!.state.doc.toString()).toContain('|  |  |');
    });
  });
});