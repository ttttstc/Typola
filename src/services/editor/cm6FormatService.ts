import { EditorView } from '@codemirror/view';
import type { FormatAction, HeadingLevel } from '../../components/EditorContextMenu';
import { applyTableFormat } from './tableFormatService';

// 应用一个格式化动作到 CM6 编辑器(走 view.dispatch 改 doc,不依赖 Vditor)。
// 行内格式(加粗/斜体/删除线/行内代码)走 wrapInline,光标和选区都保留。
// 块格式(引用/列表/任务/代码块/分隔线/链接)走 toggleLinePrefix 或 wrapBlock。
// 标题级别走 setHeadingPrefix(在每行行首加/换/清 # 前缀)。
// 剪贴板和全选走 document.execCommand / EditorView 全选 dispatch。
export function applyCm6Format(view: EditorView, action: FormatAction): void {
  switch (action.type) {
    case 'bold':
      wrapInline(view, '**', '**', '加粗文本');
      return;
    case 'italic':
      wrapInline(view, '*', '*', '斜体文本');
      return;
    case 'strike':
      wrapInline(view, '~~', '~~', '删除文本');
      return;
    case 'inline-code':
      wrapInline(view, '`', '`', '代码');
      return;
    case 'link':
      wrapLink(view);
      return;
    case 'heading':
      setHeadingPrefix(view, action.level);
      return;
    case 'quote':
      toggleLinePrefix(view, 'quote');
      return;
    case 'ul':
      toggleLinePrefix(view, 'ul');
      return;
    case 'ol':
      toggleLinePrefix(view, 'ol');
      return;
    case 'task':
      toggleLinePrefix(view, 'task');
      return;
    case 'codeblock':
      wrapCodeBlock(view);
      return;
    case 'hr':
      insertHorizontalRule(view);
      return;
    case 'quote-up':
      changeQuoteLevel(view, true);
      return;
    case 'quote-down':
      changeQuoteLevel(view, false);
      return;
    case 'link-edit':
      editLink(view);
      return;
    case 'clear-format':
      clearFormat(view);
      return;
    case 'codeblock-lang':
      editCodeBlockLanguage(view);
      return;
    case 'cut':
      document.execCommand('cut');
      return;
    case 'copy':
      document.execCommand('copy');
      return;
    case 'paste':
      void pasteFromClipboard(view);
      return;
    case 'select-all':
      selectAll(view);
      return;
    case 'table-insert':
      applyTableFormat(view, {
        type: 'table-insert',
        rows: action.rows,
        cols: action.cols,
      });
      return;
    case 'table-align':
      applyTableFormat(view, {
        type: 'table-align',
        align: action.align,
        colIndex: action.colIndex,
      });
      return;
  }
}

function wrapInline(
  view: EditorView,
  open: string,
  close: string,
  placeholder: string,
): void {
  const sel = view.state.selection.main;
  const markerRange = findInlineMarkerRange(view, sel.from, sel.to, open, close);
  if (markerRange) {
    const { from, to } = markerRange;
    view.dispatch({
      changes: [
        { from, to: from + open.length, insert: '' },
        { from: to - close.length, to, insert: '' },
      ],
      selection: {
        anchor: Math.max(from, sel.from - open.length),
        head: Math.max(from, sel.to - open.length),
      },
    });
    view.focus();
    return;
  }
  if (sel.empty) {
    const insert = `${open}${placeholder}${close}`;
    view.dispatch({
      changes: { from: sel.from, insert },
      selection: { anchor: sel.from + open.length, head: sel.from + open.length + placeholder.length },
    });
  } else {
    const text = view.state.sliceDoc(sel.from, sel.to);
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: `${open}${text}${close}` },
      selection: { anchor: sel.from + open.length, head: sel.to + open.length },
    });
  }
  view.focus();
}

