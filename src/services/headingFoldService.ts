// Heading 折叠服务 — 移植 markra heading-toggle.ts 的 section 扫描算法,
// 适配 Vditor IR(无 ProseMirror Decorations,改为直接 DOM 操作)。
//
// 折叠状态按 `<level>:<sectionIndex>:<text>` 键保存(而非 source line)。
// 同级同名 heading 多次出现时 sectionIndex 区分(同一文档插新 heading 之前,
// sectionIndex 会顺移;这是已知权衡,用于保证折叠不"串段")。
// 这样用户在 source 里上方插入行时折叠不会"漂移"到错误 heading;
// 删/改 heading 文本时自然失效。

export type HeadingSection = {
  headingLine: number;
  level: number;
  endLine: number;
  sectionIndex: number;
  text: string;
};

export type FoldKey = string; // `${level}:${sectionIndex}:${text}`

const FOLD_TOGGLE_CLASS = 'typola-heading-fold-toggle';
const FOLDED_CLASS = 'typola-heading-folded';
const DATA_LEVEL = 'data-typola-fold-level';
const DATA_INDEX = 'data-typola-fold-index';
const DATA_TEXT = 'data-typola-fold-text';

// 移植自 markra heading-toggle.ts:扫描 markdown source,收集所有 heading section。
// section = 从 heading 行到下一个同级或更高级 heading 之前的所有行。
// sectionIndex(0-based,严格单调递增,与 heading 扫描顺序一一对应)用于 fold key
// 区分同名 heading。注意:不能用 sections.length 当 counter,因为 pop 时
// sections.length 会回退,导致重复的 sectionIndex。
export function collectHeadingSections(source: string): HeadingSection[] {
  const lines = source.split('\n');
  const sections: HeadingSection[] = [];
  const stack: Array<{ headingLine: number; level: number; sectionIndex: number; text: string }> = [];
  let counter = 0;
  let fenceMarker: '`' | '~' | null = null;
  for (let i = 0; i < lines.length; i++) {
    const fence = lines[i].match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      const marker = fence[1]![0] as '`' | '~';
      if (fenceMarker === marker) fenceMarker = null;
      else if (!fenceMarker) fenceMarker = marker;
      continue;
    }
    if (fenceMarker) continue;

    const heading = parseAtxHeadingLine(lines[i]);
    if (!heading) continue;
    const { level, text } = heading;
    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      const top = stack.pop()!;
      sections.push({
        headingLine: top.headingLine,
        level: top.level,
        endLine: i - 1,
        sectionIndex: top.sectionIndex,
        text: top.text,
      });
    }
    stack.push({ headingLine: i, level, sectionIndex: counter++, text });
  }
  while (stack.length > 0) {
    const top = stack.pop()!;
    sections.push({
      headingLine: top.headingLine,
      level: top.level,
      endLine: lines.length - 1,
      sectionIndex: top.sectionIndex,
      text: top.text,
    });
  }
  // 按 headingLine 升序 — pop 顺序可能穿插,折叠时需要按扫描顺序找"下一个 peer"。
  sections.sort((a, b) => a.headingLine - b.headingLine);
  return sections;
}

export function extractAtxHeadingText(line: string): string {
  return parseAtxHeadingLine(line)?.text ?? '';
}

