// CM6 任务清单切换 + 链接打开交互。
//
// 设计要点:
// - 复用 MarkdownAnalysisResult.tasks / .links,避开重复正则和 fenced-code 漏判。
// - toggleTaskAt:从 EditorView contentDOM 上的 task checkbox 节点反查 doc offset,
//   只替换 [ ] ↔ [x],保持行内其余文本不变,CM6 history 自动栈 → 一次 undo 即可回退。
// - openLinkAt:捕获 Ctrl/Cmd+click,同时支持 atomic-editor 的 span link/image
//   widget 与传统 a 节点;atomic widget 已隐藏 Markdown 源,普通点击也走外链回调。
// - 通过 onTaskToggle / onOpenLink 回调把副作用交给 EditorPane(用 React 注入的 hook),
//   保持扩展纯 CM6、不绑 React 状态。

import { Transaction, type Extension } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { EditorView, ViewPlugin } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import {
  analyzeMarkdown,
  findMarkdownLinkAt,
  findMarkdownTaskAt,
  type MarkdownLink,
  type MarkdownTask,
} from '../../../services/markdownAnalysisService';

export const TASK_TOGGLE_CLASS = 'typola-cm-task-checkbox';
export const LINK_OPEN_CLASS = 'typola-cm-link';

export function findTaskForClick(view: EditorView, source: string, offset: number): MarkdownTask | null {
  const direct = findMarkdownTaskAt(source, offset);
  if (direct) return direct;
  const line = view.state.doc.lineAt(offset);
  return findMarkdownTaskAt(source, line.from);
}

export function toggleTaskSource(source: string, task: MarkdownTask): string {
  const nextMarker = task.checked ? ' ' : 'x';
  return source.slice(task.from, task.to).replace(/\[([ xX])\]/u, `[${nextMarker}]`);
}

function nearestEditorOffset(view: EditorView, event: MouseEvent): number | null {
  const target = event.target;
  if (!(target instanceof Node)) return null;
  const dom = view.contentDOM;
  if (!dom.contains(target)) return null;
  const range = document.createRange();
  try {
    range.selectNode(target);
    const rect = range.getBoundingClientRect();
    const probe = view.posAtCoords({ x: rect.left + 1, y: rect.top + Math.min(rect.height, 4) });
    if (probe !== null) return probe;
  } catch {
    // Fall back to the DOM position for synthetic/widget nodes.
  }
  try {
    const position = view.posAtDOM(target);
    return position >= 0 ? position : null;
  } catch {
    return null;
  }
}

function markdownLinkFromNode(view: EditorView, node: SyntaxNode): MarkdownLink | null {
  const source = view.state.doc.toString();
  if (node.name !== 'Link') return null;
  const urlNode = node.getChild('URL');
  if (!urlNode) return null;
  const label = source.slice(node.from + 1, Math.max(node.from + 1, urlNode.from - 2));
  return {
    from: node.from,
    to: node.to,
    lineFrom: view.state.doc.lineAt(node.from).number,
    lineTo: view.state.doc.lineAt(node.to).number,
    label,
    url: source.slice(urlNode.from, urlNode.to),
  };
}

function findSyntaxLinkAt(view: EditorView, offset: number): MarkdownLink | null {
  let node = syntaxTree(view.state).resolveInner(offset, 1);
  while (node.name !== 'Link' && node.parent) node = node.parent;
  return markdownLinkFromNode(view, node);
}

function findOnlySyntaxLink(view: EditorView): MarkdownLink | null {
  let link: MarkdownLink | null = null;
  let count = 0;
  const tree = syntaxTree(view.state);
  tree.iterate({
    enter: (node) => {
      if (node.name !== 'Link') return;
      count += 1;
      let resolved = tree.resolve(node.from, 1);
      while (resolved.name !== 'Link' && resolved.parent) resolved = resolved.parent;
      link = markdownLinkFromNode(view, resolved);
    },
  });
  return count === 1 ? link : null;
}

