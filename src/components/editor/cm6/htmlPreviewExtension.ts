import { StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import { sanitizeHtml } from '../../../services/sanitizeService';

class HtmlWidget extends WidgetType {
  private readonly source: string;
  constructor(source: string) { super(); this.source = source; }
  eq(other: HtmlWidget) { return other.source === this.source; }
  toDOM(): HTMLElement { const element = document.createElement('div'); element.className = 'typola-cm6-html'; element.innerHTML = sanitizeHtml(this.source); return element; }
}

function build(state: EditorView['state']) {
  const source = state.doc.toString(); const ranges = [];
  const pattern = /<(details|div|table|figure|blockquote)\b[^>]*>[\s\S]*?<\/\1>|<(kbd|mark|sub|sup)\b[^>]*>[^\n]*?<\/\2>/giu;
  for (const match of source.matchAll(pattern)) {
    const from = match.index ?? 0; const to = from + match[0].length;
    if (state.selection.ranges.some((selection) => selection.from <= to && selection.to >= from)) continue;
    ranges.push(Decoration.replace({ widget: new HtmlWidget(match[0]), block: /^(details|div|table|figure|blockquote)/iu.test(match[1] ?? '') }).range(from, to));
  }
  return Decoration.set(ranges, true);
}

export function htmlPreviewExtension(): Extension {
  const field = StateField.define({ create: build, update: (value, transaction) => transaction.docChanged || transaction.selection ? build(transaction.state) : value, provide: (field) => EditorView.decorations.from(field) });
  return field;
}
