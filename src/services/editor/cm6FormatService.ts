import { EditorView } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { FormatAction, HeadingLevel } from '../../components/EditorContextMenu';
import { applyTableFormat } from './tableFormatService';
import { pasteTableData } from '../../components/editor/cm6/table/tableCommands';
import { convertHtmlPasteToMarkdown } from '../htmlPasteService';
import { findMarkdownLinkAt } from '../markdownAnalysisService';
import type { Cm6EditRequest } from '../../components/editor/cm6/Cm6EditPopover';

type CapturedFormat = { bold: boolean; italic: boolean; strike: boolean; code: boolean; prefix: string | null };
const capturedFormats = new WeakMap<EditorView, CapturedFormat>();

// 应用一个格式化动作到 CM6 编辑器(走 view.dispatch 改 doc,不依赖 Vditor)。
// 行内格式(加粗/斜体/删除线/行内代码)走 wrapInline,光标和选区都保留。
// 块格式(引用/列表/任务/代码块/分隔线/链接)走 toggleLinePrefix 或 wrapBlock。
// 标题级别走 setHeadingPrefix(在每行行首加/换/清 # 前缀)。
// 剪贴板和全选走 document.execCommand / EditorView 全选 dispatch。
export function applyCm6Format(view: EditorView, action: FormatAction, requestEdit?: (request: Cm6EditRequest) => void): void {
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
    case 'underline':
      wrapInline(view, '<u>', '</u>', '下划线文本');
      return;
    case 'sup':
      wrapInline(view, '<sup>', '</sup>', '上标');
      return;
    case 'sub':
      wrapInline(view, '<sub>', '</sub>', '下标');
      return;
    case 'highlight':
      wrapInline(view, '==', '==', '高亮文本');
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
    case 'heading-up':
      changeHeadingLevel(view, true);
      return;
    case 'heading-down':
      changeHeadingLevel(view, false);
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
    case 'math-block':
      insertMathBlock(view);
      return;
    case 'quote-up':
      changeQuoteLevel(view, true);
      return;
    case 'quote-down':
      changeQuoteLevel(view, false);
      return;
    case 'link-edit':
      editLink(view, requestEdit);
      return;
    case 'capture-format':
      capturedFormats.set(view, captureFormat(view));
      return;
    case 'apply-format':
      applyCapturedFormat(view, capturedFormats.get(view));
      return;
    case 'format-painter': {
      const captured = capturedFormats.get(view);
      if (captured) {
        applyCapturedFormat(view, captured);
        capturedFormats.delete(view);
      } else {
        capturedFormats.set(view, captureFormat(view));
      }
      return;
    }
    case 'clear-format':
      clearFormat(view);
      return;
    case 'codeblock-lang':
      editCodeBlockLanguage(view, requestEdit);
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

// 提升标题等级(Typora Ctrl+=):H2-H6 → 升一级;正文行 → H2;H1 保持。
// 降低标题等级(Typora Ctrl+-):H1 → 回正文;H2-H5 → 降一级;H6/正文保持。
function changeHeadingLevel(view: EditorView, upgrade: boolean): void {
  const sel = view.state.selection.main;
  const fromLine = view.state.doc.lineAt(sel.from);
  const toLine = sel.to <= fromLine.to && sel.from === fromLine.from
    ? fromLine
    : view.state.doc.lineAt(sel.to);
  const headingRe = /^(#{1,6})\s/;
  const changes = [];
  for (let n = fromLine.number; n <= toLine.number; n += 1) {
    const line = view.state.doc.line(n);
    const text = view.state.sliceDoc(line.from, line.to);
    const m = text.match(headingRe);
    if (upgrade) {
      if (!m) {
        changes.push({ from: line.from, insert: '## ' });
      } else if (m[1].length > 1) {
        changes.push({ from: line.from, to: line.from + m[0].length, insert: '#'.repeat(m[1].length - 1) + ' ' });
      }
    } else if (m) {
      const level = m[1].length;
      if (level === 1) {
        changes.push({ from: line.from, to: line.from + m[0].length, insert: '' });
      } else if (level < 6) {
        changes.push({ from: line.from, to: line.from + m[0].length, insert: '#'.repeat(level + 1) + ' ' });
      }
    }
  }
  if (changes.length === 0) return;
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

function insertMathBlock(view: EditorView): void {
  const sel = view.state.selection.main;
  const insert = '\n$$\n\n$$\n';
  view.dispatch({
    changes: { from: sel.from, insert },
    // 光标落在两个 $$ 围栏之间的空行,直接输入公式体
    selection: { anchor: sel.from + 4 },
  });
  view.focus();
}

function changeQuoteLevel(view: EditorView, upgrade: boolean): void {
  const selection = view.state.selection.main;
  const first = view.state.doc.lineAt(selection.from).number;
  const last = view.state.doc.lineAt(selection.to).number;
  const changes = [];
  for (let number = first; number <= last; number += 1) {
    const line = view.state.doc.line(number);
    const text = view.state.sliceDoc(line.from, line.to);
    const indent = text.match(/^[ \t]*/)?.[0] ?? '';
    const rest = text.slice(indent.length);
    const match = rest.match(/^(?:> ?)+/);
    const depth = match ? (match[0].match(/>/g)?.length ?? 0) : 0;
    const body = rest.slice(match?.[0].length ?? 0);
    const nextDepth = upgrade ? depth + 1 : Math.max(0, depth - 1);
    changes.push({
      from: line.from,
      to: line.to,
      insert: nextDepth === 0 ? `${indent}${body}` : `${indent}${'>'.repeat(nextDepth)} ${body}`,
    });
  }
  view.dispatch({ changes });
  view.focus();
}

function captureFormat(view: EditorView): CapturedFormat {
  const selection = view.state.selection.main;
  const line = view.state.doc.lineAt(selection.from);
  const text = view.state.doc.sliceString(line.from, line.to);
  const sample = selection.empty ? text : view.state.sliceDoc(selection.from, selection.to);
  return { bold: /\*\*[^*]+\*\*/u.test(sample), italic: /(^|[^*])\*[^*]+\*(?!\*)/u.test(sample), strike: /~~[^~]+~~/u.test(sample), code: /`[^`]+`/u.test(sample), prefix: text.match(/^(?:#{1,6}\s+|>\s+|[-*]\s(?:\[[ xX]\]\s+)?|\d+\.\s+)/u)?.[0] ?? null };
}

function applyCapturedFormat(view: EditorView, captured?: CapturedFormat): void {
  if (!captured) return;
  const selection = view.state.selection.main;
  let next = view.state.sliceDoc(selection.from, selection.to) || '文本';
  if (captured.code) next = `\`${next}\``;
  if (captured.strike) next = `~~${next}~~`;
  if (captured.italic) next = `*${next}*`;
  if (captured.bold) next = `**${next}**`;
  const line = view.state.doc.lineAt(selection.from);
  const from = captured.prefix ? line.from : selection.from;
  const to = captured.prefix ? line.to : selection.to;
  const insert = captured.prefix ? `${captured.prefix}${next}` : next;
  view.dispatch({ changes: { from, to, insert }, selection: { anchor: from, head: from + insert.length } });
  view.focus();
}

function editLink(view: EditorView, requestEdit?: (request: Cm6EditRequest) => void): void {
  const sel = view.state.selection.main;
  const link = findMarkdownLinkAt(view.state.doc.toString(), sel.from);
  if (!link) {
    console.warn('editLink: 光标处未找到 Markdown 链接');
    return;
  }
  const coords = safeCoords(view, sel.from);
  requestEdit?.({ kind: 'link', x: coords.left, y: coords.bottom + 6, label: link.label, url: link.url, title: link.title ?? '', apply: ({ label, url, title }) => {
    const current = findMarkdownLinkAt(view.state.doc.toString(), sel.from);
    const nextLink = `[${label || url}](${url}${title ? ` "${title}"` : ''})`;
    if (current) view.dispatch({ changes: { from: current.from, to: current.to, insert: nextLink }, selection: { anchor: current.from + nextLink.length } });
    view.focus();
  } });
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

const FENCE_LINE_RE = /^[ \t]{0,3}(`{3,}|~{3,})/;
const FENCE_OPEN_RE = /^([ \t]*)(`{3,}|~{3,})(.*)$/;

// 定位光标所在的 FencedCode 围栏块:优先语法树(真实编辑器挂载了 markdown
// 语言扩展,块内任意位置都能命中节点),语法树不可用/未解析完成时回退为
// 行扫描(从光标行向上找开 fence,再向下找同标记的闭合 fence)。
function findFencedCodeRange(state: EditorState, pos: number): { from: number; to: number } | null {
  let found: { from: number; to: number } | null = null;
  syntaxTree(state).iterate({
    enter: (node) => {
      if (found) return false;
      if (node.name === 'FencedCode') {
        if (pos >= node.from && pos <= node.to) found = { from: node.from, to: node.to };
        return false;
      }
      return true;
    },
  });
  return found ?? findFencedCodeRangeByScan(state, pos);
}

function findFencedCodeRangeByScan(state: EditorState, pos: number): { from: number; to: number } | null {
  const doc = state.doc;
  const startLine = doc.lineAt(pos);
  let openFrom: number | null = null;
  let marker = '';
  for (let n = startLine.number; n >= 1; n -= 1) {
    const m = doc.line(n).text.match(FENCE_LINE_RE);
    if (m) {
      openFrom = doc.line(n).from;
      marker = m[1];
      break;
    }
  }
  if (openFrom === null) return null;
  const openLineNumber = doc.lineAt(openFrom).number;
  for (let n = openLineNumber + 1; n <= doc.lines; n += 1) {
    const line = doc.line(n);
    const m = line.text.match(FENCE_LINE_RE);
    if (m && m[1][0] === marker[0] && m[1].length >= marker.length) {
      return { from: openFrom, to: line.to };
    }
  }
  return null;
}

function editCodeBlockLanguage(view: EditorView, requestEdit?: (request: Cm6EditRequest) => void): void {
  const sel = view.state.selection.main;
  // 右键落点驱动(P0-A 已把光标移到落点);选区保留时优先探测选区起点。
  const probe = sel.empty ? sel.head : sel.from;
  const range = findFencedCodeRange(view.state, probe);
  if (!range) return;
  const openLine = view.state.doc.lineAt(range.from);
  const fenceMatch = openLine.text.match(FENCE_OPEN_RE);
  if (!fenceMatch) return;
  const language = fenceMatch[3].trim();
  const coords = safeCoords(view, range.from);
  requestEdit?.({ kind: 'code', x: coords.left, y: coords.bottom + 6, language, apply: (nextLanguage) => {
    // 弹窗确认前文档可能已变:原范围仍是 fence 行首则沿用,否则按光标重扫。
    let from = range.from;
    const verifyLine = view.state.doc.lineAt(Math.min(from, view.state.doc.length));
    if (verifyLine.from !== range.from || !FENCE_LINE_RE.test(verifyLine.text)) {
      const rescan = findFencedCodeRange(view.state, view.state.selection.main.head);
      if (!rescan) return;
      from = rescan.from;
    }
    const line = view.state.doc.lineAt(from);
    const m = line.text.match(FENCE_OPEN_RE);
    if (!m) return;
    const next = `${m[1]}${m[2]}${nextLanguage}`;
    view.dispatch({ changes: { from: line.from, to: line.to, insert: next }, selection: { anchor: line.from + next.length } });
    view.focus();
  } });
}

function safeCoords(view: EditorView, pos: number): { left: number; bottom: number } {
  try {
    const coords = view.coordsAtPos(pos);
    return coords ? { left: coords.left, bottom: coords.bottom } : { left: 16, bottom: 16 };
  } catch {
    return { left: 16, bottom: 16 };
  }
}

// 粘贴智能链路(键盘 onPaste 与右键菜单"粘贴"共用):
// 表格(TSV/CSV/HTML 表格) → 结构化 HTML 转 Markdown → 调用方自行回退纯文本。
// 返回 true 表示已消费,调用方不应再执行默认粘贴/插入。
export function applyClipboardData(view: EditorView, plain: string, html?: string): boolean {
  if (pasteTableData(view, plain, html)) return true;
  if (html) {
    const markdown = convertHtmlPasteToMarkdown(html);
    if (markdown !== null) {
      const selection = view.state.selection.main;
      view.dispatch({
        changes: { from: selection.from, to: selection.to, insert: markdown },
        selection: { anchor: selection.from + markdown.length },
      });
      view.focus();
      return true;
    }
  }
  return false;
}

function insertClipboardText(view: EditorView, text: string): void {
  const sel = view.state.selection.main;
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: text },
    selection: { anchor: sel.from + text.length },
  });
  view.focus();
}

// 菜单"粘贴"与键盘 Ctrl+V 行为对齐(Typora 惯例):优先 clipboard.read() 拿
// text/html + text/plain 走智能链路;read 不可用/失败时回退 readText 纯文本。
async function pasteFromClipboard(view: EditorView): Promise<void> {
  let plain = '';
  let html: string | undefined;
  if (typeof navigator.clipboard?.read === 'function') {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        if (html === undefined && item.types.includes('text/html')) {
          html = await (await item.getType('text/html')).text();
        }
        if (!plain && item.types.includes('text/plain')) {
          plain = await (await item.getType('text/plain')).text();
        }
      }
    } catch (error) {
      console.warn('clipboard.read failed, fallback to readText:', error);
    }
  }
  if (html === undefined && !plain && typeof navigator.clipboard?.readText === 'function') {
    try {
      plain = await navigator.clipboard.readText();
    } catch (error) {
      console.warn('Paste failed:', error);
      return;
    }
  }
  if (!plain && !html) return;
  if (applyClipboardData(view, plain, html)) return;
  if (plain) insertClipboardText(view, plain);
}

function selectAll(view: EditorView): void {
  view.dispatch({
    selection: { anchor: 0, head: view.state.doc.length },
  });
  view.focus();
}
