import { create } from 'zustand';

export interface OpenFile {
  path: string;
  name: string;
  content: string;
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
  setLoadedContent: (content: string, filePath?: string) => void;
  setIsDirty: (dirty: boolean, filePath?: string) => void;
  setSaveStatus: (status: 'saved' | 'saving' | 'error') => void;
  addOpenFile: (path: string, options?: { isDraft?: boolean }) => void;
  removeOpenFile: (path: string) => void;
  updateFilePath: (oldPath: string, newPath: string) => void;
  replacePathPrefix: (oldPath: string, newPath: string) => void;
  isDraftFile: (path: string | null) => boolean;
  reset: () => void;
}

const getFileName = (path: string) => {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1];
};

const remapPath = (path: string, oldPrefix: string, newPrefix: string) => {
  if (path === oldPrefix) {
    return newPrefix;
  }

  if (path.startsWith(`${oldPrefix}\\`) || path.startsWith(`${oldPrefix}/`)) {
    return `${newPrefix}${path.slice(oldPrefix.length)}`;
  }

  return path;
};

const getOpenFileState = (openFiles: OpenFile[], path: string | null) => {
  if (!path) {
    return {
      content: '',
      isDirty: false,
    };
  }

  const openFile = openFiles.find((file) => file.path === path);
  return {
    content: openFile?.content ?? '',
    isDirty: openFile?.isDirty ?? false,
  };
};

export const useEditorStore = create<EditorState>((set, get) => ({
  currentFile: null,
  content: '',
  isDirty: false,
  saveStatus: 'saved',
  openFiles: [],

  setCurrentFile: (file) =>
    set((state) => {
      const nextActive = getOpenFileState(state.openFiles, file);
      return {
        currentFile: file,
        content: nextActive.content,
        isDirty: nextActive.isDirty,
        saveStatus: 'saved',
      };
    }),

  setContent: (content) => {
    const state = get();
    const nextOpenFiles = state.currentFile
      ? state.openFiles.map((file) =>
          file.path === state.currentFile ? { ...file, content, isDirty: true } : file
        )
      : state.openFiles;

    set({
      content,
      isDirty: true,
      saveStatus: 'saved',
      openFiles: nextOpenFiles,
    });
  },

  setLoadedContent: (content, filePath) => {
    const state = get();
    const targetPath = filePath ?? state.currentFile;
    const nextOpenFiles = targetPath
      ? state.openFiles.map((file) =>
          file.path === targetPath ? { ...file, content, isDirty: false } : file
        )
      : state.openFiles;
    const isActiveFile = targetPath === state.currentFile;

    set({
      content: isActiveFile ? content : state.content,
      isDirty: isActiveFile ? false : state.isDirty,
      openFiles: nextOpenFiles,
    });
  },

  setIsDirty: (dirty, filePath) => {
    const state = get();
    const targetPath = filePath ?? state.currentFile;
    const nextOpenFiles = targetPath
      ? state.openFiles.map((file) =>
          file.path === targetPath ? { ...file, isDirty: dirty } : file
        )
      : state.openFiles;
    const isActiveFile = targetPath === state.currentFile;

    set({
      isDirty: isActiveFile ? dirty : state.isDirty,
      openFiles: nextOpenFiles,
    });
  },

  setSaveStatus: (status) => set({ saveStatus: status }),

  addOpenFile: (path: string, options) => {
    const state = get();
    const existingFile = state.openFiles.find((file) => file.path === path);

    if (!existingFile) {
      set({
        openFiles: [
          ...state.openFiles,
          {
            path,
            name: getFileName(path),
            content: '',
            isDirty: false,
            isDraft: options?.isDraft ?? false,
          },
        ],
        currentFile: path,
        content: '',
        isDirty: false,
        saveStatus: 'saved',
      });
      return;
    }

    const nextOpenFiles =
      options?.isDraft && !existingFile.isDraft
        ? state.openFiles.map((file) =>
            file.path === path ? { ...file, isDraft: true } : file
          )
        : state.openFiles;

    set({
      openFiles: nextOpenFiles,
      currentFile: path,
      content: existingFile.content,
      isDirty: existingFile.isDirty,
      saveStatus: 'saved',
    });
  },

  updateFilePath: (oldPath: string, newPath: string) => {
    const state = get();
    const nextOpenFiles = state.openFiles.map((file) =>
      file.path === oldPath
        ? {
            ...file,
            path: newPath,
            name: getFileName(newPath),
            isDirty: false,
            isDraft: false,
          }
        : file
    );
    const nextCurrentFile = state.currentFile === oldPath ? newPath : state.currentFile;
    const nextActive = getOpenFileState(nextOpenFiles, nextCurrentFile);
    const activeFileChanged = nextCurrentFile !== state.currentFile;

    set({
      openFiles: nextOpenFiles,
      currentFile: nextCurrentFile,
      content: activeFileChanged ? nextActive.content : state.content,
      isDirty: activeFileChanged ? nextActive.isDirty : state.isDirty,
      saveStatus: activeFileChanged ? 'saved' : state.saveStatus,
    });
  },

  replacePathPrefix: (oldPath: string, newPath: string) => {
    const state = get();
    const nextOpenFiles = state.openFiles.map((file) => {
      const remappedPath = remapPath(file.path, oldPath, newPath);
      return remappedPath === file.path
        ? file
        : {
            ...file,
            path: remappedPath,
            name: getFileName(remappedPath),
          };
    });
    const nextCurrentFile = state.currentFile ? remapPath(state.currentFile, oldPath, newPath) : null;
    const nextActive = getOpenFileState(nextOpenFiles, nextCurrentFile);

    set({
      openFiles: nextOpenFiles,
      currentFile: nextCurrentFile,
      content: nextCurrentFile === state.currentFile ? state.content : nextActive.content,
      isDirty: nextCurrentFile === state.currentFile ? state.isDirty : nextActive.isDirty,
      saveStatus: 'saved',
    });
  },

  isDraftFile: (path: string | null) =>
    path !== null && get().openFiles.some((file) => file.path === path && file.isDraft),

  removeOpenFile: (path: string) => {
    const state = get();
    const nextOpenFiles = state.openFiles.filter((file) => file.path !== path);
    let nextCurrentFile = state.currentFile;

    if (state.currentFile === path) {
      nextCurrentFile = nextOpenFiles.length > 0 ? nextOpenFiles[nextOpenFiles.length - 1].path : null;
    }

    const nextActive =
      state.currentFile === path
        ? getOpenFileState(nextOpenFiles, nextCurrentFile)
        : { content: state.content, isDirty: state.isDirty };

    set({
      openFiles: nextOpenFiles,
      currentFile: nextCurrentFile,
      content: nextActive.content,
      isDirty: nextActive.isDirty,
      saveStatus: 'saved',
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
