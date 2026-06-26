// Task list 点击切换 — Vditor IR 已渲染 `<li class="vditor-task"><input type="checkbox">…</li>`,
// 只缺点击 handler 把 `[ ]` ↔ `[x]` 同步回 source。
//
// 复用原则:
// - 用 Vditor 自带的 li.vditor-task DOM(不需要写 markdown→HTML)
// - 通过 source-side 扫描构建 taskLineMap,DOM 顺序与数组索引 1:1 对应
// - 切换通过 editor.setValue 走 Vditor 自己的 input 通道,触发 onChange

export type TaskLineEntry = {
  lineIdx: number;
  text: string;
};

const TASK_LINE_RE = /^(\s*(?:[-*+]|\d+\.)\s)\[([ x])\](\s+)/;

// 从 source 提取所有 task list 行,保持 source 行顺序。
// 嵌套列表里的 task 也算(因为每条 `- [ ]` 仍然占独立 source 行)。
export function buildTaskLineMap(source: string): TaskLineEntry[] {
  const lines = source.split('\n');
  const out: TaskLineEntry[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (TASK_LINE_RE.test(lines[i])) {
      out.push({ lineIdx: i, text: lines[i] });
    }
  }
  return out;
}

// 把 .vditor-task 元素按 DOM 顺序排成数组;与 buildTaskLineMap 输出索引对齐。
export function collectTaskItems(ir: HTMLElement): HTMLElement[] {
  return Array.from(ir.querySelectorAll<HTMLElement>('.vditor-task'));
}

// 从 click event 中找最近 .vditor-task 的 DOM 索引(相对于 collectTaskItems 输出)。
// 接受 ir 参数避免在 handler 里二次爬根节点。
export function findClickedTaskIndex(event: { target: EventTarget | null }, ir: HTMLElement): number | null {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const li = target.closest('.vditor-task');
  if (!li) return null;
  const items = collectTaskItems(ir);
  const idx = items.indexOf(li as HTMLElement);
  return idx >= 0 ? idx : null;
}

// 切换 taskLineMap[idx] 对应 source 行的 `[ ]` ↔ `[x]`。
// 返回新 source 字符串;若匹配失败返回 null(调用方应放弃 setValue)。
export function toggleTaskLine(source: string, entry: TaskLineEntry): string | null {
  const lines = source.split('\n');
  const original = lines[entry.lineIdx];
  const replaced = original.replace(
    TASK_LINE_RE,
    (_match, prefix: string, marker: string, suffix: string) =>
      `${prefix}[${marker === 'x' ? ' ' : 'x'}]${suffix}`,
  );
  if (replaced === original) return null;
  lines[entry.lineIdx] = replaced;
  return lines.join('\n');
}
