import { StateField, type Extension } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view';

class HardBreakWidget extends WidgetType {
  eq(): boolean { return true; }

  toDOM(): HTMLElement {
    const element = document.createElement('br');
    element.className = 'cm6-hard-break';
    return element;
  }
}

function decorations(state: EditorView['state']): DecorationSet {
  const ranges = [];
  for (const match of state.doc.toString().matchAll(/\\\n/gu)) {
    const from = match.index ?? 0;
    ranges.push(Decoration.replace({ widget: new HardBreakWidget() }).range(from, from + 1));
  }
  return Decoration.set(ranges, true);
}

const hardBreakField = StateField.define<DecorationSet>({
  create: decorations,
  update(value, transaction) {
    return transaction.docChanged ? decorations(transaction.state) : value.map(transaction.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

export function hardBreakExtension(): Extension {
  return hardBreakField;
}
