import { GFM, parser } from '@lezer/markdown';

export const MARKDOWN_ANALYSIS_VERSION = 1;

export type MarkdownRange = {
  from: number;
  to: number;
  lineFrom: number;
  lineTo: number;
};

export type MarkdownHeading = MarkdownRange & {
  id: string;
  level: number;
  text: string;
};

export type MarkdownFoldSection = MarkdownRange & {
  headingId: string;
  level: number;
  title: string;
};

export type MarkdownDocumentStats = {
  characters: number;
  words: number;
  paragraphs: number;
  readingMinutes: number;
};

export type MarkdownAnalysisResult = {
  version: number;
  sourceHash: string;
  headings: MarkdownHeading[];
  foldSections: MarkdownFoldSection[];
  stats: MarkdownDocumentStats;
};

const markdownParser = parser.configure(GFM);
const cache = new Map<string, { source: string; result: MarkdownAnalysisResult }>();
const CACHE_LIMIT = 24;

export function analyzeMarkdown(source: string): MarkdownAnalysisResult {
  const sourceHash = hashSource(source);
  const cached = cache.get(sourceHash);
  if (cached?.source === source) {
    // ponytail: FIFO cache is enough for the short active-document history; use LRU only after profiling misses.
    return cached.result;
  }

  const headings: MarkdownHeading[] = [];
  const cursor = markdownParser.parse(source).cursor();
  do {
    const heading = headingFromNode(source, cursor.type.name, cursor.from, cursor.to, headings.length);
    if (heading) headings.push(heading);
  } while (cursor.next());

  const result: MarkdownAnalysisResult = {
    version: MARKDOWN_ANALYSIS_VERSION,
    sourceHash,
    headings,
    foldSections: foldSectionsFromHeadings(source, headings),
    stats: calculateStats(source),
  };
  remember(source, result);
  return result;
}

/** Vitest-only cache reset; production callers rely on source hashes. */
export function _clearMarkdownAnalysisCacheForTests(): void {
  cache.clear();
}

function headingFromNode(source: string, name: string, from: number, to: number, index: number): MarkdownHeading | null {
  const raw = source.slice(from, to);
  const line = raw.replace(/[\r\n]+$/u, '');
  let level: number;
  let text: string;
  const atx = name.match(/^ATXHeading([1-6])$/u);
  const setext = name.match(/^SetextHeading([12])$/u);
  if (atx) {
    level = Number(atx[1]);
    const match = line.match(/^(#{1,6})(?:[ \t]+|$)(.*)$/u);
    if (!match) return null;
    text = match[2].replace(/[ \t]+#+[ \t]*$/u, '').trim().normalize('NFC');
  } else if (setext) {
    level = Number(setext[1]);
    text = raw.split(/\r?\n/u)[0]?.trim().normalize('NFC') ?? '';
  } else {
    return null;
  }
  if (!text) return null;
  return { ...rangeAt(source, from, to), id: `heading-${index}`, level, text };
}

function foldSectionsFromHeadings(source: string, headings: MarkdownHeading[]): MarkdownFoldSection[] {
  return headings.map((heading, index) => {
    const next = headings.slice(index + 1).find((candidate) => candidate.level <= heading.level);
    return {
      ...rangeAt(source, heading.from, next?.from ?? source.length),
      headingId: heading.id,
      level: heading.level,
      title: heading.text,
    };
  });
}

function calculateStats(source: string): MarkdownDocumentStats {
  const plain = source
    .replace(/```[\s\S]*?```/gu, ' ')
    .replace(/`[^`]*`/gu, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
    .replace(/[#>*_~|[\]()-]/gu, ' ');
  const cjk = plain.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) ?? [];
  const latinWords = plain.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/gu) ?? [];
  const words = cjk.length + latinWords.length;
  return {
    characters: plain.replace(/\s+/gu, '').length,
    words,
    paragraphs: source.split(/\r?\n\s*\r?\n/gu).filter((part) => part.trim()).length,
    readingMinutes: words > 0 ? Math.max(1, Math.ceil(words / 350)) : 0,
  };
}

function rangeAt(source: string, from: number, to: number): MarkdownRange {
  return { from, to, lineFrom: lineAt(source, from), lineTo: lineAt(source, Math.max(from, to - 1)) };
}

function lineAt(source: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < Math.min(offset, source.length); index++) if (source.charCodeAt(index) === 10) line++;
  return line;
}

function hashSource(source: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index++) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${source.length}:${(hash >>> 0).toString(36)}`;
}

function remember(source: string, result: MarkdownAnalysisResult): void {
  cache.set(result.sourceHash, { source, result });
  if (cache.size <= CACHE_LIMIT) return;
  const oldest = cache.keys().next().value;
  if (oldest) cache.delete(oldest);
}
