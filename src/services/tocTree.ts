import type { TocItem } from '../types/document';

/**
 * A single node in the toc tree, mirroring the flat TocItem it was built from.
 * `flatIndex` is the position of `item` in the original flat array, kept so
 * callers can map back to `useTocState`'s `activeTocIndex` / `onNavigate`
 * signatures without re-deriving it.
 */
export interface TocNode {
  item: TocItem;
  flatIndex: number;
  children: TocNode[];
}

type StackEntry = { node: TocNode; level: number };

/**
 * Convert a flat `TocItem[]` (in document order) into a tree. Each item becomes
 * a node whose parent is the nearest preceding item with a strictly smaller
 * `level`. Items whose level jumps upward (e.g. h1 → h3 with no h2) are still
 * attached to the nearest preceding shallower heading — Markdown outline
 * renderers (VS Code, Word, Typora) all behave this way.
 *
 * Stable for the empty array: returns `[]`.
 */
export function buildTocTree(items: TocItem[]): TocNode[] {
  const roots: TocNode[] = [];
  // Stack invariant: levels are strictly increasing from bottom to top; the
  // topmost entry is the deepest currently-open parent. Pop entries whose
  // level is >= the new item's level so the new item finds its real parent.
  const stack: StackEntry[] = [];

  items.forEach((item, flatIndex) => {
    const node: TocNode = { item, flatIndex, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
      stack.pop();
    }
    if (stack.length === 0) {
      roots.push(node);
    } else {
      stack[stack.length - 1].node.children.push(node);
    }
    stack.push({ node, level: item.level });
  });

  return roots;
}

/**
 * Walk the tree and return the chain of `flatIndex` values from the root
 * ancestor down to the node whose `flatIndex === target`. The first element
 * is the rootmost ancestor; the last element is `target` itself. Returns
 * `null` when no node matches — caller can treat that as a no-op.
 */
export function findAncestorChain(
  tree: TocNode[],
  target: number,
): number[] | null {
  const path: number[] = [];
  const dfs = (nodes: TocNode[]): boolean => {
    for (const node of nodes) {
      path.push(node.flatIndex);
      if (node.flatIndex === target) return true;
      if (dfs(node.children)) return true;
      path.pop();
    }
    return false;
  };
  return dfs(tree) ? path : null;
}

/**
 * Project the tree to a flat list of `{ item, flatIndex }` entries, omitting
 * any node whose ancestor chain intersects `collapsed` (a set of `flatIndex`
 * values treated as collapsed-subtree-roots). The collapsed root itself is
 * kept so the user can re-expand it; only its descendants are skipped.
 *
 * `collapsed` keys are `flatIndex` values, not `TocItem.id` — that way
 * re-extracting the toc from the same source produces the same keys, and we
 * don't depend on heading text being unique.
 */
export function filterCollapsed(
  tree: TocNode[],
  collapsed: ReadonlySet<number>,
): { item: TocItem; flatIndex: number }[] {
  const out: { item: TocItem; flatIndex: number }[] = [];
  const visit = (nodes: TocNode[], ancestorCollapsed: boolean): void => {
    for (const node of nodes) {
      if (ancestorCollapsed) continue;
      out.push({ item: node.item, flatIndex: node.flatIndex });
      if (!collapsed.has(node.flatIndex)) {
        visit(node.children, false);
      }
    }
  };
  visit(tree, false);
  return out;
}
