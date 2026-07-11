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

export type MarkdownBlockKind = 'code' | 'table' | 'math' | 'mermaid' | 'section' | 'paragraph';

export type MarkdownBlockBoundary = MarkdownRange & {
  kind: MarkdownBlockKind;
  headingPath: string[];
};

// 结构 helper:为 task/link/AI anchor 等消费者复用同一份解析结果,避免重复扫描。
// 行为约束:
// - 命中优先级:fenced code / table / math / mermaid > heading section > paragraph。
// - 不修改 Markdown source、不依赖编辑器实例,纯函数。
// - 已通过 MarkdownAnalysisResult 跳过 fenced code 内伪 task/link;这里不再做单独过滤。

export function findMarkdownTaskAt(source: string, offset: number): MarkdownTask | null {
  if (offset < 0 || offset > source.length) return null;
  const analysis = analyzeMarkdown(source);
  return analysis.tasks.find((task) => offset >= task.from && offset <= task.to) ?? null;
}

/** Task 导航/过滤的最小 API；调用方可按完成状态筛选，再用 range 定位编辑器。 */
export function listMarkdownTasks(source: string, options: { checked?: boolean } = {}): MarkdownTask[] {
  return analyzeMarkdown(source).tasks.filter((task) => options.checked === undefined || task.checked === options.checked);
}

export function findMarkdownLinkAt(source: string, offset: number): MarkdownLink | null {
  if (offset < 0 || offset > source.length) return null;
  const analysis = analyzeMarkdown(source);
  return analysis.links.find((link) => offset >= link.from && offset <= link.to) ?? null;
}

export function headingPathAt(source: string, offset: number): string[] {
  const analysis = analyzeMarkdown(source);
  const levels: number[] = [];
  const path: string[] = [];
  for (const heading of analysis.headings) {
    if (heading.from > offset) break;
    while (levels.length > 0 && levels[levels.length - 1] > heading.level) {
      levels.pop();
      path.pop();
    }
    if (levels.length === 0 || levels[levels.length - 1] < heading.level) {
      levels.push(heading.level);
      path.push(heading.text);
    }
  }
  return path;
}

function headingSectionFor(analysis: MarkdownAnalysisResult, offset: number): MarkdownFoldSection | null {
  for (const section of analysis.foldSections) {
    if (offset >= section.from && offset < section.to) return section;
  }
  return null;
}

export function markdownBlockAt(source: string, from: number, to: number = from): MarkdownBlockBoundary {
  const analysis = analyzeMarkdown(source);
  const headingPath = headingPathAt(source, from);
  const specialMatch = (ranges: MarkdownRange[]): MarkdownRange | null => {
    for (const range of ranges) {
      if (from >= range.from && from < range.to && to > range.from && to <= range.to) return range;
    }
    return null;
  };
  const mermaid = specialMatch(analysis.mermaidBlocks);
  if (mermaid) return { ...rangeAt(source, mermaid.from, mermaid.to), kind: 'mermaid', headingPath };
  const math = specialMatch(analysis.mathBlocks);
  if (math) return { ...rangeAt(source, math.from, math.to), kind: 'math', headingPath };
  const code = specialMatch(analysis.codeBlocks);
  if (code) return { ...rangeAt(source, code.from, code.to), kind: 'code', headingPath };
  const table = specialMatch(analysis.tables);
  if (table) return { ...rangeAt(source, table.from, table.to), kind: 'table', headingPath };
  const section = headingSectionFor(analysis, from);
  if (section) return { ...rangeAt(source, section.from, section.to), kind: 'section', headingPath };
  return { ...rangeAt(source, 0, source.length), kind: 'paragraph', headingPath };
}

export function isRangeWithinSingleMarkdownBlock(source: string, from: number, to: number): boolean {
  if (from > to) return false;
  const analysis = analyzeMarkdown(source);
  const boundaries: MarkdownRange[] = [
    ...analysis.codeBlocks,
    ...analysis.tables,
    ...analysis.mathBlocks,
    ...analysis.mermaidBlocks,
  ];
  // 任一边界完全落在 [from, to) 内部(从前面进入且从后面出去),即视为跨块。
  return !boundaries.some((boundary) => boundary.from >= from && boundary.to <= to);
}
