import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { type EditorState, type Extension, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import DOMPurify from 'dompurify';
import { getBlockRender } from './blockRenderCache';

let renderCount = 0;
let mermaidPromise: Promise<typeof import('mermaid').default> | null = null;

function loadMermaid(theme: 'default' | 'dark') {
  mermaidPromise ??= import('mermaid').then((module) => module.default);
  return mermaidPromise.then((mermaid) => {
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme, flowchart: { useMaxWidth: true } });
    return mermaid;
  });
}

function cursorTouches(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((range) => range.from <= to && range.to >= from);
}

class MermaidWidget extends WidgetType {
  private readonly source: string;
  private readonly themeId: string;
  private readonly refresh: () => void;

  constructor(
    source: string, themeId: string, refresh: () => void,
  ) {
    super();
    this.source = source;
    this.themeId = themeId;
    this.refresh = refresh;
  }

  eq(other: MermaidWidget): boolean { return other.source === this.source && other.themeId === this.themeId; }

  toDOM(): HTMLElement {
    const element = document.createElement('div');
    element.className = 'typola-cm6-mermaid';
    this.paint(element);
    return element;
  }

  private paint(element: HTMLElement): void {
    const theme = this.themeId.includes('dark') ? 'dark' : 'default';
    const result = getBlockRender('mermaid', this.source, this.themeId, async () => {
      const mermaid = await loadMermaid(theme);
      const { svg } = await mermaid.render(`typola-cm6-mermaid-${renderCount++}`, this.source);
      return DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
    }, () => {
      this.refresh();
      if (element.isConnected) this.paint(element);
    });
    if (result.state === 'ready') element.innerHTML = result.html;
    else if (result.state === 'error') {
      element.classList.add('typola-cm6-mermaid-error');
      element.textContent = `Mermaid 渲染失败：${result.message}`;
    } else element.textContent = 'Mermaid 渲染中…';
  }
}

function collectMermaidRanges(state: EditorState): Array<{ from: number; to: number; source: string }> {
  const ranges: Array<{ from: number; to: number; source: string }> = [];
  const tree = ensureSyntaxTree(state, state.doc.length, 1000) ?? syntaxTree(state);
  tree.iterate({ enter(node: any) {
    if (node.name !== 'FencedCode') return;
    const info = node.node.getChild('CodeInfo');
    const code = node.node.getChild('CodeText');
    if (!info || state.doc.sliceString(info.from, info.to).trim().toLowerCase() !== 'mermaid') return;
    const source = code ? state.doc.sliceString(code.from, code.to).trim() : '';
    if (source && !cursorTouches(state, node.from, node.to)) ranges.push({ from: node.from, to: node.to, source });
  } });
  return ranges;
}

export function mermaidPreviewExtension(themeId = 'light'): Extension {
  const mermaidField = StateField.define<DecorationSet>({
    create(state) {
      return Decoration.set(collectMermaidRanges(state).map(({ from, to, source }) =>
        Decoration.replace({ widget: new MermaidWidget(source, themeId, () => {}), block: true }).range(from, to),
      ), true);
    },
    update(decorations, transaction) {
      if (transaction.docChanged || transaction.selection || transaction.reconfigured) {
        return Decoration.set(collectMermaidRanges(transaction.state).map(({ from, to, source }) =>
          Decoration.replace({ widget: new MermaidWidget(source, themeId, () => {}), block: true }).range(from, to),
        ), true);
      }
      return decorations;
    },
    provide: (field) => EditorView.decorations.from(field),
  });
  return mermaidField;
}
