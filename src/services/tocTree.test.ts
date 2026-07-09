import { describe, expect, it } from 'vitest';
import type { TocItem } from '../types/document';
import {
  buildTocTree,
  filterCollapsed,
  findAncestorChain,
} from './tocTree';

const h = (level: number, text: string, id = text): TocItem => ({ level, text, id });

const flatIndex = (nodes: ReturnType<typeof filterCollapsed>) => nodes.map((n) => n.flatIndex);

describe('buildTocTree', () => {
  it('returns an empty array for empty input', () => {
    expect(buildTocTree([])).toEqual([]);
  });

  it('keeps a single node as a root with no children', () => {
    const tree = buildTocTree([h(1, 'only')]);
    expect(tree).toHaveLength(1);
    expect(tree[0].item.text).toBe('only');
    expect(tree[0].children).toEqual([]);
    expect(tree[0].flatIndex).toBe(0);
  });

  it('nests a deeper heading under the most recent shallower ancestor', () => {
    // h1, h2, h3, h1, h2
    const tree = buildTocTree([h(1, 'a'), h(2, 'a.1'), h(3, 'a.1.1'), h(1, 'b'), h(2, 'b.1')]);
    expect(tree).toHaveLength(2);
    expect(tree[0].item.text).toBe('a');
    expect(tree[0].children.map((c) => c.item.text)).toEqual(['a.1']);
    expect(tree[0].children[0].children.map((c) => c.item.text)).toEqual(['a.1.1']);
    expect(tree[1].item.text).toBe('b');
    expect(tree[1].children.map((c) => c.item.text)).toEqual(['b.1']);
  });

  it('attaches a deep heading to the nearest shallower ancestor when levels jump', () => {
    // h1 → h3 (no h2): h3 still nests under h1, matching Word/VS Code behavior.
    const tree = buildTocTree([h(1, 'root'), h(3, 'leap')]);
    expect(tree).toHaveLength(1);
    expect(tree[0].children.map((c) => c.item.text)).toEqual(['leap']);
  });

  it('preserves flatIndex in document order', () => {
    const tree = buildTocTree([h(1, 'a'), h(2, 'b'), h(1, 'c')]);
    const walk = (nodes: ReturnType<typeof buildTocTree>): number[] => {
      const out: number[] = [];
      const visit = (ns: typeof nodes) => ns.forEach((n) => { out.push(n.flatIndex); visit(n.children); });
      visit(nodes);
      return out;
    };
    expect(walk(tree)).toEqual([0, 1, 2]);
  });
});

describe('findAncestorChain', () => {
  it('returns null when the target is not in the tree', () => {
    expect(findAncestorChain(buildTocTree([h(1, 'a')]), 99)).toBeNull();
  });

  it('returns just the root for a root node', () => {
    const tree = buildTocTree([h(1, 'a'), h(2, 'b')]);
    expect(findAncestorChain(tree, 0)).toEqual([0]);
  });

  it('returns the full root-to-leaf chain for a nested target', () => {
    const tree = buildTocTree([h(1, 'a'), h(2, 'a.1'), h(3, 'a.1.1')]);
    expect(findAncestorChain(tree, 2)).toEqual([0, 1, 2]);
  });

  it('returns just the second root for a node in a sibling subtree', () => {
    const tree = buildTocTree([h(1, 'a'), h(2, 'a.1'), h(1, 'b'), h(2, 'b.1')]);
    expect(findAncestorChain(tree, 3)).toEqual([2, 3]);
  });
});

describe('filterCollapsed', () => {
  it('passes through every node when nothing is collapsed', () => {
    const tree = buildTocTree([h(1, 'a'), h(2, 'a.1'), h(2, 'a.2'), h(1, 'b')]);
    expect(flatIndex(filterCollapsed(tree, new Set()))).toEqual([0, 1, 2, 3]);
  });

  it('keeps the collapsed root but omits all descendants', () => {
    const tree = buildTocTree([h(1, 'a'), h(2, 'a.1'), h(3, 'a.1.1'), h(1, 'b')]);
    expect(flatIndex(filterCollapsed(tree, new Set([0])))).toEqual([0, 3]);
  });

  it('collapses nested parents independently', () => {
    // Collapse a (index 0) and a.1 (index 1). a is still kept, a.1 is gone, a.1.1 too.
    const tree = buildTocTree([h(1, 'a'), h(2, 'a.1'), h(3, 'a.1.1'), h(1, 'b')]);
    expect(flatIndex(filterCollapsed(tree, new Set([0, 1])))).toEqual([0, 3]);
  });

  it('returns just the roots when top-level nodes are collapsed', () => {
    const tree = buildTocTree([h(1, 'a'), h(2, 'a.1'), h(1, 'b'), h(2, 'b.1')]);
    expect(flatIndex(filterCollapsed(tree, new Set([0, 2])))).toEqual([0, 2]);
  });

  it('returns an empty list for an empty tree', () => {
    expect(filterCollapsed([], new Set([0]))).toEqual([]);
  });
});
