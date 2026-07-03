import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import {
  type EditorState,
  type Extension,
  Range,
  StateField,
} from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { loadKatex } from '../../../services/lazyKatex';

let katexModule: any = null;
let katexLoading = false;

function ensureKatexLoaded(): void {
  if (katexModule || katexLoading) return;
  katexLoading = true;
  loadKatex().then((mod) => { katexModule = mod; });
}

class MathWidget extends WidgetType {
  private readonly source: string;
  private readonly block: boolean;

  constructor(source: string, block: boolean) {
    super();
    this.source = source;
    this.block = block;
  }

  eq(other: MathWidget): boolean {
    return other.source === this.source && other.block === this.block;
  }

  toDOM(): HTMLElement {
    const element = document.createElement(this.block ? 'div' : 'span');
    element.className = this.block ? 'typola-cm6-math-block' : 'typola-cm6-math-inline';

    if (katexModule) {
      try {
        element.innerHTML = katexModule.renderToString(this.source, {
          displayMode: this.block,
          throwOnError: false,
        });
      } catch {
        element.textContent = this.source;
        element.classList.add('typola-cm6-math-error');
      }
    } else {
      element.textContent = this.source;
      element.classList.add('typola-cm6-math-loading');
      ensureKatexLoaded();
    }
    return element;
  }
}

function cursorTouches(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((range) => range.from <= to && range.to >= from);
}

function buildInlineMathDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];

  for (const viewport of view.visibleRanges) {
    let line = view.state.doc.lineAt(viewport.from);
    while (line.from <= viewport.to) {
      const text = line.text;
      const regex = /(?<!\$)\$([^$\n]+?)\$(?!\$)/gu;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        const start = line.from + match.index;
        const end = start + match[0].length;
        if (!cursorTouches(view.state, start, end)) {
          ranges.push(
            Decoration.replace({ widget: new MathWidget(match[1] ?? '', false) }).range(start, end),
          );
        }
      }

      if (line.to >= viewport.to || line.number >= view.state.doc.lines) break;
      line = view.state.doc.line(line.number + 1);
    }
  }

  return Decoration.set(ranges, true);
}

const inlineMathPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildInlineMathDecorations(view);
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildInlineMathDecorations(update.view);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
  },
);

function buildBlockMathDecorations(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = [];

  const tree = ensureSyntaxTree(state, state.doc.length, 1000) ?? syntaxTree(state);
  tree.iterate({
    enter(node: any) {
      if (node.name !== 'FencedCode') return;
      const codeInfo = node.node.getChild('CodeInfo');
      if (!codeInfo) return;
      const language = state.doc.sliceString(codeInfo.from, codeInfo.to).trim().toLowerCase();
      if (language !== 'math' && language !== 'katex') return;
      const codeText = node.node.getChild('CodeText');
      const source = codeText ? state.doc.sliceString(codeText.from, codeText.to).trim() : '';
      if (!source || cursorTouches(state, node.from, node.to)) return;
      ranges.push(
        Decoration.replace({ widget: new MathWidget(source, true), block: true }).range(node.from, node.to),
      );
    },
  });

  let openLine: { from: number; to: number } | null = null;
  for (let lineNo = 1; lineNo <= state.doc.lines; lineNo += 1) {
    const line = state.doc.line(lineNo);
    if (line.text.trim() !== '$$') continue;
    if (!openLine) {
      openLine = { from: line.from, to: line.to };
      continue;
    }

    const source = state.doc.sliceString(openLine.to + 1, line.from).trim();
    const from = openLine.from;
    const to = line.to;
    if (source && !cursorTouches(state, from, to)) {
      ranges.push(
        Decoration.replace({ widget: new MathWidget(source, true), block: true }).range(from, to),
      );
    }
    openLine = null;
  }

  return Decoration.set(ranges, true);
}

const blockMathField = StateField.define<DecorationSet>({
  create(state) {
    return buildBlockMathDecorations(state);
  },
  update(_decorations, transaction) {
    if (transaction.docChanged || transaction.selection || transaction.reconfigured) {
      return buildBlockMathDecorations(transaction.state);
    }
    return _decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export function mathPreviewExtension(): Extension[] {
  ensureKatexLoaded();
  return [inlineMathPlugin, blockMathField];
}
