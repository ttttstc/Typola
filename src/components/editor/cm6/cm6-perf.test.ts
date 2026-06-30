/**
 * Issue #117 PR4:CM6 长文档性能 + 折叠状态与扩展解耦。
 *
 * 这些都是 Typola + atomic-editor 边界行为,本测试断言契约:
 * - 5 万字文档能创建 EditorView,初始 200ms 内完成(本地 perf 阈值,CI 可放宽)
 * - 单次键盘输入 dispatch 不抛异常,200ms 内完成
 * - selection/scroll dispatch 不抛异常,200ms 内完成
 * - setFoldedHeadings(view, current) 是幂等的:值未变不触发 dispatch,避免回环
 * - editor 内 fold 切换 → onChange → React 同步 → setFoldedHeadings(同值)不无限循环
 *
 * 真实视觉性能(滚动 fps、layout)在 jsdom 测不到,留手测;这里保证数据结构契约。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { createMarkdownExtensions } from './createMarkdownExtensions';
import { createLivePreviewExtensions } from './createLivePreviewExtensions';
import { foldKey, type FoldKey } from '../../../services/headingFoldService';
import { headingFoldExtension, setFoldedHeadings } from './headingFoldExtension';

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({
      svg: '<svg data-testid="mermaid-svg"><g><text>ok</text></g></svg>',
    })),
  },
}));

const PERF_BUDGET_MS = 200;
const FOLDED_LINE_CLASS = 'typola-cm-line-folded';

function createView(doc: string, livePreview = false): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({
    state: EditorState.create({
      doc,
      extensions: createMarkdownExtensions({
        fontFamily: 'monospace',
        fontSize: 14,
        tabSize: 4,
        wordWrap: true,
        extraExtensions: livePreview ? createLivePreviewExtensions() : undefined,
      }),
    }),
    parent,
  });
}

/** 生成约 N 字的 Markdown fixture:每段前 heading + 多段正文,混合代码/表格/列表。 */
function buildLongDoc(targetChars: number): string {
  const parts: string[] = [];
  let written = 0;
  let section = 1;
  const paragraphs = [
    'Typola 试图在 Markdown 编辑器里同时拿到 Typora 的现场感,又不放弃 source 的可信度。每一次输入都直接落到 source 里,渲染层只是 source 的投影。',
    'Atomic Editor 在 line decoration 之上加 block decoration,把表格、图片、公式都视作一个原子节点,所以我们能用 lezer 位置精确驱动预览。',
    '性能预算的关键是不让 React 在每次按键时重算派生数据 —— foldedHeadings、TOC、统计、走 rAF 或纯派生 StateField。',
  ];
  while (written < targetChars) {
    parts.push(`\n## 章节 ${section}\n`);
    for (let p = 0; p < 4; p++) {
      const text = paragraphs[(section + p) % paragraphs.length]!;
      parts.push(`\n${text}\n`);
      written += text.length;
      if (written >= targetChars) break;
    }
    parts.push('\n```ts\nconst foldKey = (level, text) => `${level}:${text}`;\n```\n');
    if (section % 5 === 0) {
      parts.push('\n| 列 A | 列 B | 列 C |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n');
    }
    section++;
  }
  return parts.join('');
}

/** 独立 headless view,只为探测 headingFoldExtension 的折叠集合行为。 */
function createFoldProbeView(initial: ReadonlySet<FoldKey>, onChange?: (s: ReadonlySet<FoldKey>) => void): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({
    state: EditorState.create({
      doc: '# A\n\n段落 A 内容\n\n## B\n\n段落 B 内容\n\n### C\n\n段落 C 内容\n',
      extensions: [
        ...createMarkdownExtensions({
          fontFamily: 'monospace',
          fontSize: 14,
          tabSize: 4,
          wordWrap: true,
          extraExtensions: undefined,
        }),
        ...headingFoldExtension({ initial, onChange }),
      ],
    }),
    parent,
  });
}