export function findLinkAtSelection(view: EditorView): MarkdownLink | null {
  const sel = view.state.selection.main;
  const source = view.state.doc.toString();
  if (!sel.empty) {
    const text = view.state.doc.sliceString(sel.from, sel.to);
    const match = text.match(/^\[([^\]]+)\]\(([^)]+)\)$/u);
    if (match) {
      const hit = analyzeMarkdown(source).links.find((link) => link.from === sel.from && link.to === sel.to);
      if (hit) return hit;
    }
  }
  return findMarkdownLinkAt(source, sel.from);
}

export function rewriteLinkAtSelection(
  view: EditorView,
  options: {
    getUrl?: (current: MarkdownLink) => string | null;
    getLink?: (current: MarkdownLink) => Pick<MarkdownLink, 'label' | 'url' | 'title'> | null;
  },
): boolean {
  const link = findLinkAtSelection(view);
  if (!link) return false;
  const next = options.getLink?.(link) ?? (() => {
    const url = options.getUrl?.(link);
    return url === null || url === undefined ? null : { label: link.label, url, title: link.title };
  })();
  if (!next) return false;
  const label = next.label || next.url;
  const title = next.title ? ` "${next.title}"` : '';
  const replacement = `[${label}](${next.url}${title})`;
  view.dispatch({
    changes: { from: link.from, to: link.to, insert: replacement },
    selection: { anchor: link.from + replacement.length },
    annotations: Transaction.userEvent.of('link.edit'),
  });
  return true;
}

type TaskToggleOptions = {
  onToggle?: (task: MarkdownTask, nextChecked: boolean) => void;
};

export function taskToggleExtension(options: TaskToggleOptions = {}): Extension[] {
  const { onToggle } = options;
  return [
    EditorView.domEventHandlers({
      click(event: MouseEvent, view) {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const checkbox = target.closest(`input.${TASK_TOGGLE_CLASS}, .${TASK_TOGGLE_CLASS} input[type="checkbox"]`);
        if (!checkbox) return;
        const offset = nearestEditorOffset(view, event);
        if (offset === null) return;
        const task = findTaskForClick(view, view.state.doc.toString(), offset);
        if (!task) return;
        event.preventDefault();
        const nextText = toggleTaskSource(view.state.doc.toString(), task);
        view.dispatch({
          changes: { from: task.from, to: task.to, insert: nextText },
          selection: { anchor: task.from + nextText.length },
          annotations: Transaction.userEvent.of('task.toggle'),
        });
        onToggle?.(task, !task.checked);
      },
    }),
  ];
}

type LinkOpenOptions = {
  onOpenLink?: (link: MarkdownLink) => void;
};

export function linkOpenExtension(options: LinkOpenOptions = {}): Extension[] {
  const { onOpenLink } = options;
  return [
    ViewPlugin.fromClass(class {
      private readonly view: EditorView;
      private readonly onClick: (event: MouseEvent) => void;

      constructor(view: EditorView) {
        this.view = view;
        this.onClick = (event) => {
          const target = event.target;
          if (!(target instanceof Element)) return;
          const linkWidget = target.closest('a, .cm-atomic-link, .cm-atomic-image');
          if (!linkWidget) return;
          const atomicWidget = target.closest('.cm-atomic-link, .cm-atomic-image');
          if (!atomicWidget && !event.metaKey && !event.ctrlKey) return;
          const offset = nearestEditorOffset(this.view, event);
          const link = (offset === null ? null : findSyntaxLinkAt(this.view, offset))
            ?? findOnlySyntaxLink(this.view)
            ?? (offset === null ? null : findMarkdownLinkAt(this.view.state.doc.toString(), offset));
          if (!link) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          onOpenLink?.(link);
        };
        view.dom.addEventListener('click', this.onClick, true);
      }

      destroy() {
        this.view.dom.removeEventListener('click', this.onClick, true);
      }
    }),
  ];
}
