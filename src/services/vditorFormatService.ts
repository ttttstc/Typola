import type Vditor from 'vditor';
import type { FormatAction, HeadingLevel } from '../components/EditorContextMenu';

// 应用一个格式化动作到 Vditor 编辑器。
// 行内格式(加粗/斜体/删除线/行内代码)走 Vditor 的 getSelection + updateValue/insertValue,光标保留。
// 块格式(引用/列表/代码块/分隔线/链接)走 insertValue。
// 标题级别走 markdown source 操作 + setValue —— 在当前段落首行加/换前缀。
// 基础操作(剪切/复制/粘贴/全选)走 document.execCommand 与 clipboard API。
export async function applyVditorFormat(editor: Vditor, action: FormatAction): Promise<void> {
  switch (action.type) {
    case 'bold':
      wrapInline(editor, '**', '**', '加粗文本');
      return;
    case 'italic':
      wrapInline(editor, '*', '*', '斜体文本');
      return;
    case 'strike':
      wrapInline(editor, '~~', '~~', '删除线');
      return;
    case 'inline-code':
      wrapInline(editor, '`', '`', 'code');
      return;
    case 'link': {
      const sel = editor.getSelection();
      const label = sel || '链接文字';
      editor.updateValue(`[${label}](https://)`);
      return;
    }
    case 'heading':
      applyHeading(editor, action.level);
      return;
    case 'quote':
      editor.insertValue('\n\n> 引用\n\n', true);
      return;
    case 'ul':
      editor.insertValue('\n\n- 列表项\n- 列表项\n\n', true);
      return;
    case 'ol':
      editor.insertValue('\n\n1. 列表项\n2. 列表项\n\n', true);
      return;
    case 'task':
      editor.insertValue('\n\n- [ ] 任务项\n- [ ] 任务项\n\n', true);
      return;
    case 'codeblock':
      editor.insertValue('\n\n```\n代码\n```\n\n', true);
      return;
    case 'hr':
      editor.insertValue('\n\n---\n\n', true);
      return;
    case 'quote-up':
    case 'quote-down':
      applyQuoteLevel(editor, action.type === 'quote-up');
      return;
    case 'link-edit':
      await applyLinkEdit(editor);
      return;
    case 'clear-format':
      applyClearFormat(editor);
      return;
    case 'codeblock-lang':
      await applyCodeblockLang(editor);
      return;
    case 'cut':
      document.execCommand('cut');
      return;
    case 'copy':
      document.execCommand('copy');
      return;
    case 'paste':
      await pasteFromClipboard(editor);
      return;
    case 'select-all':
      selectAllInIr(editor);
      return;
    case 'table-insert':
      // Vditor 写作路径已废,P0 仅 CM6 支持表格,此处 no-op 兜类型。
      return;
    case 'table-align':
    case 'table-row-insert':
    case 'table-row-delete':
    case 'table-column-insert':
    case 'table-column-delete':
      // @deprecated Vditor 写作路径已退出主链路；表格命令仅由 CM6 transaction 实现。
      return;
  }
}

function wrapInline(editor: Vditor, open: string, close: string, placeholder: string) {
  const sel = editor.getSelection();
  if (sel) {
    editor.updateValue(`${open}${sel}${close}`);
  } else {
    editor.insertValue(`${open}${placeholder}${close}`, true);
  }
}

