import { StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import { collectCodeRanges, collectRawHtmlRanges, isContainedByRange } from './markdownSyntaxRanges';

class HighlightWidget extends WidgetType {
  private readonly content: string;

  constructor(content: string) {
    super();
    this.content = content;
  }

  eq(other: HighlightWidget): boolean {
    return other.content === this.content;
  }

  toDOM(): HTMLElement {
    const element = document.createElement('mark');
    element.className = 'cm6-markdown-highlight';
    element.textContent = this.content;
    return element;
  }
}

function selectionIntersects(selection: EditorView['state']['selection']['ranges'][number], from: number, to: number): boolean {
  if (selection.empty) return selection.from > from && selection.from < to;
  return selection.from < to && selection.to > from;
}

function build(state: EditorView['state']) {
  const source = state.doc.toString();
  const excludedRanges = [...collectCodeRanges(state), ...collectRawHtmlRanges(state)];
  const ranges = [];
  for (const match of source.matchAll(/==([^=\n]+)==/gu)) {
    const from = match.index ?? 0;
    const to = from + match[0].length;
    if (excludedRanges.some((range) => isContainedByRange(range, from, to))) continue;
    if (state.selection.ranges.some((selection) => selectionIntersects(selection, from, to))) continue;
    ranges.push(Decoration.replace({ widget: new HighlightWidget(match[1]) }).range(from, to));
  }
  return Decoration.set(ranges, true);
}

export function highlightExtension(): Extension {
  const field = StateField.define({
    create: build,
    update: (value, transaction) => transaction.docChanged || transaction.selection ? build(transaction.state) : value,
    provide: (field) => EditorView.decorations.from(field),
  });
  return field;
}
