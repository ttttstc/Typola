// 段落级 markdown diff —— 不引外部包,自己实现 LCS。
//
// 输入:原文 + AI 提议版本(两个 markdown 字符串)
// 输出:DiffHunk[],按段落对齐:
//   - unchanged:两边一样的段(用户不需要选,默认保留)
//   - modified:同一位置的段被改写(原文 vs 新版)
//   - added:proposed 里多出来的段
//   - removed:original 里被删掉的段
//
// 切段策略(P0-6):普通段落用 \n\n 切,但 markdown **结构化块**(YAML
// frontmatter / 围栏代码块 / 缩进代码块 / 表格 / 引用块)整块作为独立段,
// 不被空行或内部换行误切。否则改 frontmatter 一个字段会把整篇正文一起报为
// modified。
//
// 合并策略(P0-7):后处理用贪心 block-diff 单元 —— 连续的 removed/added 段
// 整体当一个"修改区"处理。1:1 → modified;N:N(等长)→ N 条 modified
// 对齐配对;N:M(不等长)→ min(N,M) 条 modified 配对 + 剩下的留作 added/
// removed,但它们标"同属一个块,作为一组决策"。
//
// 合并算法:mergeDecisions(hunks, decisions) 把用户对每个可决策 hunk 的
// accept/reject 选择汇总成最终 markdown。

export type DiffHunkKind = 'unchanged' | 'modified' | 'added' | 'removed';

export type DiffHunk =
  | { kind: 'unchanged'; content: string }
  | { kind: 'modified'; before: string; after: string }
  | { kind: 'added'; content: string }
  | { kind: 'removed'; content: string };

export type HunkDecision = 'accept' | 'reject';

// 把 markdown 切成"语义段":普通段落 + 结构化块。
//
// 结构化块识别(必须整块作为一段,不被内部空行切开):
//   1. YAML frontmatter:文档开头的 ---\n...\n---\n
//   2. 围栏代码块:``` 或 ~~~ 包起来的(支持任意语言标识)
//   3. 缩进代码块:连续 4 空格或 tab 缩进的行
//   4. 表格:连续以 | 开头的行(至少 2 行)
//   5. 引用块:连续以 > 开头的行
// 其他用空行(\n{2,})切。
export function splitParagraphs(text: string): string[] {
  if (!text) return [];
  const lines = text.split('\n');
  const blocks: string[] = [];
  let buffer: string[] = [];

  const flushBuffer = () => {
    if (buffer.length === 0) return;
    // 用空行把 buffer 内剩余普通段落切开
    const joined = buffer.join('\n');
    const parts = joined.split(/\n{2,}/u);
    for (const part of parts) {
      const trimmed = part.replace(/\s+$/u, '');
      if (trimmed.length > 0) blocks.push(trimmed);
    }
    buffer = [];
  };

  // 跳过当前位置紧随的空行(结构化块识别后调用,避免下一段带前导 \n)。
  const skipBlankLines = (startIdx: number): number => {
    let k = startIdx;
    while (k < lines.length && lines[k].trim() === '') k += 1;
    return k;
  };

  let i = 0;
  // 1. YAML frontmatter:仅文档开头
  if (lines[0] === '---') {
    let j = 1;
    while (j < lines.length && lines[j] !== '---') j += 1;
    if (j < lines.length) {
      blocks.push(lines.slice(0, j + 1).join('\n'));
      i = skipBlankLines(j + 1);
    }
  }

  while (i < lines.length) {
    const line = lines[i];

    // 2. 围栏代码块 ``` 或 ~~~
    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/u);
    if (fenceMatch) {
      flushBuffer();
      const fenceChar = fenceMatch[1][0];
      const fenceLen = fenceMatch[1].length;
      const block: string[] = [line];
      i += 1;
      while (i < lines.length) {
        block.push(lines[i]);
        // fenceChar 是 ` 或 ~,都不是正则元字符,不用转义。
        const closeRe = new RegExp(`^\\s{0,3}${fenceChar}{${fenceLen},}\\s*$`, 'u');
        if (closeRe.test(lines[i])) {
          i += 1;
          break;
        }
        i += 1;
      }
      blocks.push(block.join('\n'));
      i = skipBlankLines(i);
      continue;
    }

    // 3. 缩进代码块(4 空格 / tab 起始,buffer 为空时才识别 — 否则可能是列表的延续行)
    if (/^( {4}|\t)/u.test(line) && buffer.length === 0) {
      const block: string[] = [line];
      let k = i + 1;
      while (k < lines.length && (/^( {4}|\t)/u.test(lines[k]) || lines[k].trim() === '')) {
        block.push(lines[k]);
        k += 1;
      }
      while (block.length > 0 && block[block.length - 1].trim() === '') block.pop();
      if (block.length > 0) blocks.push(block.join('\n'));
      i = skipBlankLines(k);
      continue;
    }

    // 4. 表格(连续 | 开头)
    if (/^\s*\|/u.test(line)) {
      const block: string[] = [line];
      let k = i + 1;
      while (k < lines.length && /^\s*\|/u.test(lines[k])) {
        block.push(lines[k]);
        k += 1;
      }
      if (block.length >= 2) {
        flushBuffer();
        blocks.push(block.join('\n'));
        i = skipBlankLines(k);
        continue;
      }
    }

    // 5. 引用块(连续 > 开头)
    if (/^\s*>/u.test(line)) {
      flushBuffer();
      const block: string[] = [line];
      let k = i + 1;
      while (k < lines.length && /^\s*>/u.test(lines[k])) {
        block.push(lines[k]);
        k += 1;
      }
      blocks.push(block.join('\n'));
      i = skipBlankLines(k);
      continue;
    }

    // 普通行 → 进 buffer
    buffer.push(line);
    i += 1;
  }
  flushBuffer();
  return blocks;
}

