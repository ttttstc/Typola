import { StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import { sanitizeHtml } from '../../../services/sanitizeService';

function selectionIntersects(selection: EditorView['state']['selection']['ranges'][number], from: number, to: number): boolean {
  if (selection.empty) return selection.from > from && selection.from < to;
  return selection.from < to && selection.to > from;
}

function renderMarkdownHighlights(root: HTMLElement): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let current: Node | null = walker.nextNode();
  while (current) {
    textNodes.push(current as Text);
    current = walker.nextNode();
  }

  for (const textNode of textNodes) {
    const text = textNode.nodeValue ?? '';
    const pattern = /==([^=\n]+)==/gu;
    let cursor = 0;
    let changed = false;
    const fragment = document.createDocumentFragment();
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      changed = true;
      if (match.index > cursor) fragment.append(document.createTextNode(text.slice(cursor, match.index)));
      const mark = document.createElement('mark');
      mark.textContent = match[1];
      fragment.append(mark);
      cursor = match.index + match[0].length;
    }

    if (!changed) continue;
    if (cursor < text.length) fragment.append(document.createTextNode(text.slice(cursor)));
    textNode.replaceWith(fragment);
  }
}

class HtmlWidget extends WidgetType {
  private readonly source: string;
  constructor(source: string) { super(); this.source = source; }
  eq(other: HtmlWidget) { return other.source === this.source; }
  toDOM(): HTMLElement {
    const element = document.createElement('div');
    element.className = 'typola-cm6-html';
    element.innerHTML = sanitizeHtml(this.source);
    renderMarkdownHighlights(element);
    return element;
  }
}

function build(state: EditorView['state']) {
  const source = state.doc.toString(); const ranges = [];
  const pattern = /<!--[\s\S]*?-->|<(details|div|table|figure|blockquote)\b[^>]*>[\s\S]*?<\/\1>|<(kbd|mark|sub|sup)\b[^>]*>[^\n]*?<\/\2>|<(script|style|textarea|template)\b[^>]*>[\s\S]*?<\/\3>/giu;
  for (const match of source.matchAll(pattern)) {
    const from = match.index ?? 0; const to = from + match[0].length;
    if (state.selection.ranges.some((selection) => selectionIntersects(selection, from, to))) continue;
    ranges.push(Decoration.replace({ widget: new HtmlWidget(match[0]), block: /^(details|div|table|figure|blockquote)/iu.test(match[1] ?? '') }).range(from, to));
  }
  return Decoration.set(ranges, true);
}

export function htmlPreviewExtension(): Extension {
  const field = StateField.define({ create: build, update: (value, transaction) => transaction.docChanged || transaction.selection ? build(transaction.state) : value, provide: (field) => EditorView.decorations.from(field) });
  return field;
}
