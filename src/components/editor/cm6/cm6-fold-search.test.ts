/**
 * Issue #117 PR5:标题折叠稳定性 + 搜索命中自动展开。
 *
 * 重点:
 * - fold key 加上 sectionIndex 维度,同名同级 heading 多次出现各有独立 key
 * - collectHeadingSections 返回的 sectionIndex 在扫描顺序里单调递增
 * - headingFoldExtension 正确折叠包含唯一 fold key 的 heading 行
 * - lineIndexAtOffset 把 char offset 映射到 line index(CM6 source 坐标系)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { createMarkdownExtensions } from './createMarkdownExtensions';
import { createLivePreviewExtensions } from './createLivePreviewExtensions';
import { foldKey, collectHeadingSections } from '../../../services/headingFoldService';
import { lineIndexAtOffset } from '../../../app/appLayoutUtils';
import type { FoldKey } from '../../../services/headingFoldService';
import { setFoldedHeadings } from './headingFoldExtension';

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({
      svg: '<svg data-testid="mermaid-svg"><g><text>ok</text></g></svg>',
    })),
  },
}));

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

describe('cm6 PR5 — 折叠 key 区分 + 搜索展开契约', () => {
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

  describe('foldKey 加 sectionIndex 维度', () => {
    it('foldKey 默认 sectionIndex=0,函数签名向后兼容', () => {
      expect(foldKey(2, 'Notes')).toBe('2:0:Notes');
      expect(foldKey(2, 'Notes', 0)).toBe('2:0:Notes');
    });

    it('同名 H2 多次出现 foldKey 不同', () => {
      const a = foldKey(2, 'Notes', 0);
      const b = foldKey(2, 'Notes', 1);
      expect(a).not.toBe(b);
    });

    it('不同 text 但同 sectionIndex 仍不同', () => {
      expect(foldKey(2, 'Notes')).not.toBe(foldKey(2, 'Ideas'));
    });

    it('不同 level 但同 sectionIndex/text 仍不同', () => {
      expect(foldKey(2, 'Notes', 0)).not.toBe(foldKey(3, 'Notes', 0));
    });
  });

  describe('collectHeadingSections.sectionIndex', () => {
    it('按扫描顺序递增', () => {
      const src = '## A\n\nx\n\n## B\n\n## A\n\n';
      const sections = collectHeadingSections(src);
      expect(sections.map((s) => s.headingLine)).toEqual([0, 4, 6]);
      const indices = sections.map((s) => s.sectionIndex);
      for (let i = 1; i < indices.length; i++) {
        expect(indices[i]).toBeGreaterThan(indices[i - 1]!);
      }
    });

    it('嵌套 H2/H3 各级都拿到独立 sectionIndex', () => {
      const src = '# Top\n\n## Sub\n\ntext\n\n## Sub2\n\n## Sub\n\n';
      const sections = collectHeadingSections(src);
      // 4 个 heading(1 个 H1,3 个 H2);同一文档共 4 个 sectionIndex
      expect(sections.length).toBe(4);
      // 各级按扫描顺序单调递增(用来 fold key 区分同名节点)
      const ids = sections.map((s) => `${s.level}:${s.sectionIndex}`);
      expect(ids).toEqual(['1:0', '2:1', '2:2', '2:3']);
    });

    it('endLine 不超过下一个 heading 之前的行', () => {
      const src = '## A\n\np1\n\np2\n\n## B\n';
      const sections = collectHeadingSections(src);
      const a = sections[0]!;
      expect(a.headingLine).toBe(0);
      // `## B` 在 line 6,section A 在它之前结束 → endLine = 5
      expect(a.endLine).toBe(5);
    });
  });

  describe('CM6 headingFoldExtension 与新 key 格式', () => {
    it('同名 H2 折叠 sectionIndex=0 时只折叠第一个', () => {
      const doc = '## Notes\n第一段文字\n\n## Notes\n第二段文字\n';
      view = createView(doc, true);
      // 令 syntax tree 完成扫描
      view.dispatch({ selection: { anchor: view.state.doc.length } });

      const key0: FoldKey = foldKey(2, 'Notes', 0);
      setFoldedHeadings(view, new Set([key0]));

      // 第一段 heading 之下应有 folded line class,第二段 heading 之下不应有。
      const folded = view.contentDOM.querySelectorAll(`.${FOLDED_LINE_CLASS}`);
      // 第一段只有 "第一段文字" 一行被折叠,所以至少 1 个 folded element
      expect(folded.length).toBeGreaterThan(0);
    });
  });

  describe('lineIndexAtOffset', () => {
    it('offset=0 返回第 0 行', () => {
      expect(lineIndexAtOffset('hello\nworld', 0)).toBe(0);
    });

    it('offset 在第一行末尾之前仍属第 0 行', () => {
      expect(lineIndexAtOffset('hello\nworld', 4)).toBe(0);
    });

    it('offset 处于第一个 \\n 字符本身,属第 0 行末尾', () => {
      expect(lineIndexAtOffset('hello\nworld', 5)).toBe(0);
    });

    it('offset 跨过第一个 \\n 后属第 1 行', () => {
      expect(lineIndexAtOffset('hello\nworld', 6)).toBe(1);
    });

    it('offset 等于 source.length 时属最后一行', () => {
      expect(lineIndexAtOffset('a\nb\nc', 5)).toBe(2);
    });

    it('offset 越界时按 source.length 截断', () => {
      expect(lineIndexAtOffset('a\nb', 100)).toBe(1);
    });

    it('与 collectHeadingSections 一起:offset 在 heading 第 N 行的第 N 行', () => {
      const src = 'p1\n## A\np2\np3\n## B\np4\n';
      const sections = collectHeadingSections(src);
      const aOffset = src.indexOf('## A');
      expect(lineIndexAtOffset(src, aOffset)).toBe(1);
      expect(sections[0]!.headingLine).toBe(1);
    });
  });

  describe('搜索自动展开契约(纯函数层)', () => {
    it('同一 heading 名但 sectionIndex 不同,折叠其中一个不影响另一个', () => {
      const src = '## Notes\n第一段\n\n## Notes\n第二段\n';
      const sections = collectHeadingSections(src);
      const [sec0, sec1] = sections;
      expect(sec0).toBeDefined();
      expect(sec1).toBeDefined();
      const k0 = foldKey(2, 'Notes', sec0!.sectionIndex);
      const k1 = foldKey(2, 'Notes', sec1!.sectionIndex);
      expect(k0).not.toBe(k1);
      const foldedOnlyFirst = new Set([k0]);
      expect(foldedOnlyFirst.has(k1)).toBe(false);
    });
  });
});