/** 返回包围当前选区（或光标）的成对行内标记范围。 */
function findInlineMarkerRange(
  view: EditorView,
  from: number,
  to: number,
  open: string,
  close: string,
): { from: number; to: number } | null {
  const doc = view.state.doc;
  if (
    from >= open.length
    && to + close.length <= doc.length
    && view.state.sliceDoc(from - open.length, from) === open
    && view.state.sliceDoc(to, to + close.length) === close
  ) {
    return { from: from - open.length, to: to + close.length };
  }
  if (from !== to) return null;

  const line = doc.lineAt(from);
  const before = view.state.sliceDoc(line.from, from);
  const after = view.state.sliceDoc(from, line.to);
  const openIndex = before.lastIndexOf(open);
  const closeIndex = after.indexOf(close);
  if (openIndex === -1 || closeIndex === -1) return null;

  return {
    from: line.from + openIndex,
    to: from + closeIndex + close.length,
  };
}

function wrapLink(view: EditorView): void {
  const sel = view.state.selection.main;
  if (sel.empty) {
    const insert = '[链接文字](https://)';
    view.dispatch({
      changes: { from: sel.from, insert },
      selection: { anchor: sel.from + 1, head: sel.from + 5 },
    });
  } else {
    const text = view.state.sliceDoc(sel.from, sel.to);
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: `[${text}](https://)` },
      selection: { anchor: sel.from + 1, head: sel.to + 1 },
    });
  }
  view.focus();
}

type BlockKind = 'quote' | 'ul' | 'ol' | 'task';

const BLOCK_PREFIXES: Record<BlockKind, RegExp> = {
  quote: /^>\s/,
  ul: /^[-*]\s/,
  ol: /^\d+\.\s/,
  task: /^[-*]\s\[\s\]\s/,
};

const BLOCK_INSERT: Record<BlockKind, string> = {
  quote: '> ',
  ul: '- ',
  ol: '1. ',
  task: '- [ ] ',
};

// 对选区跨越的每一行,根据当前行首 prefix 决定「切换 / 清除 / 添加」:
// 1) 所有行都有同类 prefix → 整段清除(回到正文)
// 2) 部分行有 prefix → 全部统一成该 prefix
// 3) 都没有 → 全部添加
function toggleLinePrefix(view: EditorView, kind: BlockKind): void {
  const sel = view.state.selection.main;
  const fromLine = view.state.doc.lineAt(sel.from);
  const toLine = sel.to <= fromLine.to && sel.from === fromLine.from
    ? fromLine
    : view.state.doc.lineAt(sel.to);
  const start = fromLine.number;
  const end = toLine.number;
  const prefixRe = BLOCK_PREFIXES[kind];
  const insert = BLOCK_INSERT[kind];

  const lines = [];
  for (let n = start; n <= end; n += 1) {
    const line = view.state.doc.line(n);
    lines.push({ from: line.from, text: view.state.sliceDoc(line.from, line.to) });
  }

  const allHave = lines.length > 0 && lines.every((l) => prefixRe.test(l.text));
  const someHave = lines.some((l) => prefixRe.test(l.text));

  // 选区起点位置(选区在原行内时,清除 prefix 后要保持光标逻辑位置)
  const changes = [];
  for (const { from, text } of lines) {
    if (allHave) {
      const m = text.match(prefixRe);
      if (m) changes.push({ from, to: from + m[0].length, insert: '' });
    } else if (someHave) {
      const m = text.match(prefixRe);
      if (m) {
        changes.push({ from, to: from + m[0].length, insert });
      } else {
        changes.push({ from, insert });
      }
    } else {
      changes.push({ from, insert });
    }
  }
  view.dispatch({ changes });
  view.focus();
}

