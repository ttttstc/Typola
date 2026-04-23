import { create } from 'zustand';

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileEntry[];
}

export interface WorkspaceRoot {
  path: string;
  name: string;
  fileTree: FileEntry[];
  expanded: boolean;
}

function isPathWithinRoot(targetPath: string, rootPath: string) {
  return (
    targetPath === rootPath ||
    targetPath.startsWith(`${rootPath}\\`) ||
    targetPath.startsWith(`${rootPath}/`)
  );
}

export function findContainingWorkspaceRoot(
  workspaceRoots: WorkspaceRoot[],
  targetPath: string | null
) {
  if (!targetPath) {
    return null;
  }

  let matchedRoot: WorkspaceRoot | null = null;

  for (const root of workspaceRoots) {
    if (!isPathWithinRoot(targetPath, root.path)) {
      continue;
    }

    if (!matchedRoot || root.path.length > matchedRoot.path.length) {
      matchedRoot = root;
    }
  }

  return matchedRoot;
}

interface WorkspaceState {
  workspaceRoots: WorkspaceRoot[];
  activeRootPath: string | null;
  /** Backwards-compatible alias for `activeRootPath`. */
  workspaceRoot: string | null;
  /** Backwards-compatible alias: tree of the active root (or empty). */
  fileTree: FileEntry[];

  addWorkspaceRoot: (path: string) => void;
  removeWorkspaceRoot: (path: string) => void;
  setActiveRoot: (path: string | null) => void;
  setRootFileTree: (path: string, tree: FileEntry[]) => void;
  toggleRootExpanded: (path: string) => void;

  /** Compatibility shim: when called with a single root, replaces all roots. */
  setWorkspaceRoot: (root: string | null) => void;
  /** Compatibility shim: updates the active root's file tree. */
  setFileTree: (tree: FileEntry[]) => void;
}

function basenameOf(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || p;
}

function syncCompatFields(roots: WorkspaceRoot[], activePath: string | null) {
  const active = roots.find((r) => r.path === activePath) ?? null;
  return {
    workspaceRoot: active ? active.path : null,
    fileTree: active ? active.fileTree : [],
  };
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaceRoots: [],
  activeRootPath: null,
  workspaceRoot: null,
  fileTree: [],

  addWorkspaceRoot: (path) => {
    const { workspaceRoots } = get();
    if (workspaceRoots.some((r) => r.path === path)) {
      // Already added — just activate it.
      set({ activeRootPath: path, ...syncCompatFields(workspaceRoots, path) });
      return;
    }
    const next = [
      ...workspaceRoots,
      { path, name: basenameOf(path), fileTree: [], expanded: true },
    ];
    set({ workspaceRoots: next, activeRootPath: path, ...syncCompatFields(next, path) });
  },

  removeWorkspaceRoot: (path) => {
    const { workspaceRoots, activeRootPath } = get();
    const next = workspaceRoots.filter((r) => r.path !== path);
    let nextActive = activeRootPath;
    if (activeRootPath === path) {
      nextActive = next.length > 0 ? next[0].path : null;
    }
    set({ workspaceRoots: next, activeRootPath: nextActive, ...syncCompatFields(next, nextActive) });
  },

  setActiveRoot: (path) => {
    const { workspaceRoots } = get();
    set({ activeRootPath: path, ...syncCompatFields(workspaceRoots, path) });
  },

  setRootFileTree: (path, tree) => {
    const { workspaceRoots, activeRootPath } = get();
    const next = workspaceRoots.map((r) => (r.path === path ? { ...r, fileTree: tree } : r));
    set({ workspaceRoots: next, ...syncCompatFields(next, activeRootPath) });
  },

  toggleRootExpanded: (path) => {
    const { workspaceRoots, activeRootPath } = get();
    const next = workspaceRoots.map((r) => (r.path === path ? { ...r, expanded: !r.expanded } : r));
    set({ workspaceRoots: next, ...syncCompatFields(next, activeRootPath) });
  },

  setWorkspaceRoot: (root) => {
    if (root === null) {
      set({ workspaceRoots: [], activeRootPath: null, workspaceRoot: null, fileTree: [] });
      return;
    }
    const { workspaceRoots } = get();
    if (workspaceRoots.some((r) => r.path === root)) {
      set({ activeRootPath: root, ...syncCompatFields(workspaceRoots, root) });
      return;
    }
    const next = [
      ...workspaceRoots,
      { path: root, name: basenameOf(root), fileTree: [], expanded: true },
    ];
    set({ workspaceRoots: next, activeRootPath: root, ...syncCompatFields(next, root) });
  },

  setFileTree: (tree) => {
    const { workspaceRoots, activeRootPath } = get();
    if (!activeRootPath) return;
    const next = workspaceRoots.map((r) => (r.path === activeRootPath ? { ...r, fileTree: tree } : r));
    set({ workspaceRoots: next, ...syncCompatFields(next, activeRootPath) });
  },
}));
