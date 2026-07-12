import { StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';

class FootnoteWidget extends WidgetType {
  private readonly id: string;
  constructor(id: string) { super(); this.id = id; }
  toDOM(): HTMLElement { const element = document.createElement('button'); element.type = 'button'; element.className = 'cm6-footnote-ref'; element.dataset.footnote = this.id; element.textContent = `[${this.id}]`; return element; }
}

function decorations(state: EditorView['state']) {
  const source = state.doc.toString(); const definitions = new Map<string, number>();
  for (const match of source.matchAll(/^\[\^([^\]]+)\]:/gmu)) definitions.set(match[1], match.index ?? 0);
  const ranges = [];
  for (const match of source.matchAll(/\[\^([^\]]+)\](?!:)/gu)) {
    const from = match.index ?? 0; if (!definitions.has(match[1]) || state.selection.ranges.some((selection) => selection.from <= from + match[0].length && selection.to >= from)) continue;
    ranges.push(Decoration.replace({ widget: new FootnoteWidget(match[1]) }).range(from, from + match[0].length));
  }
  return Decoration.set(ranges, true);
}

export function footnoteExtension(): Extension {
  const field = StateField.define({ create: decorations, update: (_value, transaction) => transaction.docChanged || transaction.selection ? decorations(transaction.state) : _value, provide: (field) => EditorView.decorations.from(field) });
  return [field, EditorView.domEventHandlers({ click(event, view) { const target = event.target; if (!(target instanceof HTMLElement) || !target.matches('.cm6-footnote-ref')) return false; const id = target.dataset.footnote; const match = id ? new RegExp(`^\\[\\^${id.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\]:`, 'm').exec(view.state.doc.toString()) : null; if (!match) return false; view.dispatch({ selection: { anchor: match.index }, effects: EditorView.scrollIntoView(match.index, { y: 'center' }) }); return true; } })];
}
