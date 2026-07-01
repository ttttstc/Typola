export type InlineDiffPart = {
  type: 'equal' | 'insert' | 'delete';
  text: string;
};

const MAX_LCS_CELLS = 6_000_000;

export function buildInlineDiffParts(original: string, revised: string): InlineDiffPart[] {
  if (original === revised) return [{ type: 'equal', text: original }];
  if (!original) return revised ? [{ type: 'insert', text: revised }] : [];
  if (!revised) return [{ type: 'delete', text: original }];
  const a = Array.from(original);
  const b = Array.from(revised);
  if (a.length * b.length > MAX_LCS_CELLS) {
    return buildPrefixSuffixFallback(a, b);
  }

  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = new Uint32Array(rows * cols);
  const at = (i: number, j: number) => i * cols + j;

  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[at(i, j)] = a[i] === b[j]
        ? dp[at(i + 1, j + 1)] + 1
        : Math.max(dp[at(i + 1, j)], dp[at(i, j + 1)]);
    }
  }

  const parts: InlineDiffPart[] = [];
  let i = 0;
  let j = 0;
  const push = (type: InlineDiffPart['type'], text: string) => {
    if (!text) return;
    const last = parts[parts.length - 1];
    if (last?.type === type) last.text += text;
    else parts.push({ type, text });
  };

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push('equal', a[i]!);
      i++;
      j++;
    } else if (dp[at(i + 1, j)] >= dp[at(i, j + 1)]) {
      push('delete', a[i]!);
      i++;
    } else {
      push('insert', b[j]!);
      j++;
    }
  }
  while (i < a.length) push('delete', a[i++]!);
  while (j < b.length) push('insert', b[j++]!);
  return parts;
}

function buildPrefixSuffixFallback(a: string[], b: string[]): InlineDiffPart[] {
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) {
    prefix++;
  }

  let suffix = 0;
  while (
    suffix < a.length - prefix
    && suffix < b.length - prefix
    && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix++;
  }

  const parts: InlineDiffPart[] = [];
  const push = (type: InlineDiffPart['type'], chars: string[]) => {
    if (chars.length > 0) parts.push({ type, text: chars.join('') });
  };

  push('equal', a.slice(0, prefix));
  push('delete', a.slice(prefix, a.length - suffix));
  push('insert', b.slice(prefix, b.length - suffix));
  push('equal', a.slice(a.length - suffix));
  return parts;
}
