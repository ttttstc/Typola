// 段落级 markdown diff —— 不引外部包,自己实现 LCS。
//
// 输入:原文 + AI 提议版本(两个 markdown 字符串)
// 输出:DiffHunk[],按段落对齐:
//   - unchanged:两边一样的段(用户不需要选,默认保留)
//   - modified:同一位置的段被改写(原文 vs 新版)
//   - added:proposed 里多出来的段
//   - removed:original 里被删掉的段
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

// 段落 = 用 \n\n+ 分隔的非空文本块。保留段内换行(如 markdown 列表)。
export function splitParagraphs(text: string): string[] {
  if (!text) return [];
  return text
    .split(/\n{2,}/u)
    .map((p) => p.replace(/\s+$/u, ''))
    .filter((p) => p.length > 0);
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

// 主入口:产出段落级 hunks。相邻的 removed+added 自动合并成 modified。
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

  // 后处理:相邻的 removed/added 配对合并成 modified(更符合用户心智)。
  // LCS 回溯有时给 removed→added 顺序、有时给 added→removed,两种都合并。
  // 多对多场景:1 removed + N added 或 N removed + 1 added 时,只配对 1:1,其余留独立。
  const merged: DiffHunk[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const cur = raw[i];
    const next = raw[i + 1];
    if (next && cur.kind === 'removed' && next.kind === 'added') {
      merged.push({ kind: 'modified', before: cur.content, after: next.content });
      i += 1;
      continue;
    }
    if (next && cur.kind === 'added' && next.kind === 'removed') {
      merged.push({ kind: 'modified', before: next.content, after: cur.content });
      i += 1;
      continue;
    }
    merged.push(cur);
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
