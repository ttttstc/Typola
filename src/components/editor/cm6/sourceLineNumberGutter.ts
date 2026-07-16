import type { Extension } from '@codemirror/state';
import { GutterMarker, gutter } from '@codemirror/view';

const HEADING_OR_LIST_START = /^(?:#{1,6}\s|[-+*]\s|\d+[.)]\s)/u;
const FENCE_START = /^(`{3,}|~{3,})/u;
const QUOTE_START = /^>\s?/u;
const TABLE_ROW_START = /^\|/u;

export function blockStartLineNumbers(source: string): ReadonlySet<number> {
  const starts = new Set<number>();
  const lines = source.split('\n');
  let activeFence: { marker: string; length: number } | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const current = lines[index].trim();
    const previous = index > 0 ? lines[index - 1].trim() : undefined;
    const fence = current.match(FENCE_START)?.[1];
    if (activeFence) {
      if (fence && fence[0] === activeFence.marker && fence.length >= activeFence.length) activeFence = null;
      continue;
    }
    if (!current) continue;
    if (fence) {
      starts.add(index + 1);
      activeFence = { marker: fence[0], length: fence.length };
      continue;
    }
    if (index === 0 || !previous) {
      starts.add(index + 1);
      continue;
    }
    if (HEADING_OR_LIST_START.test(current)) {
      starts.add(index + 1);
      continue;
    }
    if (QUOTE_START.test(current) && !QUOTE_START.test(previous)) {
      starts.add(index + 1);
      continue;
    }
    if (TABLE_ROW_START.test(current) && !TABLE_ROW_START.test(previous)) starts.add(index + 1);
  }
  return starts;
}

/** 所见即所得模式只在 Markdown 块起始处提示真实源码行号。 */
export function shouldShowBlockLineNumber(current: string, previous?: string): boolean {
  const source = previous === undefined ? current : `${previous}\n${current}`;
  return blockStartLineNumbers(source).has(previous === undefined ? 1 : 2);
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

export function sourceBlockLineNumberGutter(): Extension {
  const cache = new Map<number, SourceLineNumberMarker>();
  let cachedDocument: object | null = null;
  let cachedStarts: ReadonlySet<number> = new Set();
  return gutter({
    class: 'cm-block-line-number-gutter',
    lineMarker(view, block) {
      const line = view.state.doc.lineAt(block.from);
      if (cachedDocument !== view.state.doc) {
        cachedDocument = view.state.doc;
        cachedStarts = blockStartLineNumbers(view.state.doc.toString());
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
