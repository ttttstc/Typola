export type InlineDiffPart = {
  type: 'equal' | 'insert' | 'delete';
  text: string;
};

const MAX_LCS_CHARS = 2400;

export function buildInlineDiffParts(original: string, revised: string): InlineDiffPart[] {
  if (original === revised) return [{ type: 'equal', text: original }];
  if (!original) return revised ? [{ type: 'insert', text: revised }] : [];
  if (!revised) return [{ type: 'delete', text: original }];
  if (original.length * revised.length > MAX_LCS_CHARS * MAX_LCS_CHARS) {
    return [
      { type: 'delete', text: original },
      { type: 'insert', text: revised },
    ];
  }

  const a = Array.from(original);
  const b = Array.from(revised);
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = new Uint16Array(rows * cols);
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