function parseAtxHeadingLine(line: string): { level: number; text: string } | null {
  const match = line.match(/^(#{1,6})(?:[ \t]+|$)(.*)$/);
  if (!match) return null;
  const level = match[1]!.length;
  const text = match[2]!
    .replace(/[ \t]+#+[ \t]*$/u, '')
    .trim()
    .normalize('NFC');
  if (!text) return null;
  return { level, text };
}

export function foldKey(level: number, text: string, sectionIndex = 0): FoldKey {
  return `${level}:${sectionIndex}:${text}`;
}

// 把当前 sections + 折叠集合应用到 IR DOM。幂等:每次调用前清掉旧标记再贴新标记。
export function applyHeadingFolds(
  ir: HTMLElement,
  source: string,
  foldedHeadings: ReadonlySet<FoldKey>,
): void {
  cleanupOldFolds(ir);
  const sections = collectHeadingSections(source);
  if (sections.length === 0) return;

  const blocks = getTopLevelBlocks(ir);
  if (blocks.length === 0) return;

  // 用 (level, sectionIndex, text) 找 DOM 块索引。
  // 同名 heading 多次出现时,foldKey 区分,apply 只针对单个 DOM 块。
  const headingBlockIdxByKey = new Map<FoldKey, number>();

  for (const section of sections) {
    const text = section.text;
    if (!text) continue;
    const key = foldKey(section.level, text, section.sectionIndex);
    if (headingBlockIdxByKey.has(key)) continue;

    let blockIdx = -1;
    for (let i = 0; i < blocks.length; i++) {
      if (!/^H[1-6]$/.test(blocks[i].tagName)) continue;
      if (blocks[i].textContent?.trim() !== text) continue;
      blockIdx = i;
      break;
    }
    if (blockIdx < 0) continue;
    headingBlockIdxByKey.set(key, blockIdx);
  }

  // 注入 toggle button(所有 heading,无论折叠与否)
  for (const [key, blockIdx] of headingBlockIdxByKey.entries()) {
    const [levelStr, indexStr, ...rest] = key.split(':');
    const level = Number(levelStr);
    const sectionIndex = Number(indexStr);
    const text = rest.join(':');
    const headingEl = blocks[blockIdx];
    const toggle = document.createElement('span');
    toggle.className = FOLD_TOGGLE_CLASS;
    toggle.setAttribute(DATA_LEVEL, String(level));
    toggle.setAttribute(DATA_INDEX, String(sectionIndex));
    toggle.setAttribute(DATA_TEXT, text);
    toggle.setAttribute('role', 'button');
    toggle.setAttribute('aria-label', foldedHeadings.has(key) ? '展开' : '折叠');
    toggle.setAttribute('aria-expanded', String(!foldedHeadings.has(key)));
    toggle.tabIndex = 0;
    toggle.textContent = foldedHeadings.has(key) ? '▼' : '▶';
    headingEl.insertBefore(toggle, headingEl.firstChild);
  }

  // 折叠:对每个被折叠的 heading,从它的 DOM 块后一个块开始,
  // 直到遇到下一个更高/同级 heading 块为止,全部加 folded class。
  // headingBlockIdxByKey 的插入顺序 == sections 扫描顺序 == headingLine 顺序,
  // 找 startIdx 之后第一个 level <= 当前 level 的 heading 即为下一个 peer。
  for (const [key, startIdx] of headingBlockIdxByKey.entries()) {
    if (!foldedHeadings.has(key)) continue;

    let endIdx = blocks.length;
    for (const [otherKey, otherIdx] of headingBlockIdxByKey.entries()) {
      if (otherIdx <= startIdx) continue;
      const otherLevel = Number(otherKey.split(':')[0]);
      if (otherLevel <= levelOf(key)) {
        endIdx = otherIdx;
        break;
      }
    }

    for (let i = startIdx + 1; i < endIdx; i++) {
      blocks[i].classList.add(FOLDED_CLASS);
    }
  }
}

function levelOf(key: FoldKey): number {
  return Number(key.split(':')[0]);
}

function cleanupOldFolds(ir: HTMLElement): void {
  ir.querySelectorAll(`.${FOLDED_CLASS}`).forEach((el) => el.classList.remove(FOLDED_CLASS));
  ir.querySelectorAll(`.${FOLD_TOGGLE_CLASS}`).forEach((el) => el.remove());
}

// Vditor IR 把每个 markdown block 渲染为顶层 child,带 data-block="0" 标识。
// 用 `:scope > [data-block="0"]` 选取并按 DOM 顺序返回。
function getTopLevelBlocks(ir: HTMLElement): HTMLElement[] {
  return Array.from(ir.querySelectorAll<HTMLElement>(':scope > [data-block="0"]'));
}

// 从 click target 提取 fold key,若不是 toggle 按钮返回 null。
export function getFoldKeyFromTarget(target: EventTarget | null): FoldKey | null {
  const el = (target as Element | null)?.closest(`.${FOLD_TOGGLE_CLASS}`);
  if (!el) return null;
  const level = el.getAttribute(DATA_LEVEL);
  const sectionIndex = el.getAttribute(DATA_INDEX);
  const text = el.getAttribute(DATA_TEXT);
  if (level === null || sectionIndex === null || text === null) return null;
  return foldKey(Number(level), text, Number(sectionIndex));
}

export function toggleFoldKey(set: ReadonlySet<FoldKey>, key: FoldKey): Set<FoldKey> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}