// 找到光标所在的段落 block(h1..h6 / p / li / blockquote),并把它在 markdown source 中对应的行改前缀。
// level === 0 表示「正文」,会清掉行首的 # 前缀。
function applyHeading(editor: Vditor, level: HeadingLevel) {
  const ir = getIrElement(editor);
  if (!ir) return;
  const sel = ir.ownerDocument?.defaultView?.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const startNode = sel.getRangeAt(0).startContainer;
  let block: HTMLElement | null =
    startNode.nodeType === Node.TEXT_NODE ? startNode.parentElement : (startNode as HTMLElement);
  while (block && block !== ir && !/^(H[1-6]|P)$/.test(block.tagName)) {
    block = block.parentElement;
  }
  if (!block || block === ir) return;
  const blockText = normalizeWhitespace(block.textContent ?? '');
  if (!blockText) return;

  const source = editor.getValue();
  const lines = source.split('\n');
  // 在 source 里找到与 block 文本最匹配的一行(去掉 # 前缀后比对)。
  // 简化:取第一个匹配。重复段落场景退而求其次。
  let lineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const text = normalizeWhitespace(lines[i].replace(/^#{1,6}\s+/, ''));
    if (text === blockText) {
      lineIdx = i;
      break;
    }
  }
  if (lineIdx < 0) return;

  const body = lines[lineIdx].replace(/^#{1,6}\s+/, '');
  const prefix = level === 0 ? '' : '#'.repeat(level) + ' ';
  lines[lineIdx] = prefix + body;
  editor.setValue(lines.join('\n'), false);
}

async function pasteFromClipboard(editor: Vditor) {
  try {
    const text = await navigator.clipboard.readText();
    if (text) editor.insertValue(text, true);
  } catch (error) {
    console.warn('Paste failed:', error);
  }
}

function selectAllInIr(editor: Vditor) {
  const ir = getIrElement(editor);
  if (!ir) return;
  const sel = ir.ownerDocument?.defaultView?.getSelection();
  if (!sel) return;
  const range = ir.ownerDocument!.createRange();
  range.selectNodeContents(ir);
  sel.removeAllRanges();
  sel.addRange(range);
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// 取光标所在行(从 value 中按光标位置反查)。
// 简化:用 IR DOM 选区读出行文本,再在 source 里找对应行。
function currentLineRange(editor: Vditor): { start: number; end: number; text: string } | null {
  const ir = getIrElement(editor);
  if (!ir) return null;
  const sel = ir.ownerDocument?.defaultView?.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  let node: Node | null = range.startContainer;
  if (node && node.nodeType !== Node.TEXT_NODE) {
    node = node.firstChild;
  }
  if (!node) return null;
  // 向上找段落级祖先(P / H1..H6 / LI / BLOCKQUOTE)。
  let el: HTMLElement | null = node instanceof HTMLElement ? node : node.parentElement;
  while (el && el !== ir && !/^(H[1-6]|P|LI|BLOCKQUOTE)$/.test(el.tagName)) {
    el = el.parentElement;
  }
  if (!el || el === ir) return null;
  const lineText = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (!lineText) return null;
  const value = editor.getValue();
  // 在 source 里找与 lineText 匹配的行(去掉 markdown 前缀后比对)。
  let offset = 0;
  for (const rawLine of value.split('\n')) {
    const normalized = rawLine.replace(/^\s{0,3}(#{1,6}\s+|>\s*|[-\\*+]\s+|\d+\.\s+)/, '').replace(/\s+/g, ' ').trim();
    if (normalized === lineText) {
      return { start: offset, end: offset + rawLine.length, text: rawLine };
    }
    offset += rawLine.length + 1;
  }
  return null;
}

// 升级/降级引用:在行首加 / 剥一个 `> ` 前缀。
function applyQuoteLevel(editor: Vditor, upgrade: boolean): void {
  const line = currentLineRange(editor);
  if (!line) return;
  const value = editor.getValue();
  const prefix = value.slice(0, line.start);
  const suffix = value.slice(line.end);
  const newLine = transformQuoteLine(line.text, upgrade);
  editor.updateValue(prefix + newLine + suffix);
}

// 纯函数:把一行 markdown 文本按 upgrade 切换 quote 深度(供单测直接覆盖)。
//   普通行 + upgrade   → '> text'
//   普通行 + !upgrade  → 'text'(no-op)
//   '> text' + upgrade → '>> text'
//   '>> text' + !upgrade→ '> text'
//   缩进保留,quote↔body 间统一 1 空格(Markdown 兼容写法);`>  text` 等多空格场景统一压紧为 1。
//
// 算法:char-loop 抓 line 起始(跳过缩进)的连续 `>`,每层之间最多 1 个空格,
// 任何文本字符即停。深度计算后重组:`>` × newDepth + 1 空格 + body。
export function transformQuoteLine(text: string, upgrade: boolean): string {
  const ws = text.match(/^[ \t]*/)![0];
  const rest = text.slice(ws.length);
  let i = 0;
  let depth = 0;
  while (i < rest.length && rest[i] === '>') {
    depth += 1;
    i += 1;
    // 跳过 `>` 后紧跟的单空格(被我们视作 quote-layer 间的合法分隔)。
    if (i < rest.length && rest[i] === ' ') i += 1;
  }
  const body = rest.slice(i);
  const newDepth = upgrade ? depth + 1 : Math.max(0, depth - 1);
  if (newDepth === 0) {
    return ws + body;
  }
  return ws + '>'.repeat(newDepth) + ' ' + body;
}

// 编辑链接:选区必须是 markdown 链接 `[label](url)`,prompt 改 url。
async function applyLinkEdit(editor: Vditor): Promise<void> {
  const sel = editor.getSelection();
  if (!sel) return;
  const m = sel.match(/^\[([^\]]*)\]\(([^)]+)\)$/);
  if (!m) return;
  const label = m[1];
  const currentUrl = m[2];
  const next = window.prompt('链接网址', currentUrl);
  if (next === null) return;
  const value = editor.getValue();
  const idx = value.indexOf(sel);
  if (idx < 0) return;
  const nextValue = value.slice(0, idx) + `[${label}](${next})` + value.slice(idx + sel.length);
  editor.updateValue(nextValue);
}

// 清除格式:strip 选区文本的常见 markdown 标记。
// 严格 blockquote regex:要求 `> ` 后跟非空白内容,避免误伤 plain `>5`/`>`/`>abc` 等箭头字符。
function applyClearFormat(editor: Vditor): void {
  const sel = editor.getSelection();
  if (!sel) return;
  const stripped = sel
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
    .replace(/_{1,3}([^_]+)_{1,3}/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^(\s{0,3}>\s+)(?=\S)/gm, '')
    .replace(/^\s{0,3}(?:[-*+]|\d+\.)\s+(?=\S)/gm, '');
  if (stripped === sel) return;
  const value = editor.getValue();
  const idx = value.indexOf(sel);
  if (idx < 0) return;
  editor.updateValue(value.slice(0, idx) + stripped + value.slice(idx + sel.length));
}

// 编辑代码块语言:选区必须是 fenced code block `` ```lang\n...\n``` ``,prompt 改 lang。
async function applyCodeblockLang(editor: Vditor): Promise<void> {
  const sel = editor.getSelection();
  if (!sel) return;
  const m = sel.match(/^```([^\n]*)\n([\s\S]*?)\n```$/);
  if (!m) return;
  const currentLang = m[1];
  const code = m[2];
  const next = window.prompt('代码语言', currentLang);
  if (next === null) return;
  const fence = '```' + next + '\n' + code + '\n```';
  const value = editor.getValue();
  const idx = value.indexOf(sel);
  if (idx < 0) return;
  editor.updateValue(value.slice(0, idx) + fence + value.slice(idx + sel.length));
}

function getIrElement(editor: Vditor): HTMLElement | null {
  const inner = (editor as unknown as { vditor?: { ir?: { element?: HTMLElement } } }).vditor;
  return inner?.ir?.element ?? null;
}
