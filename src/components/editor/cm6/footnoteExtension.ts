import { StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';

class FootnoteWidget extends WidgetType {
  private readonly id: string;
  private readonly definition: boolean;
  constructor(id: string, definition = false) { super(); this.id = id; this.definition = definition; }
  toDOM(): HTMLElement {
    const element = document.createElement('button');
    element.type = 'button'; element.className = this.definition ? 'cm6-footnote-definition' : 'cm6-footnote-ref';
    element.dataset.footnote = this.id; element.textContent = this.definition ? `脚注 [${this.id}] · 点击展开` : `[${this.id}]`;
    return element;
  }
}

function decorations(state: EditorView['state']) {
  const source = state.doc.toString(); const definitions = new Map<string, { from: number; to: number }>();
  for (const match of source.matchAll(/^\[\^([^\]]+)\]:[^\n]*/gmu)) { const from = match.index ?? 0; definitions.set(match[1], { from, to: from + match[0].length }); }
  const ranges = [];
  for (const match of source.matchAll(/\[\^([^\]]+)\](?!:)/gu)) {
    const from = match.index ?? 0;
    if (!definitions.has(match[1]) || state.selection.ranges.some((selection) => selection.from <= from + match[0].length && selection.to >= from)) continue;
    ranges.push(Decoration.replace({ widget: new FootnoteWidget(match[1]) }).range(from, from + match[0].length));
  }
  for (const [id, definition] of definitions) {
    if (state.selection.ranges.some((selection) => selection.from <= definition.to && selection.to >= definition.from)) continue;
    ranges.push(Decoration.replace({ widget: new FootnoteWidget(id, true), block: true }).range(definition.from, definition.to));
  }
  return Decoration.set(ranges, true);
}

export function footnoteExtension(): Extension {
  const field = StateField.define({ create: decorations, update: (value, transaction) => transaction.docChanged || transaction.selection ? decorations(transaction.state) : value, provide: (field) => EditorView.decorations.from(field) });
  return [field, EditorView.domEventHandlers({ click(event, view) {
    const target = event.target; if (!(target instanceof HTMLElement)) return false;
    const id = target.dataset.footnote; if (!id) return false;
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); const match = new RegExp(`^\\[\\^${escaped}\\]:`, 'm').exec(view.state.doc.toString());
    if (!match) return false; view.dispatch({ selection: { anchor: match.index }, effects: EditorView.scrollIntoView(match.index, { y: 'center' }) }); return true;
  } })];
}