function setHeadingPrefix(view: EditorView, level: HeadingLevel): void {
  const sel = view.state.selection.main;
  const fromLine = view.state.doc.lineAt(sel.from);
  const toLine = sel.to <= fromLine.to && sel.from === fromLine.from
    ? fromLine
    : view.state.doc.lineAt(sel.to);
  const start = fromLine.number;
  const end = toLine.number;
  const targetPrefix = level === 0 ? '' : '#'.repeat(level) + ' ';
  const headingRe = /^(#{1,6})\s/;

  const changes = [];
  for (let n = start; n <= end; n += 1) {
    const line = view.state.doc.line(n);
    const text = view.state.sliceDoc(line.from, line.to);
    const m = text.match(headingRe);
    if (m) {
      // 已有 heading prefix → 替换
      if (targetPrefix === '') {
        changes.push({ from: line.from, to: line.from + m[0].length, insert: '' });
      } else {
        changes.push({ from: line.from, to: line.from + m[0].length, insert: targetPrefix });
      }
    } else {
      // 无 heading prefix → 在行首添加
      changes.push({ from: line.from, insert: targetPrefix });
    }
  }
  view.dispatch({ changes });
  view.focus();
}

function wrapCodeBlock(view: EditorView): void {
  const sel = view.state.selection.main;
  if (sel.empty) {
    const insert = '\n```\n代码\n```\n';
    view.dispatch({
      changes: { from: sel.from, insert },
      selection: { anchor: sel.from + 5, head: sel.from + 7 },
    });
  } else {
    const text = view.state.sliceDoc(sel.from, sel.to);
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: `\n\`\`\`\n${text}\n\`\`\`\n` },
    });
  }
  view.focus();
}

function insertHorizontalRule(view: EditorView): void {
  const sel = view.state.selection.main;
  const insert = '\n\n---\n\n';
  view.dispatch({
    changes: { from: sel.from, insert },
    selection: { anchor: sel.from + insert.length },
  });
  view.focus();
}

function changeQuoteLevel(view: EditorView, upgrade: boolean): void {
  const selection = view.state.selection.main;
  const line = view.state.doc.lineAt(selection.from);
  const text = view.state.sliceDoc(line.from, line.to);
  const indent = text.match(/^[ \t]*/)?.[0] ?? '';
  const rest = text.slice(indent.length);
  const match = rest.match(/^(?:> ?)+/);
  const depth = match ? (match[0].match(/>/g)?.length ?? 0) : 0;
  const body = rest.slice(match?.[0].length ?? 0);
  const nextDepth = upgrade ? depth + 1 : Math.max(0, depth - 1);
  const next = nextDepth === 0 ? `${indent}${body}` : `${indent}${'>'.repeat(nextDepth)} ${body}`;
  view.dispatch({ changes: { from: line.from, to: line.to, insert: next } });
  view.focus();
}

function editLink(view: EditorView): void {
  const selection = view.state.selection.main;
  const text = view.state.sliceDoc(selection.from, selection.to);
  const match = text.match(/^\[([^\]]*)\]\(([^)]*)\)$/);
  if (!match) return;
  const url = window.prompt('链接网址', match[2]);
  if (url === null) return;
  const next = `[${match[1]}](${url})`;
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: next },
    selection: { anchor: selection.from, head: selection.from + next.length },
  });
  view.focus();
}

function clearFormat(view: EditorView): void {
  const selection = view.state.selection.main;
  if (selection.empty) return;
  const text = view.state.sliceDoc(selection.from, selection.to);
  const next = text
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
    .replace(/_{1,3}([^_]+)_{1,3}/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^(\s{0,3}>\s+)(?=\S)/gm, '')
    .replace(/^\s{0,3}(?:[-*+]|\d+\.)\s+(?=\S)/gm, '');
  if (next === text) return;
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: next },
    selection: { anchor: selection.from, head: selection.from + next.length },
  });
  view.focus();
}

function editCodeBlockLanguage(view: EditorView): void {
  const selection = view.state.selection.main;
  const text = view.state.sliceDoc(selection.from, selection.to);
  const match = text.match(/^```([^\n]*)\n([\s\S]*?)\n```$/);
  if (!match) return;
  const language = window.prompt('代码语言', match[1]);
  if (language === null) return;
  const next = `\`\`\`${language}\n${match[2]}\n\`\`\``;
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: next },
    selection: { anchor: selection.from, head: selection.from + next.length },
  });
  view.focus();
}

async function pasteFromClipboard(view: EditorView): Promise<void> {
  try {
    const text = await navigator.clipboard.readText();
    if (!text) return;
    const sel = view.state.selection.main;
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: text },
    });
    view.focus();
  } catch (error) {
    console.warn('Paste failed:', error);
  }
}

function selectAll(view: EditorView): void {
  view.dispatch({
    selection: { anchor: 0, head: view.state.doc.length },
  });
  view.focus();
}
