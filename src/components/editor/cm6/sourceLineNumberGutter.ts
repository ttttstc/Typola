import type { Extension } from '@codemirror/state';
import { GutterMarker, gutter } from '@codemirror/view';

export function sourceLineNumbers(source: string): ReadonlySet<number> {
  return new Set(source.split('\n').map((_, index) => index + 1));
}

/** 所见即所得模式为每一条 Markdown 源码行显示真实行号。 */
export function shouldShowSourceLineNumber(_current: string, _previous?: string): boolean {
  return true;
}

class SourceLineNumberMarker extends GutterMarker {
  private readonly lineNumber: number;

  constructor(lineNumber: number) {
    super();
    this.lineNumber = lineNumber;
  }

  toDOM(): HTMLElement {
    const element = document.createElement('span');
    element.className = 'cm-block-source-line-number';
    element.textContent = String(this.lineNumber);
    element.title = `Markdown 源码第 ${this.lineNumber} 行`;
    return element;
  }
}

export function sourceLineNumberGutter(): Extension {
  const cache = new Map<number, SourceLineNumberMarker>();
  let cachedDocument: object | null = null;
  let cachedStarts: ReadonlySet<number> = new Set();
  return gutter({
    class: 'cm-block-line-number-gutter',
    lineMarker(view, block) {
      const line = view.state.doc.lineAt(block.from);
      if (cachedDocument !== view.state.doc) {
        cachedDocument = view.state.doc;
        cachedStarts = sourceLineNumbers(view.state.doc.toString());
      }
      if (!cachedStarts.has(line.number)) return null;
      let marker = cache.get(line.number);
      if (!marker) {
        marker = new SourceLineNumberMarker(line.number);
        cache.set(line.number, marker);
      }
      return marker;
    },
  });
}