// 判断 hunk 是否需要用户决策(unchanged 不需要)。
export function isDecidableHunk(hunk: DiffHunk): boolean {
  return hunk.kind !== 'unchanged';
}

// 计算 LCS DP 表:dp[i][j] = a[0..i) 和 b[0..j) 的 LCS 长度。
function buildLcs(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i < m; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (a[i] === b[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }
  return dp;
}

// 回溯 DP 表,产出 ops:'same' | 'del-a' | 'add-b'。
function backtrack(a: string[], b: string[], dp: number[][]): Array<'same' | 'del-a' | 'add-b'> {
  const ops: Array<'same' | 'del-a' | 'add-b'> = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      ops.push('same');
      i -= 1;
      j -= 1;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      ops.push('del-a');
      i -= 1;
    } else {
      ops.push('add-b');
      j -= 1;
    }
  }
  while (i > 0) {
    ops.push('del-a');
    i -= 1;
  }
  while (j > 0) {
    ops.push('add-b');
    j -= 1;
  }
  return ops.reverse();
}

// P0-7:把连续的 removed/added 段当一个 block-diff 单元合并:
//   - N removed + 0 added(M=0):全部留 removed
//   - 0 removed + N added(N=0):全部留 added
//   - N removed + M added,min(N,M) 对配对成 modified,剩下的留 added/removed
// 解决 "把 p2 删了换成 N2a+N2b" 的心智被错拆成 modified+added 的问题。
function mergeAdjacentBlock(removeds: DiffHunk[], addeds: DiffHunk[]): DiffHunk[] {
  const out: DiffHunk[] = [];
  const pairCount = Math.min(removeds.length, addeds.length);
  for (let i = 0; i < pairCount; i += 1) {
    const r = removeds[i] as { kind: 'removed'; content: string };
    const a = addeds[i] as { kind: 'added'; content: string };
    out.push({ kind: 'modified', before: r.content, after: a.content });
  }
  // 剩下的:N>M 时多出来的 removed,N<M 时多出来的 added
  for (let i = pairCount; i < removeds.length; i += 1) out.push(removeds[i]);
  for (let i = pairCount; i < addeds.length; i += 1) out.push(addeds[i]);
  return out;
}

// 主入口:产出段落级 hunks。相邻的 removed/added 区块按 N:M 合并(P0-7)。
export function diffMarkdown(original: string, proposed: string): DiffHunk[] {
  const a = splitParagraphs(original);
  const b = splitParagraphs(proposed);
  const dp = buildLcs(a, b);
  const ops = backtrack(a, b, dp);

  const raw: DiffHunk[] = [];
  let ai = 0;
  let bi = 0;
  for (const op of ops) {
    if (op === 'same') {
      raw.push({ kind: 'unchanged', content: a[ai] });
      ai += 1;
      bi += 1;
    } else if (op === 'del-a') {
      raw.push({ kind: 'removed', content: a[ai] });
      ai += 1;
    } else {
      raw.push({ kind: 'added', content: b[bi] });
      bi += 1;
    }
  }

  // 后处理:扫连续的 removed/added 段(无视 LCS 内部顺序),作为一个块整体配对成 modified。
  // 这样 [removed p2, added N2a, added N2b] 或 [added N2a, removed p2, added N2b] 都能被识别成
  // 「1 段被替换成 2 段」,而不是 [modified p2→N2a, added N2b]。
  const merged: DiffHunk[] = [];
  let i = 0;
  while (i < raw.length) {
    const cur = raw[i];
    if (cur.kind === 'unchanged') {
      merged.push(cur);
      i += 1;
      continue;
    }
    // 收集这一段连续的 removed/added(可能交错)
    const removeds: DiffHunk[] = [];
    const addeds: DiffHunk[] = [];
    while (i < raw.length && raw[i].kind !== 'unchanged') {
      if (raw[i].kind === 'removed') removeds.push(raw[i]);
      else addeds.push(raw[i]);
      i += 1;
    }
    merged.push(...mergeAdjacentBlock(removeds, addeds));
  }
  return merged;
}

// 把用户决策合并成最终 markdown。decisions 索引对齐 hunks 中需要决策的项。
// 不需决策的(unchanged)不消耗 decisions 索引。
export function mergeDecisions(hunks: DiffHunk[], decisions: HunkDecision[]): string {
  const segments: string[] = [];
  let decisionIndex = 0;
  for (const hunk of hunks) {
    if (hunk.kind === 'unchanged') {
      segments.push(hunk.content);
      continue;
    }
    const decision = decisions[decisionIndex] ?? 'accept';
    decisionIndex += 1;
    if (hunk.kind === 'modified') {
      segments.push(decision === 'accept' ? hunk.after : hunk.before);
    } else if (hunk.kind === 'added') {
      if (decision === 'accept') segments.push(hunk.content);
    } else if (hunk.kind === 'removed') {
      // accept(采纳删除)→ 不保留;reject(保留原段)→ 保留
      if (decision === 'reject') segments.push(hunk.content);
    }
  }
  return segments.join('\n\n');
}

// 统计需要决策的 hunk 数(给 UI 计数器用)。
export function countDecidableHunks(hunks: DiffHunk[]): number {
  return hunks.filter(isDecidableHunk).length;
}
