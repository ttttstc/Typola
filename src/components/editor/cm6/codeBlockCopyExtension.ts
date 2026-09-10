// 代码块复制按钮(Typora hover 代码块右上角"复制"):
// - 语法树找 FencedCode 块,光标不在块内时在 fence 行行首挂一个内联
//   widget 按钮(绝对定位到块首行右上角,样式见 app.css);
// - 点击写入 CodeText 内容(不含 fence 行),按钮短暂变为"已复制";
// - mermaid/math 围栏块已由对应 preview 扩展整块替换,跳过避免装饰冲突;
// - 复用 mermaidPreviewExtension 的 StateField + ensureSyntaxTree 模式。

import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { StateField, type EditorState, type Extension } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { writeText } from '../../../services/clipboardService';

export const CODE_COPY_BUTTON_CLASS = 'typola-cm6-code-copy';

/** 已由专门扩展整块替换的围栏语言,不再挂复制按钮。 */
const REPLACED_INFO_RE = /^(?:mermaid|math)$/iu;

// 严格重叠判定:光标位于闭合 fence 之后(如文档以代码块结尾、光标在末尾)
// 不算"进入块内",按钮保持可见;光标在块内(from < pos < to)才隐藏。
function cursorTouches(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((range) => range.from < to && range.to > from);
}

class CodeCopyWidget extends WidgetType {
  private readonly code: string;

  constructor(code: string) {
    super();
    this.code = code;
  }

  eq(other: CodeCopyWidget): boolean {
    return other.code === this.code;
  }

  // 事件不交给编辑器处理(点击按钮不应移动光标/抢焦点)。
  ignoreEvent(): boolean {
    return true;
  }

  toDOM(): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = CODE_COPY_BUTTON_CLASS;
    button.title = '复制代码';
    button.setAttribute('aria-label', '复制代码');
    button.innerHTML = COPY_ICON_SVG;
    button.append('复制');
    // contenteditable 内的按钮:mousedown 阻断默认行为,避免点击时
    // 光标跳动/编辑器抢焦点。
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.copy(button);
    });
    return button;
  }

  private async copy(button: HTMLButtonElement): Promise<void> {
    if (button.classList.contains('is-copied')) return;
    try {
      await writeText(this.code);
      button.classList.add('is-copied');
      button.textContent = '已复制';
      window.setTimeout(() => {
        button.classList.remove('is-copied');
        button.innerHTML = COPY_ICON_SVG;
        button.append('复制');
      }, 1500);
    } catch {
      // 剪贴板不可用时静默失败,不打断编辑。
    }
  }
}

const COPY_ICON_SVG =
  '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"></rect><path d="M10.5 5.5v-2a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3.5v5A1.5 1.5 0 0 0 4 10h1.5"></path></svg>';

function collectCodeBlockRanges(state: EditorState): Array<{ from: number; code: string }> {
  const ranges: Array<{ from: number; code: string }> = [];
  const tree = ensureSyntaxTree(state, state.doc.length, 1000) ?? syntaxTree(state);
  tree.iterate({ enter(node: any) {
    if (node.name !== 'FencedCode') return;
    const info = node.node.getChild('CodeInfo');
    const code = node.node.getChild('CodeText');
    if (!code) return;
    if (info && REPLACED_INFO_RE.test(state.doc.sliceString(info.from, info.to).trim())) return;
    if (cursorTouches(state, node.from, node.to)) return;
    ranges.push({ from: node.from, code: state.doc.sliceString(code.from, code.to) });
  } });
  return ranges;
}

function buildCopyButtonDecorations(state: EditorState): DecorationSet {
  return Decoration.set(collectCodeBlockRanges(state).map(({ from, code }) =>
    Decoration.widget({ widget: new CodeCopyWidget(code), side: -1 }).range(from),
  ), true);
}

export function codeBlockCopyExtension(): Extension {
  const copyField = StateField.define<DecorationSet>({
    create: buildCopyButtonDecorations,
    update(decorations, transaction) {
      if (
        transaction.docChanged || transaction.selection || transaction.reconfigured
        || syntaxTree(transaction.startState).length !== syntaxTree(transaction.state).length
      ) {
        return buildCopyButtonDecorations(transaction.state);
      }
      return decorations;
    },
    provide: (field) => EditorView.decorations.from(field),
  });
  return [copyField];
}