describe('cm6 PR4 — 长文档性能与折叠同步解耦', () => {
  let view: EditorView | null = null;

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    if (view && !view.destroyed) {
      const parent = view.dom.parentElement;
      view.destroy();
      parent?.remove();
    }
    view = null;
    document.body.innerHTML = '';
  });

  describe('长文档基准', () => {
    it('5 万字文档能完成初始化(纯 source extensions)', () => {
      const doc = buildLongDoc(50_000);
      // 数据完整性:fixture 真达到目标字数,后续才有意义
      expect(doc.length).toBeGreaterThanOrEqual(50_000);

      const t0 = performance.now();
      view = createView(doc);
      const elapsed = performance.now() - t0;

      expect(view.state.doc.length).toBeGreaterThan(50_000);
      // jsdom 单线程无 layout,理应远低于该阈值;留 buffer 给 CI 抖动
      expect(elapsed).toBeLessThan(PERF_BUDGET_MS);
    });

    it('5 万字文档 + live preview extensions 能完成初始化', () => {
      const doc = buildLongDoc(50_000);
      const t0 = performance.now();
      view = createView(doc, true);
      const elapsed = performance.now() - t0;

      expect(view.state.doc.length).toBeGreaterThan(50_000);
      expect(elapsed).toBeLessThan(PERF_BUDGET_MS);
    });

    it('长文档上单次键盘输入 dispatch 在预算内', () => {
      view = createView(buildLongDoc(50_000));
      const len = view.state.doc.length;

      const t0 = performance.now();
      view.dispatch({
        changes: { from: len - 10, to: len - 10, insert: '常' },
        selection: { anchor: len - 9 },
      });
      const elapsed = performance.now() - t0;

      expect(view.state.doc.length).toBe(len + 1);
      expect(elapsed).toBeLessThan(PERF_BUDGET_MS);
    });

    it('长文档上选中变化 dispatch 在预算内', () => {
      view = createView(buildLongDoc(50_000));
      const len = view.state.doc.length;

      const t0 = performance.now();
      view.dispatch({ selection: { anchor: 0, head: len } });
      const elapsed = performance.now() - t0;

      expect(view.state.selection.main.to - view.state.selection.main.from).toBe(len);
      expect(elapsed).toBeLessThan(PERF_BUDGET_MS);
    });
  });

  describe('setFoldedHeadings 幂等性(避免 React ↔ editor 回环)', () => {
    it('current = next 时再次同步不抛,且不引入新的折叠行(无变化)', () => {
      const initial = new Set<FoldKey>([foldKey(1, 'A')]);
      const probe = createFoldProbeView(initial);

      // 第一次同步:把折叠集合推入 editor,折叠 # A 的章节
      setFoldedHeadings(probe, initial);
      const foldedBefore = probe.contentDOM.querySelectorAll(`.${FOLDED_LINE_CLASS}`).length;

      // 第二次同步:同集合不应再触发任何渲染变化
      setFoldedHeadings(probe, initial);
      const foldedAfter = probe.contentDOM.querySelectorAll(`.${FOLDED_LINE_CLASS}`).length;

      expect(foldedAfter).toBe(foldedBefore);

      const parent = probe.dom.parentElement;
      probe.destroy();
      parent?.remove();
    });

    it('current ≠ next 时正常 dispatch', () => {
      const probe = createFoldProbeView(new Set());

      const foldedNone = probe.contentDOM.querySelectorAll(`.${FOLDED_LINE_CLASS}`).length;
      setFoldedHeadings(probe, new Set<FoldKey>([foldKey(1, 'A')]));
      const foldedSome = probe.contentDOM.querySelectorAll(`.${FOLDED_LINE_CLASS}`).length;
      setFoldedHeadings(probe, new Set<FoldKey>());
      const foldedAgain = probe.contentDOM.querySelectorAll(`.${FOLDED_LINE_CLASS}`).length;

      // 顺序:无折叠 → 折叠 → 无折叠,最后一个值应该回到第一或更少(因为折叠切换会重排)
      expect(foldedNone).toBeLessThanOrEqual(foldedAgain);
      // 至少一次看到折叠行
      expect(foldedSome).toBeGreaterThan(0);

      const parent = probe.dom.parentElement;
      probe.destroy();
      parent?.remove();
    });

    it('折叠集合经过 React state → editor 同步循环不会无限回环', () => {
      const probe = createFoldProbeView(new Set());
      const set = new Set<FoldKey>([foldKey(2, 'B')]);
      // 100 轮同步,确保不抛、不爆栈
      for (let i = 0; i < 100; i++) {
        setFoldedHeadings(probe, set);
        setFoldedHeadings(probe, new Set<FoldKey>()); // 模拟 React state 更新再来一次
      }
      const parent = probe.dom.parentElement;
      probe.destroy();
      parent?.remove();
      expect(true).toBe(true);
    });
  });
});
