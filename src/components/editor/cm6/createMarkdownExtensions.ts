import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { indentLess, indentMore } from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';
import { EditorState, Prec, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { recordCm6InputToPaint } from '../../../perf/index';
import type { FormatAction } from '../../EditorContextMenu';

type CreateMarkdownExtensionsOptions = {
  fontFamily: string;
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  extraExtensions?: Extension[];
  /** Ctrl/Cmd+Shift+I 插入图片;无回调时返回 false 不拦截按键。 */
  onInsertImage?: () => boolean;
  onFormat?: (action: FormatAction) => boolean;
};

export function createMarkdownExtensions(options: CreateMarkdownExtensionsOptions): Extension[] {
  const extensions: Extension[] = [markdown({ base: markdownLanguage })];

  if (options.tabSize !== 4) {
    extensions.push(EditorState.tabSize.of(options.tabSize));
  }

  // 缩进单位与设置里的 Tab 宽度对齐(CM6 默认 indentUnit 为 2 空格),
  // 列表 Tab/Shift-Tab 缩进的宽度随之生效。
  extensions.push(indentUnit.of(' '.repeat(options.tabSize)));

  if (options.wordWrap) {
    extensions.push(EditorView.lineWrapping);
  }

  if (options.extraExtensions?.length) {
    extensions.push(...options.extraExtensions);
  }

  // ===== Typora 高频功能 keymap:Mod-g 跳转到行 / 列表 Tab 缩进 =====

  // Ctrl/Cmd+G 打开"跳转到行"弹窗(Typora 惯例)。Prec.high 确保覆盖
  // searchKeymap 的 find-next(默认也是 Mod-g)与下方 onFormat 块;
  // 弹窗本体由 AppLayout 监听 'typola:goto-line' CustomEvent 打开。
  extensions.push(Prec.high(keymap.of([{
    key: 'Mod-g',
    preventDefault: true,
    run: () => {
      window.dispatchEvent(new CustomEvent('typola:goto-line'));
      return true;
    },
  }])));

  // 列表行 Tab/Shift-Tab 缩进(Typora 惯例):选区覆盖的所有行都是
  // Markdown 列表项时才拦截,否则返回 false 让位(表格内 Tab 导航、
  // 代码块缩进等)。表格行(| a | b |)不匹配列表正则,自然放行。
  const LIST_ITEM_RE = /^\s*(?:[-*+]|\d+\.)\s/u;
  const selectionCoversOnlyListLines = (state: EditorState) => {
    const { from, to } = state.selection.main;
    const first = state.doc.lineAt(from).number;
    // selection.to 是排他边界:非空选区选到最后一条列表项末尾时,to 恰好
    // 等于下一行的 from,lineAt(to) 会落到下一行(可能是普通段落),造成
    // "选区包含非列表行"的误判。to 落在行首时按 to-1 取实际覆盖的最后一行。
    const toLine = state.doc.lineAt(to);
    const last = to > from && toLine.from === to
      ? state.doc.lineAt(to - 1).number
      : toLine.number;
    for (let number = first; number <= last; number += 1) {
      if (!LIST_ITEM_RE.test(state.doc.line(number).text)) return false;
    }
    return true;
  };
  extensions.push(keymap.of([
    {
      key: 'Tab',
      run: (view) => (selectionCoversOnlyListLines(view.state) ? indentMore(view) : false),
    },
    {
      key: 'Shift-Tab',
      run: (view) => (selectionCoversOnlyListLines(view.state) ? indentLess(view) : false),
    },
  ]));

  if (options.onInsertImage) {
    extensions.push(keymap.of([{
      key: 'Mod-Shift-i',
      preventDefault: true,
      run: options.onInsertImage,
    }]));
  }

  if (options.onFormat) {
    const headingKey = (level: 1 | 2 | 3 | 4 | 5 | 6) =>
      ({ key: `${navigator.platform.includes('Mac') ? 'Mod-Alt' : 'Ctrl'}-${level}`, preventDefault: true, run: () => options.onFormat?.({ type: 'heading', level }) ?? false });
    extensions.push(keymap.of([
      { key: 'Mod-b', preventDefault: true, run: () => options.onFormat?.({ type: 'bold' }) ?? false },
      { key: 'Mod-i', preventDefault: true, run: () => options.onFormat?.({ type: 'italic' }) ?? false },
      { key: 'Mod-Shift-7', preventDefault: true, run: () => options.onFormat?.({ type: 'ol' }) ?? false },
      { key: 'Mod-Shift-8', preventDefault: true, run: () => options.onFormat?.({ type: 'ul' }) ?? false },
      headingKey(1), headingKey(2), headingKey(3), headingKey(4), headingKey(5), headingKey(6),
      { key: 'Mod-0', preventDefault: true, run: () => options.onFormat?.({ type: 'heading', level: 0 }) ?? false },
      // Mod-g 已让位给上方 Prec.high 的"跳转到行"(Typora 惯例);行内代码改绑 Typora 键位
      // Ctrl+Shift+`。Shift+反引号在 US 布局下产生 '~',两条绑定覆盖不同键盘布局。
      { key: 'Mod-Shift-`', preventDefault: true, run: () => options.onFormat?.({ type: 'inline-code' }) ?? false },
      { key: 'Mod-~', preventDefault: true, run: () => options.onFormat?.({ type: 'inline-code' }) ?? false },
      { key: 'Mod-\\', preventDefault: true, run: () => options.onFormat?.({ type: 'clear-format' }) ?? false },
      { key: 'Mod-Shift-k', preventDefault: true, run: () => options.onFormat?.({ type: 'codeblock' }) ?? false },
      { key: 'Mod-t', preventDefault: true, run: () => options.onFormat?.({ type: 'table-insert', rows: 2, cols: 3 }) ?? false },
      { key: 'Mod-Shift-m', preventDefault: true, run: () => options.onFormat?.({ type: 'math-block' }) ?? false },
      { key: 'Mod-k', preventDefault: true, run: () => options.onFormat?.({ type: 'link' }) ?? false },
      { key: 'Mod-.', preventDefault: true, run: () => options.onFormat?.({ type: 'quote-up' }) ?? false },
      { key: 'Mod-,', preventDefault: true, run: () => options.onFormat?.({ type: 'quote-down' }) ?? false },
      // 提升标题等级(Ctrl/Cmd+=)、降低标题等级(Ctrl/Cmd+-),Typora 惯例
      { key: 'Mod-=', preventDefault: true, run: () => options.onFormat?.({ type: 'heading-up' }) ?? false },
      { key: 'Mod--', preventDefault: true, run: () => options.onFormat?.({ type: 'heading-down' }) ?? false },
    ]));
  }

  extensions.push(
    EditorView.theme({
      '&': {
        fontFamily: options.fontFamily,
        backgroundColor: 'transparent',
        color: 'var(--theme-text-primary)',
      },
      '.cm-content': {
        fontSize: `${options.fontSize}px`,
        fontFamily: options.fontFamily,
        caretColor: 'var(--theme-accent)',
      },
      '.cm-scroller': {
        backgroundColor: 'transparent',
      },
      '.cm-gutters': {
        fontFamily: options.fontFamily,
        backgroundColor: 'var(--theme-editor-gutter-bg)',
        color: 'var(--theme-editor-gutter-text)',
        borderRight: '1px solid var(--theme-border-soft)',
      },
      '.cm-activeLine': {
        backgroundColor: 'var(--theme-editor-active-line)',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'var(--theme-editor-active-line)',
      },
      '.cm-selectionBackground': {
        backgroundColor: 'var(--theme-selection) !important',
      },
      '.cm-searchMatch': {
        backgroundColor: 'var(--theme-editor-search-match)',
      },
    }),
  );

  extensions.push(
    EditorView.updateListener.of((update) => {
      if (update.docChanged) recordCm6InputToPaint();
    }),
  );

  return extensions;
}
