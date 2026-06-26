// Heading 折叠服务 — 移植 markra heading-toggle.ts 的 section 扫描算法,
// 适配 Vditor IR(无 ProseMirror Decorations,改为直接 DOM 操作)。
//
// 折叠状态按 `<level>:<text>` 键保存,而非 source line。这样用户在 source 里
// 上方插入行时折叠不会"漂移"到错误 heading;删/改 heading 文本时自然失效。

export type HeadingSection = {
  headingLine: number;
  level: number;
  endLine: number;
};

export type FoldKey = string; // `${level}:${text}`

const FOLD_TOGGLE_CLASS = 'typola-heading-fold-toggle';
const FOLDED_CLASS = 'typola-heading-folded';
const DATA_LEVEL = 'data-typola-fold-level';
const DATA_TEXT = 'data-typola-fold-text';

// 移植自 markra heading-toggle.ts:扫描 markdown source,收集所有 heading section。
// section = 从 heading 行到下一个同级或更高级 heading 之前的所有行。
export function collectHeadingSections(source: string): HeadingSection[] {
  const lines = source.split('\n');
  const sections: HeadingSection[] = [];
  const stack: Array<{ line: number; level: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+/);
    if (!match) continue;
    const level = match[1].length;
    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      const top = stack.pop()!;
      sections.push({ headingLine: top.line, level: top.level, endLine: i - 1 });
    }
    stack.push({ line: i, level });
  }
  while (stack.length > 0) {
    const top = stack.pop()!;
    sections.push({ headingLine: top.line, level: top.level, endLine: lines.length - 1 });
  }
  return sections;
}

export function foldKey(level: number, text: string): FoldKey {
  return `${level}:${text}`;
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

  // 按 heading text 找 DOM 块索引(同一文档 heading 文本通常唯一;
  // 重复则取首个,后续重复 folding 仅影响第一个匹配)。
  const headingBlockIdxByText = new Map<string, number>();
  const textByBlockIdx = new Map<number, string>();

  for (const section of sections) {
    const headingLine = source.split('\n')[section.headingLine] ?? '';
    const text = headingLine.replace(/^#+\s+/, '').trim();
    if (!text) continue;
    const key = foldKey(section.level, text);
    if (headingBlockIdxByText.has(key)) continue;

    let blockIdx = -1;
    for (let i = 0; i < blocks.length; i++) {
      if (!/^H[1-6]$/.test(blocks[i].tagName)) continue;
      if (blocks[i].textContent?.trim() !== text) continue;
      blockIdx = i;
      break;
    }
    if (blockIdx < 0) continue;
    headingBlockIdxByText.set(key, blockIdx);
    textByBlockIdx.set(blockIdx, text);
  }

  // 注入 toggle button(所有 heading,无论折叠与否)
  for (const [key, blockIdx] of headingBlockIdxByText.entries()) {
    const [levelStr, text] = key.split(':');
    const level = Number(levelStr);
    const headingEl = blocks[blockIdx];
    const toggle = document.createElement('span');
    toggle.className = FOLD_TOGGLE_CLASS;
    toggle.setAttribute(DATA_LEVEL, String(level));
    toggle.setAttribute(DATA_TEXT, text);
    toggle.setAttribute('role', 'button');
    toggle.setAttribute('aria-label', foldedHeadings.has(key) ? '展开' : '折叠');
    toggle.textContent = foldedHeadings.has(key) ? '▼' : '▶';
    headingEl.insertBefore(toggle, headingEl.firstChild);
  }

  // 折叠:对每个被折叠的 heading,从它的 DOM 块后一个块开始,
  // 直到遇到下一个更高/同级 heading 块为止,全部加 folded class。
  for (const section of sections) {
    const headingLine = source.split('\n')[section.headingLine] ?? '';
    const text = headingLine.replace(/^#+\s+/, '').trim();
    const key = foldKey(section.level, text);
    if (!foldedHeadings.has(key)) continue;

    const startIdx = headingBlockIdxByText.get(key);
    if (startIdx === undefined) continue;

    // 找下一个 ≥ level 的 heading block idx
    let endIdx = blocks.length;
    for (const [otherKey, otherIdx] of headingBlockIdxByText.entries()) {
      if (otherIdx <= startIdx) continue;
      const [otherLevelStr] = otherKey.split(':');
      const otherLevel = Number(otherLevelStr);
      if (otherLevel <= section.level) {
        endIdx = otherIdx;
        break;
      }
    }

    for (let i = startIdx + 1; i < endIdx; i++) {
      blocks[i].classList.add(FOLDED_CLASS);
    }
  }
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
  const text = el.getAttribute(DATA_TEXT);
  if (level === null || text === null) return null;
  return foldKey(Number(level), text);
}

export function toggleFoldKey(set: ReadonlySet<FoldKey>, key: FoldKey): Set<FoldKey> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}
