import { create } from 'zustand';

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileEntry[];
}

interface WorkspaceState {
  workspaceRoot: string | null;
  fileTree: FileEntry[];
  setWorkspaceRoot: (root: string | null) => void;
  setFileTree: (tree: FileEntry[]) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  workspaceRoot: null,
  fileTree: [],
  setWorkspaceRoot: (root) => set({ workspaceRoot: root }),
  setFileTree: (tree) => set({ fileTree: tree }),
}));
