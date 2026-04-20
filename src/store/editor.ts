import { create } from 'zustand';

interface EditorState {
  currentFile: string | null;
  content: string;
  isDirty: boolean;
  saveStatus: 'saved' | 'saving' | 'error';
  openFiles: { path: string; name: string }[];
  setCurrentFile: (file: string | null) => void;
  setContent: (content: string) => void;
  setIsDirty: (dirty: boolean) => void;
  setSaveStatus: (status: 'saved' | 'saving' | 'error') => void;
  addOpenFile: (path: string) => void;
  removeOpenFile: (path: string) => void;
  updateFilePath: (oldPath: string, newPath: string) => void;
  reset: () => void;
}

const getFileName = (path: string) => {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1];
};

export const useEditorStore = create<EditorState>((set, get) => ({
  currentFile: null,
  content: '',
  isDirty: false,
  saveStatus: 'saved',
  openFiles: [],

  setCurrentFile: (file) => set({ currentFile: file }),

  setContent: (content) => set({ content, isDirty: true }),

  setIsDirty: (dirty) => set({ isDirty: dirty }),

  setSaveStatus: (status) => set({ saveStatus: status }),

  addOpenFile: (path: string) => {
    const state = get();
    const exists = state.openFiles.some((f) => f.path === path);
    if (!exists) {
      set({
        openFiles: [...state.openFiles, { path, name: getFileName(path) }],
        currentFile: path,
      });
    } else {
      set({ currentFile: path });
    }
  },

  updateFilePath: (oldPath: string, newPath: string) => {
    const state = get();
    const newOpenFiles = state.openFiles.map((f) =>
      f.path === oldPath ? { ...f, path: newPath, name: getFileName(newPath) } : f
    );
    set({
      openFiles: newOpenFiles,
      currentFile: newPath,
    });
  },

  removeOpenFile: (path: string) => {
    const state = get();
    const newOpenFiles = state.openFiles.filter((f) => f.path !== path);
    let newCurrentFile = state.currentFile;

    if (state.currentFile === path) {
      if (newOpenFiles.length > 0) {
        newCurrentFile = newOpenFiles[newOpenFiles.length - 1].path;
      } else {
        newCurrentFile = null;
      }
    }

    set({
      openFiles: newOpenFiles,
      currentFile: newCurrentFile,
    });
  },

  reset: () =>
    set({
      currentFile: null,
      content: '',
      isDirty: false,
      saveStatus: 'saved',
      openFiles: [],
    }),
}));
