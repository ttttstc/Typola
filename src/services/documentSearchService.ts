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

/**
 * 在 source 里数 match 是第几次 occurrence(0-based)。必须按用户搜索时的 options 跑,
 * 否则 case-insensitive / regex / wholeWord 场景下计数会跟 findSearchMatches 的结果脱节,
 * 导致 IR 里 occurrenceIndex 漂移 → 跳错位置。
 *
 * - case-insensitive 搜 "beta" 命中 "Beta":indexOf("Beta") 只数 "Beta" 出现,漏掉其他 "beta"
 * - regex 搜 "b.t" 命中 "bat":indexOf("bat") 漏掉 "bit" / "but"
 * - wholeWord 时 indexOf 也数边界外的命中
 */
export function getSearchMatchOccurrenceIndex(
  source: string,
  match: SearchMatch,
  query: string,
  options: SearchOptions,
): number {
  if (!query) return 0;
  const regex = buildSearchRegExp(query, options);
  if (!regex) return 0;

  let count = 0;
  let exec: RegExpExecArray | null;
  while ((exec = regex.exec(source)) !== null) {
    if (exec.index >= match.index) break;
    if (exec[0].length === 0) {
      regex.lastIndex += 1;
      continue;
    }
    if (options.wholeWord && !isWholeWordMatch(source, exec.index, exec[0].length)) continue;
    count += 1;
  }
  return count;
}
