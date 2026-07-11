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
  slug: string;
};

export type MarkdownFoldSection = MarkdownRange & {
  headingId: string;
  level: number;
  title: string;
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
  src: string;
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

export type MarkdownTable = MarkdownRange;

export type MarkdownDocumentStats = {
  characters: number;
  words: number;
  paragraphs: number;
  readingMinutes: number;
};

export type MarkdownDiagnostic = MarkdownRange & {
  message: string;
  severity: 'warning';
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
  tables: MarkdownTable[];
  stats: MarkdownDocumentStats;
  diagnostics: MarkdownDiagnostic[];
};

const markdownParser = parser.configure(GFM);
const cache = new Map<string, { source: string; result: MarkdownAnalysisResult }>();
const CACHE_LIMIT = 24;
const taskPattern = /^(\s*)(?:[-*+]|\d+[.)])\s+\[([ xX])\]\s+(.*)$/u;
const linkPattern = /(!?)\[([^\]\n]*)\]\(([^\s)]+)(?:\s+["']([^"']*)["'])?\)/gu;

type TreeNode = { name: string; from: number; to: number };

export function analyzeMarkdown(source: string): MarkdownAnalysisResult {
  const sourceHash = hashSource(source);
  const cached = cache.get(sourceHash);
  if (cached?.source === source) return cached.result;

  const nodes = collectTreeNodes(source);
  const codeBlocks = nodes
    .filter((node) => node.name === 'FencedCode')
    .map((node) => codeBlockFromRange(source, node.from, node.to));
  const parsedHeadings = nodes
    .map((node, index) => headingFromNode(source, node.name, node.from, node.to, index))
    .filter((heading): heading is MarkdownHeading => heading !== null);
  const headings = mergeHeadings(source, parsedHeadings);
  const tables = nodes
    .filter((node) => node.name === 'Table')
    .map((node) => rangeAt(source, node.from, node.to));
  const fencedRanges = codeBlocks;
  const result: MarkdownAnalysisResult = {
    version: MARKDOWN_ANALYSIS_VERSION,
    sourceHash,
    headings,
    foldSections: foldSectionsFromHeadings(source, headings),
    tasks: collectTasks(source, fencedRanges),
    links: collectLinks(source, fencedRanges),
    images: collectImages(source, fencedRanges),
    codeBlocks,
    mathBlocks: collectMathBlocks(source, fencedRanges, codeBlocks),
    mermaidBlocks: codeBlocks.filter((block) => block.language === 'mermaid'),
    tables,
    stats: calculateStats(source, fencedRanges),
    diagnostics: [],
  };
  remember(source, result);
  return result;
}

/** Debounced adapter for React/worker callers. Results remain source-hash cached. */
export function scheduleMarkdownAnalysis(
  source: string,
  onResult: (result: MarkdownAnalysisResult) => void,
  delay = 160,
): () => void {
  const timer = window.setTimeout(() => onResult(analyzeMarkdown(source)), delay);
  return () => window.clearTimeout(timer);
}

export function clearMarkdownAnalysisCache(): void {
  cache.clear();
}

/** 兼容 CM6 基线测试的别名。 */
export const _clearMarkdownAnalysisCacheForTests = clearMarkdownAnalysisCache;

function collectTreeNodes(source: string): TreeNode[] {
  const cursor = markdownParser.parse(source).cursor();
  const nodes: TreeNode[] = [];
  do {
    nodes.push({ name: cursor.type.name, from: cursor.from, to: cursor.to });
  } while (cursor.next());
  return nodes;
}

