import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { type EditorState, type Extension, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view';
import { loadKatex } from '../../../services/lazyKatex';
import { getBlockRender } from './blockRenderCache';

type MathRange = { from: number; to: number; source: string; block: boolean };

function cursorTouches(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((range) => range.from <= to && range.to >= from);
}

class MathWidget extends WidgetType {
  private readonly source: string;
  private readonly block: boolean;
  private readonly themeId: string;
  private readonly refresh: () => void;

  constructor(
    source: string, block: boolean, themeId: string, refresh: () => void,
  ) {
    super();
    this.source = source;
    this.block = block;
    this.themeId = themeId;
    this.refresh = refresh;
  }

  eq(other: MathWidget): boolean {
    return other.source === this.source && other.block === this.block && other.themeId === this.themeId;
  }

  toDOM(): HTMLElement {
    const element = document.createElement(this.block ? 'div' : 'span');
    element.className = this.block ? 'typola-cm6-math-block' : 'typola-cm6-math-inline';
    this.paint(element);
    return element;
  }

  private paint(element: HTMLElement): void {
    const result = getBlockRender('katex', this.source, this.themeId, async () => {
      const katex = await loadKatex();
      return katex.renderToString(this.source, { displayMode: this.block, throwOnError: true });
    }, () => {
      this.refresh();
      if (element.isConnected) this.paint(element);
    });
    if (result.state === 'ready') element.innerHTML = result.html;
    else if (result.state === 'error') {
      element.classList.add('typola-cm6-math-error');
      element.textContent = `KaTeX 渲染失败：${result.message}`;
    } else {
      element.classList.add('typola-cm6-math-loading');
      element.textContent = '公式渲染中…';
    }
  }
}

function collectInlineMathRanges(view: EditorView): MathRange[] {
  const { state } = view;
  const ranges: MathRange[] = [];
  for (const viewport of view.visibleRanges) {
    let line = state.doc.lineAt(viewport.from);
    while (line.from <= viewport.to) {
      const matcher = /(?<!\$)\$([^$\n]+?)\$(?!\$)/gu;
      let match: RegExpExecArray | null;
      while ((match = matcher.exec(line.text)) !== null) {
        const from = line.from + match.index;
        const to = from + match[0].length;
        if (!cursorTouches(state, from, to)) ranges.push({ from, to, source: match[1] ?? '', block: false });
      }
      if (line.to >= viewport.to || line.number === state.doc.lines) break;
      line = state.doc.line(line.number + 1);
    }
  }
  return ranges;
}

function collectBlockMathRanges(state: EditorState): MathRange[] {
  const ranges: MathRange[] = [];
  const tree = ensureSyntaxTree(state, state.doc.length, 1000) ?? syntaxTree(state);
  tree.iterate({ enter(node: any) {
    if (node.name !== 'FencedCode') return;
    const info = node.node.getChild('CodeInfo');
    const code = node.node.getChild('CodeText');
    const language = info ? state.doc.sliceString(info.from, info.to).trim().toLowerCase() : '';
    const source = code ? state.doc.sliceString(code.from, code.to).trim() : '';
    if ((language === 'math' || language === 'katex') && source && !cursorTouches(state, node.from, node.to)) {
      ranges.push({ from: node.from, to: node.to, source, block: true });
    }
  } });
  let opening: { from: number; to: number } | null = null;
  for (let number = 1; number <= state.doc.lines; number += 1) {
    const line = state.doc.line(number);
    if (line.text.trim() !== '$$') continue;
    if (!opening) { opening = line; continue; }
    const source = state.doc.sliceString(opening.to + 1, line.from).trim();
    if (source && !cursorTouches(state, opening.from, line.to)) {
      ranges.push({ from: opening.from, to: line.to, source, block: true });
    }
    opening = null;
  }
  return ranges;
}

export function mathPreviewExtension(themeId = 'light'): Extension[] {
  const inlineMathPlugin = ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    private readonly view: EditorView;
    constructor(view: EditorView) { this.view = view; this.decorations = this.build(); }
    build(): DecorationSet {
      return Decoration.set(collectInlineMathRanges(this.view).map(({ from, to, source, block }) =>
        Decoration.replace({ widget: new MathWidget(source, block, themeId, () => {}), block }).range(from, to),
      ), true);
    }
    update(update: ViewUpdate): void {
      if (update.docChanged || update.viewportChanged || update.selectionSet) this.decorations = this.build();
    }
  }, { decorations: (plugin) => plugin.decorations });
  const blockMathField = StateField.define<DecorationSet>({
    create(state) {
      return Decoration.set(collectBlockMathRanges(state).map(({ from, to, source, block }) =>
        Decoration.replace({ widget: new MathWidget(source, block, themeId, () => {}), block: true }).range(from, to),
      ), true);
    },
    update(decorations, transaction) {
      if (transaction.docChanged || transaction.selection || transaction.reconfigured) {
        return Decoration.set(collectBlockMathRanges(transaction.state).map(({ from, to, source, block }) =>
          Decoration.replace({ widget: new MathWidget(source, block, themeId, () => {}), block: true }).range(from, to),
        ), true);
      }
      return decorations;
    },
    provide: (field) => EditorView.decorations.from(field),
  });
  return [inlineMathPlugin, blockMathField];
}
