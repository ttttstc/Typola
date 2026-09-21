import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';

export type SourceRange = {
  from: number;
  to: number;
};

export type RawHtmlRange = SourceRange & {
  block: boolean;
};

const CODE_NODE_NAMES = new Set(['InlineCode', 'FencedCode', 'IndentedCode', 'CodeBlock']);
const RAW_HTML_TAG_NAMES = new Set([
  'blockquote',
  'details',
  'div',
  'figure',
  'kbd',
  'mark',
  'script',
  'style',
  'sub',
  'sup',
  'table',
  'template',
  'textarea',
]);
const BLOCK_HTML_TAG_NAMES = new Set(['blockquote', 'details', 'div', 'figure', 'table']);

export function collectSyntaxRanges(state: EditorState, names: ReadonlySet<string>): SourceRange[] {
  const ranges: SourceRange[] = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      if (names.has(node.name)) ranges.push({ from: node.from, to: node.to });
    },
  });
  return ranges;
}

export function collectCodeRanges(state: EditorState): SourceRange[] {
  return collectSyntaxRanges(state, CODE_NODE_NAMES);
}

function parseHtmlTag(source: string, range: SourceRange): { name: string; closing: boolean; selfClosing: boolean } | null {
  const raw = source.slice(range.from, range.to);
  const match = raw.match(/^<\s*(\/?)\s*([A-Za-z][\w:-]*)/u);
  if (!match) return null;
  return {
    name: match[2].toLowerCase(),
    closing: Boolean(match[1]),
    selfClosing: /\/\s*>$/u.test(raw),
  };
}

function mergeRawHtmlRanges(ranges: RawHtmlRange[]): RawHtmlRange[] {
  const merged: RawHtmlRange[] = [];
  for (const range of [...ranges].sort((left, right) => left.from - right.from || left.to - right.to)) {
    const previous = merged.at(-1);
    if (previous && range.from <= previous.to) {
      previous.to = Math.max(previous.to, range.to);
      previous.block ||= range.block;
      continue;
    }
    merged.push({ ...range });
  }
  return merged;
}

function scanRawHtmlFragment(source: string, from: number, to: number): RawHtmlRange[] {
  const ranges: RawHtmlRange[] = [];
  const openTags: Array<{ name: string; from: number; block: boolean }> = [];
  const fragment = source.slice(from, to);
  const tokenPattern = /<!--[\s\S]*?-->|<\s*\/?\s*[A-Za-z][\w:-]*\b[^>]*>/gu;

  for (const match of fragment.matchAll(tokenPattern)) {
    const tokenFrom = from + (match.index ?? 0);
    const tokenTo = tokenFrom + match[0].length;
    if (match[0].startsWith('<!--')) {
      ranges.push({ from: tokenFrom, to: tokenTo, block: false });
      continue;
    }

    const tag = parseHtmlTag(source, { from: tokenFrom, to: tokenTo });
    if (!tag || !RAW_HTML_TAG_NAMES.has(tag.name) || tag.selfClosing) continue;
    if (!tag.closing) {
      openTags.push({ name: tag.name, from: tokenFrom, block: BLOCK_HTML_TAG_NAMES.has(tag.name) });
      continue;
    }
    const openIndex = openTags.findLastIndex((openTag) => openTag.name === tag.name);
    if (openIndex < 0) continue;
    const openTag = openTags[openIndex];
    openTags.splice(openIndex, 1);
    ranges.push({ from: openTag.from, to: tokenTo, block: openTag.block });
  }

  return ranges;
}

/**
 * Returns raw HTML/comment ranges recognized by the Markdown parser.
 * Code spans and fenced/indented code are not visited as HTML nodes, so
 * examples in code remain literal source instead of becoming widgets.
 */
export function collectRawHtmlRanges(state: EditorState): RawHtmlRange[] {
  const source = state.doc.toString();
  const ranges: RawHtmlRange[] = [];
  const openTags: Array<{ name: string; from: number; block: boolean }> = [];

  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === 'Comment') {
        ranges.push({ from: node.from, to: node.to, block: false });
        return;
      }
      if (node.name === 'CommentBlock' || node.name === 'HTMLBlock') {
        ranges.push(...scanRawHtmlFragment(source, node.from, node.to));
        return;
      }
      if (node.name !== 'HTMLTag') return;

      const tag = parseHtmlTag(source, node);
      if (!tag || !RAW_HTML_TAG_NAMES.has(tag.name) || tag.selfClosing) return;
      if (!tag.closing) {
        openTags.push({ name: tag.name, from: node.from, block: BLOCK_HTML_TAG_NAMES.has(tag.name) });
        return;
      }

      const openIndex = openTags.findLastIndex((openTag) => openTag.name === tag.name);
      if (openIndex < 0) return;
      const openTag = openTags[openIndex];
      openTags.splice(openIndex, 1);
      ranges.push({ from: openTag.from, to: node.to, block: openTag.block });
    },
  });

  return mergeRawHtmlRanges(ranges);
}

export function isContainedByRange(range: SourceRange, from: number, to: number): boolean {
  return from >= range.from && to <= range.to;
}
