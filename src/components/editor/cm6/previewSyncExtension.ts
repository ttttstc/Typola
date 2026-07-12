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

const SCROLL_THROTTLE_MS = 200;

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
 *  - doc 变化在当前更新完成后立即回调,视口滚动独立节流 200ms
 *  - docChanged 才刷新 heading 缓存,滚动只读取缓存
 *  - 把"当前可见 heading + 段内比例"通过 onChange 传出
 *  配合 PreviewScrollHandle.scrollToHeading 使用。 */
export function previewSyncExtension(options: PreviewSyncOptions = {}): Extension {
  const { onChange } = options;
  return ViewPlugin.fromClass(class {
    private rafId: number | null = null;
    private scrollTimerId: number | null = null;
    private headings: Array<{ from: number; level: number }> = [];
    private headingsKey: string | null = null;
    private destroyed = false;
    private readonly view: EditorView;

    constructor(view: EditorView) {
      this.view = view;
      this.refreshHeadings(view.state);
      view.scrollDOM.addEventListener('scroll', this.handleScroll, { passive: true });
    }

    private refreshHeadings(state: EditorState): void {
      const analysis = analyzeMarkdown(state.doc.toString());
      const nextKey = `${state.doc.length}:${analysis.sourceHash}`;
      if (nextKey === this.headingsKey) return;
      this.headingsKey = nextKey;
      this.headings = analysis.headings.map(({ from, level }) => ({ from, level }));
    }

    private emit(view: EditorView): void {
      if (!onChange) return;
      onChange(this.headings.length === 0
        ? { index: -1, withinRatio: 0 }
        : findHeadingAtScroll(view, this.headings));
    }

    private cancelScrollSchedule(): void {
      if (this.scrollTimerId !== null) {
        window.clearTimeout(this.scrollTimerId);
        this.scrollTimerId = null;
      }
      if (this.rafId !== null) {
        window.cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
    }

    private readonly handleScroll = () => {
      if (this.scrollTimerId !== null) return;
      this.scrollTimerId = window.setTimeout(() => {
        this.scrollTimerId = null;
        this.rafId = window.requestAnimationFrame(() => {
          this.rafId = null;
          if (!this.destroyed) this.emit(this.view);
        });
      }, SCROLL_THROTTLE_MS);
    };

    update(update: { docChanged: boolean; viewportChanged: boolean; view: EditorView }) {
      if (!onChange || (!update.docChanged && !update.viewportChanged)) return;
      if (update.docChanged) {
        this.cancelScrollSchedule();
        this.refreshHeadings(update.view.state);
        queueMicrotask(() => {
          if (!this.destroyed) this.emit(update.view);
        });
        return;
      }
      if (update.viewportChanged) this.handleScroll();
    }

    destroy() {
      this.destroyed = true;
      this.view.scrollDOM.removeEventListener('scroll', this.handleScroll);
      this.cancelScrollSchedule();
    }
  });
}

/** 暴露给外部:在某个 doc position 处做 heading 跳转(用于 TOC 点击等)。 */
export function headingIndexAt(state: EditorState, targetIndex: number): number | null {
  const headings = collectHeadings(state);
  if (targetIndex < 0 || targetIndex >= headings.length) return null;
  return headings[targetIndex].from;
}
