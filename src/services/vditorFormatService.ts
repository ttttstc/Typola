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

function getIrElement(editor: Vditor): HTMLElement | null {
  const inner = (editor as unknown as { vditor?: { ir?: { element?: HTMLElement } } }).vditor;
  return inner?.ir?.element ?? null;
}
