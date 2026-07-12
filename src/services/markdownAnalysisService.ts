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

export type MarkdownTask = MarkdownRange & {
  checked: boolean;
  text: string;
  depth: number;
};

export type MarkdownLink = MarkdownRange & {
  label: string;
  url: string;
  title?: string;
};

export type MarkdownImage = MarkdownRange & {
  alt: string;
  url: string;
  title?: string;
};

export type MarkdownCodeBlock = MarkdownRange & {
  language: string | null;
  contentFrom: number;
  contentTo: number;
};

export type MarkdownMathBlock = MarkdownRange & {
  contentFrom: number;
  contentTo: number;
};

export type MarkdownAnalysisResult = {
  version: number;
  sourceHash: string;
  headings: MarkdownHeading[];
  foldSections: MarkdownFoldSection[];
  tasks: MarkdownTask[];
  links: MarkdownLink[];
  images: MarkdownImage[];
  codeBlocks: MarkdownCodeBlock[];
  mathBlocks: MarkdownMathBlock[];
  mermaidBlocks: MarkdownCodeBlock[];
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

  const codeBlocks = scanFencedCodeBlocks(source);
  const mathBlocks: MarkdownMathBlock[] = codeBlocks
    .filter((b) => b.language === 'math' || b.language === 'katex' || b.language === 'latex')
    .map((b) => ({ ...rangeAt(source, b.from, b.to), contentFrom: b.contentFrom, contentTo: b.contentTo }));
  const mermaidBlocks: MarkdownCodeBlock[] = codeBlocks.filter((b) => b.language === 'mermaid');
  const fencedRanges = codeBlocks;

  const result: MarkdownAnalysisResult = {
    version: MARKDOWN_ANALYSIS_VERSION,
    sourceHash,
    headings,
    foldSections: foldSectionsFromHeadings(source, headings),
    tasks: scanTasks(source, fencedRanges),
    links: scanLinks(source, fencedRanges),
    images: scanImages(source, fencedRanges),
    codeBlocks,
    mathBlocks,
    mermaidBlocks,
    stats: calculateStats(source, fencedRanges),
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

function calculateStats(source: string, fencedRanges: MarkdownRange[] = []): MarkdownDocumentStats {
  let plain = source;
  for (const range of [...fencedRanges].reverse()) {
    plain = `${plain.slice(0, range.from)} ${plain.slice(range.to)}`;
  }
  plain = plain
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

const TASK_PATTERN = /^(\s*)(?:[-*+]|\d+[.)])\s+\[([ xX])\]\s+(.*)$/u;
const LINK_PATTERN = /(!?)\[([^\]\n]*)\]\(([^\s)]+)(?:\s+["']([^"']*)["'])?\)/gu;
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})\s*([^\s`~]*)/u;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})\s*$/u;
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)+\|?\s*$/u;
const TABLE_ROW = /^\s*\|.*\|\s*$/u;

function scanFencedCodeBlocks(source: string): MarkdownCodeBlock[] {
  const blocks: MarkdownCodeBlock[] = [];
  const lines = splitLines(source);
  let openMarker: '`' | '~' | null = null;
  let openAt = -1;
  let openLanguage: string | null = null;
  let openContentFrom = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const { from, text } = lines[i];
    if (openMarker === null) {
      const m = text.match(FENCE_OPEN);
      if (m) {
        openMarker = m[1]![0] as '`' | '~';
        openAt = from;
        openLanguage = (m[2] ?? '').toLowerCase() || null;
        openContentFrom = from + m[0].length + 1; // +1 for newline
      }
    } else {
      if (FENCE_CLOSE.test(text) && text.trimStart().startsWith(openMarker)) {
        const lastNewline = text.lastIndexOf('\n');
        const contentTo = lastNewline < 0 ? openAt + openMarker.length : from + lastNewline;
        blocks.push({
          ...rangeAt(source, openAt, from + text.length),
          language: openLanguage,
          contentFrom: openContentFrom,
          contentTo,
        });
        openMarker = null;
        openAt = -1;
        openLanguage = null;
        openContentFrom = -1;
      }
    }
  }
  return blocks;
}

function scanTasks(source: string, fencedRanges: MarkdownRange[]): MarkdownTask[] {
  const tasks: MarkdownTask[] = [];
  for (const { from, text } of splitLines(source)) {
    if (withinRanges(from, fencedRanges)) continue;
    const m = text.match(TASK_PATTERN);
    if (!m) continue;
    const to = from + text.length;
    tasks.push({
      ...rangeAt(source, from, to),
      checked: m[2]!.toLowerCase() === 'x',
      text: m[3] ?? '',
      depth: Math.floor((m[1] ?? '').replace(/\t/gu, '  ').length / 2),
    });
  }
  return tasks;
}

