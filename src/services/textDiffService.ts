export type DiffOp = 'equal' | 'insert' | 'delete';

export type DiffHunk = {
  op: DiffOp;
  text: string;
};

/**
 * 简单的行级 diff,使用最长公共子序列(LCS)实现。
 * 适合查看 Claude 改了哪几行,不做 fancy 渲染。
 */
function splitLines(text: string): string[] {
  if (text === '') return [];
  return text.split(/\r\n|\r|\n/);
}

function lcsTable(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const table: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        table[i][j] = table[i - 1][j - 1] + 1;
      } else {
        table[i][j] = Math.max(table[i - 1][j], table[i][j - 1]);
      }
    }
  }
  return table;
}

export function diffTexts(before: string, after: string): { hunks: DiffHunk[] } {
  const a = splitLines(before);
  const b = splitLines(after);
  const table = lcsTable(a, b);
  const hunks: DiffHunk[] = [];
  let i = a.length;
  let j = b.length;
  const stack: DiffHunk[] = [];
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      stack.push({ op: 'equal', text: a[i - 1] });
      i--;
      j--;
    } else if (table[i - 1][j] >= table[i][j - 1]) {
      stack.push({ op: 'delete', text: a[i - 1] });
      i--;
    } else {
      stack.push({ op: 'insert', text: b[j - 1] });
      j--;
    }
  }
  while (i > 0) {
    stack.push({ op: 'delete', text: a[i - 1] });
    i--;
  }
  while (j > 0) {
    stack.push({ op: 'insert', text: b[j - 1] });
    j--;
  }
  for (let k = stack.length - 1; k >= 0; k--) {
    hunks.push(stack[k]);
  }
  return { hunks };
}
