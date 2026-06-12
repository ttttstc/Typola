export type SearchOptions = {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
};

export type SearchMatch = {
  index: number;
  length: number;
  text: string;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isWordChar(value: string): boolean {
  return /[\p{L}\p{N}_]/u.test(value);
}

function isWholeWordMatch(source: string, index: number, length: number): boolean {
  const before = index > 0 ? source[index - 1] : '';
  const after = index + length < source.length ? source[index + length] : '';
  return (!before || !isWordChar(before)) && (!after || !isWordChar(after));
}

export function buildSearchRegExp(query: string, options: SearchOptions): RegExp | null {
  if (!query) return null;

  const source = options.regex ? query : escapeRegExp(query);
  try {
    return new RegExp(source, options.caseSensitive ? 'gu' : 'giu');
  } catch {
    return null;
  }
}

export function findSearchMatches(source: string, query: string, options: SearchOptions): SearchMatch[] {
  const regex = buildSearchRegExp(query, options);
  if (!regex) return [];

  const matches: SearchMatch[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    const text = match[0];
    if (text.length === 0) {
      regex.lastIndex += 1;
      continue;
    }
    if (!options.wholeWord || isWholeWordMatch(source, match.index, text.length)) {
      matches.push({ index: match.index, length: text.length, text });
    }
    if (matches.length >= 5000) break;
  }
  return matches;
}

export function replaceSearchMatch(source: string, match: SearchMatch, replacement: string): string {
  return `${source.slice(0, match.index)}${replacement}${source.slice(match.index + match.length)}`;
}

export function replaceAllSearchMatches(source: string, matches: readonly SearchMatch[], replacement: string): string {
  if (matches.length === 0) return source;

  let cursor = 0;
  let next = '';
  for (const match of matches) {
    next += source.slice(cursor, match.index);
    next += replacement;
    cursor = match.index + match.length;
  }
  next += source.slice(cursor);
  return next;
}
