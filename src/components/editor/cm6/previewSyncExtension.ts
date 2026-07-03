import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

export type PreviewHeadingChange = {
  index: number;
  withinRatio: number;
};

type PreviewSyncOptions = {
  /** heading 变化回调(节流后) */
  onChange?: (change: PreviewHeadingChange) => void;
};

const SYNTAX_TREE_BUDGET_MS = 50;

/** 在 doc 中收集所有 ATXHeading(#, ##, ...)的 [from, level] 列表。 */
function collectHeadings(state: EditorState): Array<{ from: number; level: number }> {
  const headings: Array<{ from: number; level: number }> = [];
  const tree = ensureSyntaxTree(state, state.doc.length, SYNTAX_TREE_BUDGET_MS);
  if (!tree) return headings;
  const cursor = tree.cursor();
  do {
    const name = cursor.type.name;
    // lezer markdown 节点名:ATXHeading1..ATXHeading6
    if (name.startsWith('ATXHeading')) {
      const level = Number(name.slice('ATXHeading'.length));
      if (level >= 1 && level <= 6) {
        headings.push({ from: cursor.from, level });
      }
    }
  } while (cursor.next());
  return headings;
}

/** 给定 scrollTop 像素位置,找当前可见 heading + 段内比例(0..1)。
 *  使用像素位置:heading CSS margin 与编辑器 line padding 在 100% 缩放下一致时,
 *  用 lineBlock 的 .top 坐标计算 withinRatio 最直观、跟预览 heading DOM 也对得上。 */
function findHeadingAtScroll(
  view: EditorView,
  headings: Array<{ from: number; level: number }>,
): PreviewHeadingChange {
  if (headings.length === 0) return { index: -1, withinRatio: 0 };
  const scrollTop = view.scrollDOM.scrollTop;
  const viewportTop = scrollTop;

  // 用 lineBlockAtHeight 找到视口顶部的行块
  const topBlock = view.lineBlockAtHeight(viewportTop);
  const topPos = topBlock.from;

  // 二分找:最大的 heading.from <= topPos
  let lo = 0;
  let hi = headings.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (headings[mid].from <= topPos) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (idx < 0) return { index: -1, withinRatio: 0 };

  // 计算 withinRatio:基于像素位置在 [heading, nextHeading) 区间内
  const headingBlock = view.lineBlockAt(headings[idx].from);
  const nextFrom = idx + 1 < headings.length ? headings[idx + 1].from : null;
  const nextBlock = nextFrom !== null ? view.lineBlockAt(nextFrom) : null;

  const sectionStart = headingBlock.top;
  const sectionEnd = nextBlock ? nextBlock.top : Math.max(sectionStart + 1, view.scrollDOM.scrollHeight);
  const sectionHeight = Math.max(1, sectionEnd - sectionStart);
  const within = (topBlock.top - sectionStart) / sectionHeight;
  return { index: idx, withinRatio: Math.max(0, Math.min(1, within)) };
}

/** CM6 → 预览 heading 同步扩展。
 *  - 监听 doc 变化和视口滚动,节流 80ms
 *  - 用 lezer syntax tree 收集 ATXHeading 节点,纯文本编辑后位置不漂移
 *  - 把"当前可见 heading + 段内比例"通过 onChange 传出
 *  配合 PreviewScrollHandle.scrollToHeading 使用。 */
export function previewSyncExtension(options: PreviewSyncOptions = {}): Extension {
  const { onChange } = options;
  return EditorView.updateListener.of((update) => {
    if (!onChange) return;
    // 只在 doc 变化(positions 重算)或视口滚动时计算
    const isDocChange = update.docChanged;
    const isScroll = update.viewportChanged;
    if (!isDocChange && !isScroll) return;

    const rafId: number | undefined = (previewSyncExtension as unknown as { _rafId?: number })._rafId;
    if (rafId !== undefined) return;
    (previewSyncExtension as unknown as { _rafId?: number })._rafId = window.requestAnimationFrame(() => {
      (previewSyncExtension as unknown as { _rafId?: number })._rafId = undefined;
      const view = update.view;
      const headings = collectHeadings(view.state);
      if (headings.length === 0) {
        onChange({ index: -1, withinRatio: 0 });
        return;
      }
      onChange(findHeadingAtScroll(view, headings));
    });
  });
}

/** 暴露给外部:在某个 doc position 处做 heading 跳转(用于 TOC 点击等)。 */
export function headingIndexAt(state: EditorState, targetIndex: number): number | null {
  const headings = collectHeadings(state);
  if (targetIndex < 0 || targetIndex >= headings.length) return null;
  return headings[targetIndex].from;
}