function headingFromNode(source: string, name: string, from: number, to: number, index: number): MarkdownHeading | null {
  const raw = source.slice(from, to);
  const atx = name.match(/^ATXHeading([1-6])$/u);
  const setext = name.match(/^SetextHeading([12])$/u);
  if (!atx && !setext) return null;
  const level = Number((atx ?? setext)![1]);
  const text = atx
    ? (raw.match(/^(#{1,6})(?:[ \t]+|$)(.*)$/u)?.[2] ?? '').replace(/[ \t]+#+[ \t]*$/u, '').trim().normalize('NFC')
    : (raw.split(/\r?\n/u)[0] ?? '').trim().normalize('NFC');
  if (!text) return null;
  return {
    ...rangeAt(source, from, to),
    id: `heading-${index}`,
    level,
    text,
    slug: slugify(text),
  };
}

function codeBlockFromRange(source: string, from: number, to: number): MarkdownCodeBlock {
  const raw = source.slice(from, to);
  const firstLineEnd = raw.indexOf('\n');
  const opener = firstLineEnd < 0 ? raw : raw.slice(0, firstLineEnd);
  const language = opener.match(/^ {0,3}(?:`{3,}|~{3,})\s*([^\s`~]*)/u)?.[1]?.toLowerCase() || null;
  const contentFrom = firstLineEnd < 0 ? to : from + firstLineEnd + 1;
  const closingStart = raw.lastIndexOf('\n');
  const lastLine = closingStart < 0 ? raw : raw.slice(closingStart + 1);
  const contentTo = /^ {0,3}(?:`{3,}|~{3,})\s*$/u.test(lastLine) ? from + closingStart : to;
  return { ...rangeAt(source, from, to), language, contentFrom, contentTo };
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

function collectTasks(source: string, fencedRanges: MarkdownRange[]): MarkdownTask[] {
  return linesOf(source).flatMap(({ from, to, text }) => {
    if (withinRanges(from, fencedRanges)) return [];
    const match = text.match(taskPattern);
    if (!match) return [];
    return [{
      ...rangeAt(source, from, to),
      checked: match[2].toLowerCase() === 'x',
      text: match[3],
      depth: Math.floor(match[1].replace(/\t/gu, '  ').length / 2),
    }];
  });
}

function collectLinks(source: string, fencedRanges: MarkdownRange[]): MarkdownLink[] {
  return collectLinkEntries(source, fencedRanges, false) as MarkdownLink[];
}

function collectImages(source: string, fencedRanges: MarkdownRange[]): MarkdownImage[] {
  return collectLinkEntries(source, fencedRanges, true) as MarkdownImage[];
}

function collectLinkEntries(source: string, fencedRanges: MarkdownRange[], images: boolean): Array<MarkdownLink | MarkdownImage> {
  const found: Array<MarkdownLink | MarkdownImage> = [];
  for (const match of source.matchAll(linkPattern)) {
    const from = match.index ?? 0;
    if (withinRanges(from, fencedRanges) || (images ? match[1] !== '!' : match[1] === '!')) continue;
    const range = rangeAt(source, from, from + match[0].length);
    if (images) found.push({ ...range, alt: match[2], src: match[3], ...(match[4] ? { title: match[4] } : {}) });
    else found.push({ ...range, label: match[2], url: match[3], ...(match[4] ? { title: match[4] } : {}) });
  }
  return found;
}

function collectMathBlocks(source: string, fencedRanges: MarkdownRange[], codeBlocks: MarkdownCodeBlock[]): MarkdownMathBlock[] {
  const blocks = codeBlocks
    .filter((block) => block.language === 'math' || block.language === 'katex')
    .map((block) => ({ ...rangeAt(source, block.from, block.to), contentFrom: block.contentFrom, contentTo: block.contentTo }));
  let open: number | null = null;
  for (const line of linesOf(source)) {
    if (withinRanges(line.from, fencedRanges) || line.text.trim() !== '$$') continue;
    if (open === null) open = line.from;
    else {
      blocks.push({ ...rangeAt(source, open, line.to), contentFrom: open + 3, contentTo: line.from });
      open = null;
    }
  }
  return blocks;
}

function calculateStats(source: string, fencedRanges: MarkdownRange[]): MarkdownDocumentStats {
  let plain = source;
  for (const range of [...fencedRanges].reverse()) plain = `${plain.slice(0, range.from)} ${plain.slice(range.to)}`;
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
    paragraphs: source.split(/\n\s*\n/gu).filter((part) => part.trim()).length,
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

function linesOf(source: string): Array<{ from: number; to: number; text: string }> {
  const lines: Array<{ from: number; to: number; text: string }> = [];
  let from = 0;
  for (const text of source.split('\n')) {
    lines.push({ from, to: from + text.length, text });
    from += text.length + 1;
  }
  return lines;
}

function withinRanges(offset: number, ranges: MarkdownRange[]): boolean {
  return ranges.some((range) => offset >= range.from && offset < range.to);
}

function slugify(text: string): string {
  return text.normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/[\s-]+/gu, '-');
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

function mergeHeadings(source: string, parsed: MarkdownHeading[]): MarkdownHeading[] {
  const headings = new Map(parsed.map((heading) => [heading.from, heading]));
  const lines = linesOf(source);
  let inFence = false;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    const lineText = line.text.replace(/\r$/u, '');
    if (/^\s*(?:`{3,}|~{3,})/u.test(lineText)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || headings.has(line.from)) continue;
    const match = lineText.match(/^(#{1,6})(?:[ \t]+|$)(.*)$/u);
    if (!match) continue;
    const text = match[2].replace(/[ \t]+#+[ \t]*$/u, '').trim().normalize('NFC');
    if (!text) continue;
    headings.set(line.from, { ...rangeAt(source, line.from, line.to), id: '', level: match[1].length, text, slug: slugify(text) });
  }
  inFence = false;
  for (let index = 0; index + 1 < lines.length; index++) {
    const line = lines[index]!;
    const lineText = line.text.replace(/\r$/u, '');
    if (/^\s*(?:`{3,}|~{3,})/u.test(lineText)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || headings.has(line.from)) continue;
    const underline = lines[index + 1]!.text.trim();
    const level = /^=+$/u.test(underline) ? 1 : /^-+$/u.test(underline) ? 2 : null;
    const text = lineText.trim().normalize('NFC');
    if (level === null || !text) continue;
    headings.set(line.from, { ...rangeAt(source, line.from, lines[index + 1]!.to), id: '', level, text, slug: slugify(text) });
  }
  return [...headings.values()]
    .sort((a, b) => a.from - b.from)
    .map((heading, index) => ({ ...heading, id: `heading-${index}` }));
}

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
