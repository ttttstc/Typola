import { syntaxTree } from '@codemirror/language';
import { StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import { collectCodeRanges, isContainedByRange } from './markdownSyntaxRanges';

class ImagePathWidget extends WidgetType {
  private readonly src: string;
  private readonly alt: string;

  constructor(src: string, alt: string) {
    super();
    this.src = src;
    this.alt = alt;
  }

  eq(other: ImagePathWidget): boolean {
    return other.src === this.src && other.alt === this.alt;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'cm-atomic-image';
    const image = document.createElement('img');
    image.src = this.src;
    image.alt = this.alt;
    image.loading = 'lazy';
    wrap.append(image);
    wrap.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const position = view.posAtDOM(wrap);
      if (position < 0) return;
      view.focus();
      view.dispatch({ selection: { anchor: position }, scrollIntoView: false });
    });
    return wrap;
  }

  ignoreEvent(event: Event): boolean {
    return event.type === 'mousedown' || event.type === 'click';
  }
}

function parseImageSource(raw: string): { alt: string; src: string } | null {
  const match = raw.match(/^!\[([^\]]*)\]\(([\s\S]*)\)$/u);
  if (!match) return null;

  let destination = match[2].trim();
  if (destination.startsWith('<')) {
    const close = destination.indexOf('>');
    if (close <= 1) return null;
    destination = destination.slice(1, close);
  } else {
    const title = destination.match(/^(.*?)(?:\s+["'][^"']*["'])$/u);
    if (title) destination = title[1].trim();
  }

  return destination ? { alt: match[1], src: destination } : null;
}

function build(state: EditorView['state']): ReturnType<typeof Decoration.set> {
  const ranges = [];
  // Do not synchronously force the parser to the end of a large document on
  // every keystroke. The current tree is enough to distinguish standard images;
  // the raw scan below only fills the parser gap for destinations containing
  // spaces or CJK characters.
  const tree = syntaxTree(state);
  const codeRanges = collectCodeRanges(state);
  const standardImages: Array<{ from: number; to: number }> = [];
  tree.iterate({
    enter: (node) => {
      if (node.name !== 'Image') return;
      if (node.node.getChild('URL')) standardImages.push({ from: node.from, to: node.to });
    },
  });

  const imagePattern = /!\[([^\]]*)\]\(([^\n)]*)\)/gu;
  for (const match of state.doc.toString().matchAll(imagePattern)) {
    const from = match.index ?? 0;
    const to = from + match[0].length;
    if (standardImages.some((range) => range.from === from && range.to === to)) continue;
    if (codeRanges.some((range) => isContainedByRange(range, from, to))) continue;
    if (state.selection.ranges.some((selection) => (
      selection.empty
        ? selection.from >= from && selection.from < to
        : selection.from < to && selection.to > from
    ))) continue;
    const parsed = parseImageSource(match[0]);
    if (!parsed) continue;
    ranges.push(Decoration.replace({
      widget: new ImagePathWidget(parsed.src, parsed.alt),
      block: true,
    }).range(from, to));
  }
  return Decoration.set(ranges, true);
}

export function imagePathExtension(): Extension {
  const field = StateField.define({
    create: build,
    update: (value, transaction) => transaction.docChanged || transaction.selection
      ? build(transaction.state)
      : value.map(transaction.changes),
    provide: (field) => EditorView.decorations.from(field),
  });
  return field;
}
