import type { EditorSelection } from '../../types/editorCore';
import type { MarkdownFoldSection } from '../markdownAnalysisService';

export type AIRewriteScope = 'selection' | 'section' | 'document';

export type ResolvedAIRewriteScope = {
  scope: AIRewriteScope;
  label: string;
  from: number;
  to: number;
  lineFrom: number;
  lineTo: number;
  anchorText: string;
};

function lineAt(source: string, offset: number): number {
  return source.slice(0, Math.max(0, offset)).split('\n').length;
}

function resolveSelectionRange(source: string, selection: EditorSelection | null): { from: number; to: number } | null {
  if (!selection?.text.trim()) return null;
  if (source.slice(selection.from, selection.to) === selection.text) {
    return { from: selection.from, to: selection.to };
  }
  const from = source.indexOf(selection.text);
  if (from < 0 || source.indexOf(selection.text, from + selection.text.length) >= 0) return null;
  return { from, to: from + selection.text.length };
}

export function resolveAIRewriteScope(
  source: string,
  scope: AIRewriteScope,
  selection: EditorSelection | null,
  sections: readonly MarkdownFoldSection[],
  activeSectionIndex: number,
): ResolvedAIRewriteScope {
  const selectionRange = resolveSelectionRange(source, selection);
  let from = 0;
  let to = source.length;
  let label = '全文';

  if (scope === 'selection') {
    if (!selectionRange) throw new Error('请先选中正文中可唯一定位的文字；所见即所得模式里遇到重复文本，请扩大选区。');
    ({ from, to } = selectionRange);
    label = '选中文本';
  } else if (scope === 'section') {
    const section = selectionRange
      ? sections.find((item) => item.from <= selectionRange.from && item.to >= selectionRange.to)
      : sections[activeSectionIndex];
    if (sections.length > 0 && !section) throw new Error('请先把光标放到要修改的章节，或选中该章节中的文字。');
    if (section) {
      ({ from, to } = section);
      label = `当前章节「${section.title}」`;
    } else {
      label = '当前文档（无章节标题）';
    }
  }

  return {
    scope,
    label,
    from,
    to,
    lineFrom: lineAt(source, from),
    lineTo: lineAt(source, to),
    anchorText: source.slice(from, to),
  };
}

export function isHighImpactRewrite(requirement: string): boolean {
  // 仅按措辞做保守启发式判断；即使漏判，改稿仍停留在候选稿，必须由用户应用。
  return /((全文|整篇|整稿|文章|全部).{0,8}(重写|改写|重构|推翻|重来|重新写)|(重写|改写|重构|推翻|重来|重新写).{0,8}(全文|整篇|整稿|文章)|整体重写|推翻.{0,4}重来|合并.{0,8}(章|节)|删除.{0,8}(章|节)|(章|节).{0,8}(合并|删除|重组)|结构.{0,6}(重组|重构|重排)|重新组织.{0,6}全文|改变.{0,6}结论|推翻.{0,6}结论|rewrite.{0,12}(whole|entire)|merge.{0,12}sections?|delete.{0,12}sections?|restructure)/iu.test(requirement);
}
