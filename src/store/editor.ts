import { create } from 'zustand';

export interface OpenFile {
  path: string;
  name: string;
  isDirty: boolean;
  isDraft: boolean;
}

interface EditorState {
  currentFile: string | null;
  content: string;
  isDirty: boolean;
  saveStatus: 'saved' | 'saving' | 'error';
  openFiles: OpenFile[];
  setCurrentFile: (file: string | null) => void;
  setContent: (content: string) => void;
  setLoadedContent: (content: string) => void;
  setIsDirty: (dirty: boolean) => void;
  setSaveStatus: (status: 'saved' | 'saving' | 'error') => void;
  addOpenFile: (path: string, options?: { isDraft?: boolean }) => void;
  removeOpenFile: (path: string) => void;
  updateFilePath: (oldPath: string, newPath: string) => void;
  isDraftFile: (path: string | null) => boolean;
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

  // For user editing - marks file as dirty
  setContent: (content) => {
    const state = get();
    const newIsDirty = true;

    let newOpenFiles = state.openFiles;
    if (state.currentFile) {
      newOpenFiles = state.openFiles.map((f) =>
        f.path === state.currentFile ? { ...f, isDirty: true } : f
      );
    }

    set({
      content,
      isDirty: newIsDirty,
      openFiles: newOpenFiles,
    });
  },

  // For loading content from disk - does NOT mark as dirty
  setLoadedContent: (content) => {
    const state = get();
    let newOpenFiles = state.openFiles;
    if (state.currentFile) {
      newOpenFiles = state.openFiles.map((f) =>
        f.path === state.currentFile ? { ...f, isDirty: false } : f
      );
    }

    set({
      content,
      isDirty: false,
      openFiles: newOpenFiles,
    });
  },

  setIsDirty: (dirty) => {
    const state = get();
    let newOpenFiles = state.openFiles;

    if (state.currentFile) {
      newOpenFiles = state.openFiles.map((f) =>
        f.path === state.currentFile ? { ...f, isDirty: dirty } : f
      );
    }

    set({
      isDirty: dirty,
      openFiles: newOpenFiles,
    });
  },

  setSaveStatus: (status) => set({ saveStatus: status }),

  addOpenFile: (path: string, options) => {
    const state = get();
    const existingFile = state.openFiles.find((f) => f.path === path);
    if (!existingFile) {
      set({
        openFiles: [
          ...state.openFiles,
          { path, name: getFileName(path), isDirty: false, isDraft: options?.isDraft ?? false },
        ],
        currentFile: path,
      });
    } else {
      const nextOpenFiles =
        options?.isDraft && !existingFile.isDraft
          ? state.openFiles.map((file) =>
              file.path === path ? { ...file, isDraft: true } : file
            )
          : state.openFiles;
      set({ openFiles: nextOpenFiles, currentFile: path });
    }
  },

  updateFilePath: (oldPath: string, newPath: string) => {
    const state = get();
    const newOpenFiles = state.openFiles.map((f) =>
      f.path === oldPath
        ? { ...f, path: newPath, name: getFileName(newPath), isDirty: false, isDraft: false }
        : f
    );
    set({
      openFiles: newOpenFiles,
      currentFile: newPath,
    });
  },

  isDraftFile: (path: string | null) =>
    path !== null && get().openFiles.some((file) => file.path === path && file.isDraft),

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
