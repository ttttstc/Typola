export interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
}

export interface SearchMatch {
  index: number;
  length: number;
  matchText: string;
  lineNumber: number;
  column: number;
  lineText: string;
  contextBefore: string[];
  contextAfter: string[];
}

export interface ReplacePreviewChange {
  lineNumber: number;
  beforeLine: string;
  afterLine: string;
  matchText: string;
  replacementText: string;
}

export interface ReplacePreviewResult {
  nextContent: string;
  changes: ReplacePreviewChange[];
  replacementCount: number;
}

interface NormalizedPattern {
  regex: RegExp;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseGlobList(globValue: string) {
  return globValue
    .split(/[,\n]/)
    .map((pattern) => pattern.trim())
    .filter(Boolean);
}

function globToRegex(pattern: string) {
  const normalized = pattern.replace(/\\/g, '/');
  const escaped = escapeRegex(normalized)
    .replace(/\\\*\\\*\//g, '(?:.*/)?')
    .replace(/\/\\\*\\\*/g, '(?:/.*)?')
    .replace(/\\\*\\\*/g, '.*')
    .replace(/\\\*/g, '[^/]*')
    .replace(/\\\?/g, '[^/]');

  return new RegExp(`^${escaped}$`, 'i');
}

function normalizePatterns(patterns: string[]) {
  return patterns.map((pattern) => ({ regex: globToRegex(pattern) }));
}

function matchesPatterns(relativePath: string, patterns: NormalizedPattern[]) {
  const normalized = relativePath.replace(/\\/g, '/');
  return patterns.some(({ regex }) => regex.test(normalized));
}

export function shouldSearchPath(relativePath: string, includeGlob: string, excludeGlob: string) {
  const includePatterns = normalizePatterns(parseGlobList(includeGlob));
  const excludePatterns = normalizePatterns(parseGlobList(excludeGlob));

  if (includePatterns.length > 0 && !matchesPatterns(relativePath, includePatterns)) {
    return false;
  }

  if (excludePatterns.length > 0 && matchesPatterns(relativePath, excludePatterns)) {
    return false;
  }

  return true;
}

export function createSearchRegex(query: string, options: SearchOptions) {
  if (!query) return null;

  const source = options.useRegex ? query : escapeRegex(query);
  const wrapped = options.wholeWord ? `\\b(?:${source})\\b` : source;
  const flags = options.caseSensitive ? 'g' : 'gi';

  try {
    return new RegExp(wrapped, flags);
  } catch {
    return null;
  }
}

function buildLineStarts(text: string) {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') {
      starts.push(index + 1);
    }
  }
  return starts;
}

function getLineInfo(text: string, starts: number[], index: number) {
  let lineIndex = 0;

  while (lineIndex + 1 < starts.length && starts[lineIndex + 1] <= index) {
    lineIndex += 1;
  }

  const lineStart = starts[lineIndex];
  const nextStart = starts[lineIndex + 1] ?? text.length;
  const lineEnd = nextStart > lineStart && text[nextStart - 1] === '\n' ? nextStart - 1 : nextStart;
  const lineText = text.slice(lineStart, lineEnd);

  return {
    lineNumber: lineIndex + 1,
    column: index - lineStart + 1,
    lineText,
  };
}

export function searchText(content: string, query: string, options: SearchOptions, contextLines = 1) {
  const regex = createSearchRegex(query, options);
  if (!regex) return [];

  const starts = buildLineStarts(content);
  const lines = content.split('\n');
  const matches: SearchMatch[] = [];
  let result = regex.exec(content);

  while (result) {
    const matchText = result[0];
    if (matchText.length === 0) {
      regex.lastIndex += 1;
      result = regex.exec(content);
      continue;
    }

    const info = getLineInfo(content, starts, result.index);
    const lineIndex = info.lineNumber - 1;

    matches.push({
      index: result.index,
      length: matchText.length,
      matchText,
      lineNumber: info.lineNumber,
      column: info.column,
      lineText: info.lineText,
      contextBefore: lines.slice(Math.max(0, lineIndex - contextLines), lineIndex),
      contextAfter: lines.slice(lineIndex + 1, lineIndex + 1 + contextLines),
    });

    result = regex.exec(content);
  }

  return matches;
}

export function previewReplaceText(
  content: string,
  query: string,
  replacementText: string,
  options: SearchOptions
): ReplacePreviewResult {
  const matches = searchText(content, query, options, 0);
  if (matches.length === 0) {
    return {
      nextContent: content,
      changes: [],
      replacementCount: 0,
    };
  }

  const regex = createSearchRegex(query, options);
  if (!regex) {
    return {
      nextContent: content,
      changes: [],
      replacementCount: 0,
    };
  }

  const nextContent = content.replace(regex, replacementText);
  const nextLines = nextContent.split('\n');
  const changes = matches.map((match) => ({
    lineNumber: match.lineNumber,
    beforeLine: match.lineText,
    afterLine: nextLines[match.lineNumber - 1] ?? '',
    matchText: match.matchText,
    replacementText,
  }));

  return {
    nextContent,
    changes,
    replacementCount: matches.length,
  };
}

export function replaceSingleMatch(
  content: string,
  query: string,
  replacementText: string,
  options: SearchOptions,
  targetIndex: number
) {
  const regex = createSearchRegex(query, options);
  if (!regex) {
    return {
      nextContent: content,
      replaced: false,
    };
  }

  let currentIndex = 0;
  let replaced = false;

  const nextContent = content.replace(regex, (matched) => {
    if (currentIndex !== targetIndex) {
      currentIndex += 1;
      return matched;
    }

    currentIndex += 1;
    replaced = true;

    const singleMatchRegex = new RegExp(
      regex.source,
      regex.flags.replace('g', '')
    );

    return matched.replace(singleMatchRegex, replacementText);
  });

  return {
    nextContent,
    replaced,
  };
}