function scanLinks(source: string, fencedRanges: MarkdownRange[]): MarkdownLink[] {
  const links: MarkdownLink[] = [];
  for (const match of source.matchAll(LINK_PATTERN)) {
    if (match[1] === '!') continue;
    const from = match.index ?? 0;
    if (withinRanges(from, fencedRanges)) continue;
    links.push({
      ...rangeAt(source, from, from + match[0].length),
      label: match[2] ?? '',
      url: match[3] ?? '',
      ...(match[4] ? { title: match[4] } : {}),
    });
  }
  return links;
}

function scanImages(source: string, fencedRanges: MarkdownRange[]): MarkdownImage[] {
  const images: MarkdownImage[] = [];
  for (const match of source.matchAll(LINK_PATTERN)) {
    if (match[1] !== '!') continue;
    const from = match.index ?? 0;
    if (withinRanges(from, fencedRanges)) continue;
    images.push({
      ...rangeAt(source, from, from + match[0].length),
      alt: match[2] ?? '',
      url: match[3] ?? '',
      ...(match[4] ? { title: match[4] } : {}),
    });
  }
  return images;
}

/** Best-effort GFM table range lookup without storing tables in the cache. */
function findTableRangeAt(source: string, offset: number): MarkdownRange | null {
  const lines = splitLines(source);
  if (lines.length === 0) return null;
  const lineOfOffset = lineIndexAtOffset(source, offset);
  const codeBlocks = scanFencedCodeBlocks(source);
  const inFence = (lineNo: number) =>
    codeBlocks.some((b) => {
      const startLine = lineIndexAtOffset(source, b.from);
      const endLine = lineIndexAtOffset(source, Math.max(b.from, b.to - 1));
      return lineNo >= startLine && lineNo <= endLine;
    });

  // 上方搜 sep 行
  let sepIdx = lineOfOffset;
  while (sepIdx >= 0 && (inFence(sepIdx) || !TABLE_SEP.test(lines[sepIdx]!.text))) sepIdx -= 1;
  if (sepIdx < 0 || inFence(sepIdx)) {
    // 下方兜底
    let down = lineOfOffset + 1;
    while (down < lines.length && (inFence(down) || !TABLE_SEP.test(lines[down]!.text))) down += 1;
    if (down >= lines.length || inFence(down)) return null;
    sepIdx = down;
  }
  // header
  if (sepIdx === 0 || !TABLE_ROW.test(lines[sepIdx - 1]!.text) || inFence(sepIdx - 1)) return null;
  // body lines after sep
  let endIdx = sepIdx;
  while (endIdx + 1 < lines.length && TABLE_ROW.test(lines[endIdx + 1]!.text) && !inFence(endIdx + 1)) {
    endIdx += 1;
  }
  const startLine = lines[sepIdx - 1]!;
  const endLine = lines[endIdx]!;
  return rangeAt(source, startLine.from, endLine.to);
}

function lineIndexAtOffset(source: string, offset: number): number {
  let line = 0;
  for (let i = 0; i < Math.min(offset, source.length); i += 1) {
    if (source.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function splitLines(source: string): Array<{ from: number; text: string }> {
  const out: Array<{ from: number; text: string }> = [];
  let from = 0;
  for (const text of source.split('\n')) {
    out.push({ from, text });
    from += text.length + 1;
  }
  return out;
}

function withinRanges(offset: number, ranges: MarkdownRange[]): boolean {
  return ranges.some((range) => offset >= range.from && offset < range.to);
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

export function findMarkdownImageAt(source: string, offset: number): MarkdownImage | null {
  if (offset < 0 || offset > source.length) return null;
  const analysis = analyzeMarkdown(source);
  return analysis.images.find((image) => offset >= image.from && offset <= image.to) ?? null;
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
  const table = findTableRangeAt(source, from);
  if (table && to <= table.to) {
    return { ...rangeAt(source, table.from, table.to), kind: 'table', headingPath };
  }
  const section = headingSectionFor(analysis, from);
  if (section) return { ...rangeAt(source, section.from, section.to), kind: 'section', headingPath };
  return { ...rangeAt(source, 0, source.length), kind: 'paragraph', headingPath };
}

export function isRangeWithinSingleMarkdownBlock(source: string, from: number, to: number): boolean {
  if (from > to) return false;
  const analysis = analyzeMarkdown(source);
  const codeBlocks = analysis.codeBlocks;
  const mathBlocks = analysis.mathBlocks;
  const mermaidBlocks = analysis.mermaidBlocks;
  // tables 不在 cache 内,按需探测:仅当 from 命中表格且 to 越过表格边界才视为跨块。
  const tableRange = findTableRangeAt(source, from);
  const tableCrosses = !!tableRange && !(from >= tableRange.from && to <= tableRange.to);
  const boundaries: MarkdownRange[] = [...codeBlocks, ...mathBlocks, ...mermaidBlocks];
  // 任一边界完全落在 [from, to) 内部(从前面进入且从后面出去),即视为跨块。
  const crossesOther = boundaries.some((boundary) => boundary.from >= from && boundary.to <= to);
  return !(crossesOther || tableCrosses);
}
