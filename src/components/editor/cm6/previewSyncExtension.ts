import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, ViewPlugin } from '@codemirror/view';
import { analyzeMarkdown } from '../../../services/markdownAnalysisService';

export type PreviewHeadingChange = {
  index: number;
  withinRatio: number;
};

type PreviewSyncOptions = {
  /** heading 变化回调(节流后) */
  onChange?: (change: PreviewHeadingChange) => void;
};

/** 在 doc 中收集所有 ATXHeading(#, ##, ...)的 [from, level] 列表。 */
function collectHeadings(state: EditorState): Array<{ from: number; level: number }> {
  return analyzeMarkdown(state.doc.toString()).headings.map(({ from, level }) => ({ from, level }));
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
  return ViewPlugin.fromClass(class {
    private rafId: number | null = null;

    update(update: { docChanged: boolean; viewportChanged: boolean; view: EditorView }) {
      if (!onChange || (!update.docChanged && !update.viewportChanged) || this.rafId !== null) return;
      this.rafId = window.requestAnimationFrame(() => {
        this.rafId = null;
        const headings = collectHeadings(update.view.state);
        onChange(headings.length === 0 ? { index: -1, withinRatio: 0 } : findHeadingAtScroll(update.view, headings));
      });
    }

    destroy() {
      if (this.rafId !== null) window.cancelAnimationFrame(this.rafId);
    }
  });
}

/** 暴露给外部:在某个 doc position 处做 heading 跳转(用于 TOC 点击等)。 */
export function headingIndexAt(state: EditorState, targetIndex: number): number | null {
  const headings = collectHeadings(state);
  if (targetIndex < 0 || targetIndex >= headings.length) return null;
  return headings[targetIndex].from;
}
