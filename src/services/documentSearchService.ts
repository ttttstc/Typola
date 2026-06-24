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

// 反查 source 偏移 → IR DOM 中的文本节点 + 节点内偏移。
//
// 用法:`findIrDomRange(source, ir, from, to)` 给一个 source 字符串 + Vditor IR DOM 根 +
// source 中 `[from, to)` 的字符范围,返回对应的 `Range`,可在 IR 上设选区 + scrollIntoView。
//
// 实现思路跟 `selectionActions.buildPlainToSourceMap` 对称:遍历 source 时维护 plainIdx→
// sourceIdx 映射;同时按 plain 顺序把 IR 的可见文本节点铺平到 plain 序列,记录每个 plain 字符
// 对应的 IR TextNode + 节点内偏移。这样 sourceIdx 命中 plain 序列后,直接拿到 IR 节点 + offset。
//
// 返回 null 当 source 范围内超出 plain 序列(理论上不会发生,因为 source 是 markdown、IR 是它
// 的渲染,字符数完全对齐——保守返回 null 让调用方走"找不到"分支)。
type IrTextHit = { node: Text; offset: number };

// 内部:遍历 IR 的可见文本节点(忽略 vditor-ir__node--expand 等),按顺序返回 Text + 节点起
// 始 plainIdx 的列表。CodeBlock / 图片 alt / 链接 text 等节点都参与;只跳过 `<input>` `<textarea>`
// 等编辑控件,因为它们不是 source 渲染的产物。
function collectIrTextNodes(ir: HTMLElement): Text[] {
  const walker = ir.ownerDocument?.createTreeWalker(ir, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      // 跳过编辑器内部输入控件
      const tag = parent.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const out: Text[] = [];
  if (!walker) return out;
  let n: Node | null = walker.nextNode();
  while (n) {
    out.push(n as Text);
    n = walker.nextNode();
  }
  return out;
}

export function findIrDomRange(
  source: string,
  ir: HTMLElement,
  from: number,
  to: number,
): Range | null {
  if (from < 0 || to > source.length || from > to) return null;

  // 1) 遍历 source,识别行内 markdown marker,建立 plainIdx ↔ sourceIdx 双向数组。
  //    plainToSource 长度 = 当前 plain 字符数 = 给每个 marker 内容字符对应的 source 偏移。
  //    sourceToPlain 在每个 source 偏移记录"如果该字符是 plain,它在 plain 序列里的位置"。
  const plainToSource: number[] = [];
  const sourceToPlain: number[] = new Array<number>(source.length).fill(-1);
  {
    let si = 0;
    const len = source.length;
    while (si < len) {
      const rest = source.slice(si);
      const plainIdxBefore = plainToSource.length;
      // 图片 ![alt](url)
      let m = rest.match(/^!\[([^\]]*)\]\([^)]*\)/);
      if (m) {
        const altOffset = 2;
        for (let k = 0; k < m[1].length; k++) {
          plainToSource.push(si + altOffset + k);
          sourceToPlain[si + altOffset + k] = plainIdxBefore + k;
        }
        si += m[0].length;
        continue;
      }
      // 链接 [text](url)
      m = rest.match(/^\[([^\]]*)\]\([^)]*\)/);
      if (m) {
        const textOffset = 1;
        for (let k = 0; k < m[1].length; k++) {
          plainToSource.push(si + textOffset + k);
          sourceToPlain[si + textOffset + k] = plainIdxBefore + k;
        }
        si += m[0].length;
        continue;
      }
      // 行内代码 `code`
      m = rest.match(/^`([^`]+)`/);
      if (m) {
        for (let k = 0; k < m[1].length; k++) {
          plainToSource.push(si + 1 + k);
          sourceToPlain[si + 1 + k] = plainIdxBefore + k;
        }
        si += m[0].length;
        continue;
      }
      // **加粗**
      m = rest.match(/^\*\*([^*]+)\*\*/);
      if (m) {
        for (let k = 0; k < m[1].length; k++) {
          plainToSource.push(si + 2 + k);
          sourceToPlain[si + 2 + k] = plainIdxBefore + k;
        }
        si += m[0].length;
        continue;
      }
      // ~~删除线~~
      m = rest.match(/^~~([^~]+)~~/);
      if (m) {
        for (let k = 0; k < m[1].length; k++) {
          plainToSource.push(si + 2 + k);
          sourceToPlain[si + 2 + k] = plainIdxBefore + k;
        }
        si += m[0].length;
        continue;
      }
      // _斜体_ 或 *斜体* 简化:前后非 \w 才认
      const before = si > 0 ? source[si - 1] : '';
      const isWordBefore = /\w/.test(before);
      if (!isWordBefore) {
        m = rest.match(/^_([^_\n]+)_/);
        if (m && !/\w/.test(source[si + m[0].length] ?? '')) {
          for (let k = 0; k < m[1].length; k++) {
            plainToSource.push(si + 1 + k);
            sourceToPlain[si + 1 + k] = plainIdxBefore + k;
          }
          si += m[0].length;
          continue;
        }
        m = rest.match(/^\*([^*\n]+)\*/);
        if (m && !/\w/.test(source[si + m[0].length] ?? '')) {
          for (let k = 0; k < m[1].length; k++) {
            plainToSource.push(si + 1 + k);
            sourceToPlain[si + 1 + k] = plainIdxBefore + k;
          }
          si += m[0].length;
          continue;
        }
      }
      // 普通字符。'\n' 不计入 plain:Vditor IR 用 block 元素分隔段,
      // 段间没有可见字符;匹配一个 source 跨段时,plain 序列里也没有 \n。
      if (source[si] === '\n') {
        si += 1;
        continue;
      }
      plainToSource.push(si);
      sourceToPlain[si] = plainIdxBefore;
      si += 1;
    }
  }

  // 2) source [from, to) → plain [fromPlain, toPlain)
  const fromPlain = sourceToPlain[from];
  const toPlain = sourceToPlain[to - 1] + 1;
  if (fromPlain < 0 || toPlain <= fromPlain) return null;

  // 3) 遍历 IR 文本节点,把 plain 序列和 IR 节点序列对齐
  const nodes = collectIrTextNodes(ir);
  if (nodes.length === 0) return null;
  const nodeStartPlain: number[] = [];
  let acc = 0;
  for (const node of nodes) {
    nodeStartPlain.push(acc);
    acc += node.data.length;
  }
  const totalPlain = acc;
  if (fromPlain >= totalPlain) return null;
  // toPlain 越界(IR 块间换行不足)→ 收缩到 totalPlain,选区截止到最后一个节点末尾
  const clampedToPlain = Math.min(toPlain, totalPlain);

  // 4) 在节点序列里二分找 plainIdx 命中的节点
  const locate = (plainIdx: number): IrTextHit | null => {
    let lo = 0;
    let hi = nodes.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const start = nodeStartPlain[mid];
      const end = start + nodes[mid].data.length;
      if (plainIdx < start) {
        hi = mid - 1;
      } else if (plainIdx >= end) {
        lo = mid + 1;
      } else {
        return { node: nodes[mid], offset: plainIdx - start };
      }
    }
    // 越界:取最后一个节点末尾
    const last = nodes[nodes.length - 1];
    return { node: last, offset: last.data.length };
  };
  const startHit = locate(fromPlain);
  const endHit = locate(Math.max(fromPlain, clampedToPlain - 1));
  if (!startHit || !endHit) return null;

  const range = ir.ownerDocument?.createRange();
  if (!range) return null;
  const startOffset = Math.min(startHit.offset, startHit.node.data.length);
  const endOffset = Math.min(endHit.offset + 1, endHit.node.data.length);
  range.setStart(startHit.node, startOffset);
  range.setEnd(endHit.node, endOffset);
  return range;
}
