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
  WidgetType,
} from '@codemirror/view';
import DOMPurify from 'dompurify';

let mermaidApiPromise: Promise<typeof import('mermaid').default> | null = null;
let fallbackRenderCounter = 0;

function loadMermaid() {
  mermaidApiPromise ??= import('mermaid').then((module) => {
    module.default.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'default',
    });
    return module.default;
  });
  return mermaidApiPromise;
}

class MermaidWidget extends WidgetType {
  private readonly source: string;
  private readonly renderId: string;

  constructor(source: string) {
    super();
    this.source = source;
    fallbackRenderCounter += 1;
    this.renderId = `typola-cm6-mermaid-${globalThis.crypto?.randomUUID?.() ?? fallbackRenderCounter}`;
  }

  eq(other: MermaidWidget): boolean {
    return other.source === this.source;
  }

  toDOM(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'typola-cm6-mermaid';
    container.textContent = 'Mermaid 渲染中...';

    loadMermaid()
      .then((mermaid) => mermaid.render(this.renderId, this.source))
      .then(({ svg }) => {
        container.innerHTML = DOMPurify.sanitize(svg, {
          USE_PROFILES: { svg: true, svgFilters: true },
        });
      })
      .catch((error: unknown) => {
        container.classList.add('typola-cm6-mermaid-error');
        container.textContent = `Mermaid 渲染失败：${error instanceof Error ? error.message : String(error)}`;
      });

    return container;
  }
}

function cursorTouches(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((range) => range.from <= to && range.to >= from);
}

function buildMermaidDecorations(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = [];

  const tree = ensureSyntaxTree(state, state.doc.length, 1000) ?? syntaxTree(state);
  tree.iterate({
    enter(node) {
      if (node.name !== 'FencedCode') return;
      const codeInfo = node.node.getChild('CodeInfo');
      if (!codeInfo) return;
      const language = state.doc.sliceString(codeInfo.from, codeInfo.to).trim().toLowerCase();
      if (language !== 'mermaid') return;
      const codeText = node.node.getChild('CodeText');
      const source = codeText ? state.doc.sliceString(codeText.from, codeText.to).trim() : '';
      if (!source || cursorTouches(state, node.from, node.to)) return;
      ranges.push(
        Decoration.replace({ widget: new MermaidWidget(source), block: true }).range(node.from, node.to),
      );
    },
  });

  return Decoration.set(ranges, true);
}

const mermaidField = StateField.define<DecorationSet>({
  create(state) {
    return buildMermaidDecorations(state);
  },
  update(decorations, transaction) {
    if (transaction.docChanged || transaction.selection || transaction.reconfigured) {
      return buildMermaidDecorations(transaction.state);
    }
    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export function mermaidPreviewExtension(): Extension {
  return mermaidField;
}
