import { create } from 'zustand';
import { findContainingWorkspaceRoot, useWorkspaceStore } from './workspace';

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
  fileContents: Record<string, string>;
  setCurrentFile: (file: string | null) => void;
  setContent: (content: string) => void;
  setLoadedContent: (content: string, filePath?: string) => void;
  setIsDirty: (dirty: boolean, filePath?: string) => void;
  setSaveStatus: (status: 'saved' | 'saving' | 'error') => void;
  addOpenFile: (path: string, options?: { isDraft?: boolean }) => void;
  removeOpenFile: (path: string) => void;
  updateFilePath: (oldPath: string, newPath: string) => void;
  replacePathPrefix: (oldPath: string, newPath: string) => void;
  getFileContent: (path: string | null) => string;
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

const updateOpenFileCollection = (
  openFiles: OpenFile[],
  targetPath: string | null,
  updater: (file: OpenFile) => OpenFile
) => {
  if (!targetPath) {
    return openFiles;
  }

  let changed = false;
  const nextOpenFiles = openFiles.map((file) => {
    if (file.path !== targetPath) {
      return file;
    }

    const nextFile = updater(file);
    if (nextFile !== file) {
      changed = true;
    }
    return nextFile;
  });

  return changed ? nextOpenFiles : openFiles;
};

const moveFileContent = (
  fileContents: Record<string, string>,
  oldPath: string,
  newPath: string
) => {
  if (oldPath === newPath || !(oldPath in fileContents)) {
    return fileContents;
  }

  const { [oldPath]: movedContent = '', ...rest } = fileContents;
  return {
    ...rest,
    [newPath]: movedContent,
  };
};

const replaceFileContentPrefix = (
  fileContents: Record<string, string>,
  oldPath: string,
  newPath: string
) => {
  let changed = false;
  const nextEntries = Object.entries(fileContents).map(([path, content]) => {
    const remappedPath = remapPath(path, oldPath, newPath);
    if (remappedPath !== path) {
      changed = true;
    }
    return [remappedPath, content] as const;
  });

  if (!changed) {
    return fileContents;
  }

  return Object.fromEntries(nextEntries);
};

const removeFileContent = (fileContents: Record<string, string>, path: string) => {
  if (!(path in fileContents)) {
    return fileContents;
  }

  const { [path]: _removed, ...rest } = fileContents;
  return rest;
};

const getOpenFileState = (
  openFiles: OpenFile[],
  fileContents: Record<string, string>,
  path: string | null
) => {
  if (!path) {
    return {
      content: '',
      isDirty: false,
    };
  }

  const openFile = openFiles.find((file) => file.path === path);
  return {
    content: fileContents[path] ?? '',
    isDirty: openFile?.isDirty ?? false,
  };
};

const syncActiveWorkspaceRoot = (path: string | null) => {
  if (!path) {
    return;
  }

  const workspaceState = useWorkspaceStore.getState();
  const owningRoot = findContainingWorkspaceRoot(workspaceState.workspaceRoots, path);
  if (!owningRoot || owningRoot.path === workspaceState.activeRootPath) {
    return;
  }

  workspaceState.setActiveRoot(owningRoot.path);
};

export const useEditorStore = create<EditorState>((set, get) => ({
  currentFile: null,
  content: '',
  isDirty: false,
  saveStatus: 'saved',
  openFiles: [],
  fileContents: {},

  setCurrentFile: (file) => {
    set((state) => {
      const nextActive = getOpenFileState(state.openFiles, state.fileContents, file);
      return {
        currentFile: file,
        content: nextActive.content,
        isDirty: nextActive.isDirty,
        saveStatus: 'saved',
      };
    });
    syncActiveWorkspaceRoot(file);
  },

  setContent: (content) => {
    const state = get();
    const nextOpenFiles = updateOpenFileCollection(state.openFiles, state.currentFile, (file) =>
      file.isDirty ? file : { ...file, isDirty: true }
    );
    const nextFileContents = state.currentFile
      ? {
          ...state.fileContents,
          [state.currentFile]: content,
        }
      : state.fileContents;

    set({
      content,
      isDirty: true,
      saveStatus: 'saved',
      openFiles: nextOpenFiles,
      fileContents: nextFileContents,
    });
  },

  setLoadedContent: (content, filePath) => {
    const state = get();
    const targetPath = filePath ?? state.currentFile;
    const nextOpenFiles = updateOpenFileCollection(state.openFiles, targetPath, (file) =>
      file.isDirty ? { ...file, isDirty: false } : file
    );
    const nextFileContents = targetPath
      ? {
          ...state.fileContents,
          [targetPath]: content,
        }
      : state.fileContents;
    const isActiveFile = targetPath === state.currentFile;

    set({
      content: isActiveFile ? content : state.content,
      isDirty: isActiveFile ? false : state.isDirty,
      openFiles: nextOpenFiles,
      fileContents: nextFileContents,
    });
  },

  setIsDirty: (dirty, filePath) => {
    const state = get();
    const targetPath = filePath ?? state.currentFile;
    const nextOpenFiles = updateOpenFileCollection(state.openFiles, targetPath, (file) =>
      file.isDirty === dirty ? file : { ...file, isDirty: dirty }
    );
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
            isDirty: false,
            isDraft: options?.isDraft ?? false,
          },
        ],
        fileContents: {
          ...state.fileContents,
          [path]: state.fileContents[path] ?? '',
        },
        currentFile: path,
        content: state.fileContents[path] ?? '',
        isDirty: false,
        saveStatus: 'saved',
      });
      syncActiveWorkspaceRoot(path);
      return;
    }

    const nextOpenFiles =
      options?.isDraft && !existingFile.isDraft
        ? updateOpenFileCollection(state.openFiles, path, (file) =>
            file.isDraft ? file : { ...file, isDraft: true }
          )
        : state.openFiles;

    set({
      openFiles: nextOpenFiles,
      currentFile: path,
      content: state.fileContents[path] ?? '',
      isDirty: existingFile.isDirty,
      saveStatus: 'saved',
    });
    syncActiveWorkspaceRoot(path);
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
    const nextFileContents = moveFileContent(state.fileContents, oldPath, newPath);
    const nextActive = getOpenFileState(nextOpenFiles, nextFileContents, nextCurrentFile);
    const activeFileChanged = nextCurrentFile !== state.currentFile;

    set({
      openFiles: nextOpenFiles,
      fileContents: nextFileContents,
      currentFile: nextCurrentFile,
      content: activeFileChanged ? nextActive.content : state.content,
      isDirty: activeFileChanged ? nextActive.isDirty : state.isDirty,
      saveStatus: activeFileChanged ? 'saved' : state.saveStatus,
    });
    syncActiveWorkspaceRoot(nextCurrentFile);
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
    const nextFileContents = replaceFileContentPrefix(state.fileContents, oldPath, newPath);
    const nextActive = getOpenFileState(nextOpenFiles, nextFileContents, nextCurrentFile);

    set({
      openFiles: nextOpenFiles,
      fileContents: nextFileContents,
      currentFile: nextCurrentFile,
      content: nextCurrentFile === state.currentFile ? state.content : nextActive.content,
      isDirty: nextCurrentFile === state.currentFile ? state.isDirty : nextActive.isDirty,
      saveStatus: 'saved',
    });
    syncActiveWorkspaceRoot(nextCurrentFile);
  },

  getFileContent: (path: string | null) => (path ? get().fileContents[path] ?? '' : ''),

  isDraftFile: (path: string | null) =>
    path !== null && get().openFiles.some((file) => file.path === path && file.isDraft),

  removeOpenFile: (path: string) => {
    const state = get();
    const nextOpenFiles = state.openFiles.filter((file) => file.path !== path);
    let nextCurrentFile = state.currentFile;

    if (state.currentFile === path) {
      nextCurrentFile = nextOpenFiles.length > 0 ? nextOpenFiles[nextOpenFiles.length - 1].path : null;
    }

    const nextFileContents = removeFileContent(state.fileContents, path);
    const nextActive =
      state.currentFile === path
        ? getOpenFileState(nextOpenFiles, nextFileContents, nextCurrentFile)
        : { content: state.content, isDirty: state.isDirty };

    set({
      openFiles: nextOpenFiles,
      fileContents: nextFileContents,
      currentFile: nextCurrentFile,
      content: nextActive.content,
      isDirty: nextActive.isDirty,
      saveStatus: 'saved',
    });
    syncActiveWorkspaceRoot(nextCurrentFile);
  },

  reset: () =>
    set({
      currentFile: null,
      content: '',
      isDirty: false,
      saveStatus: 'saved',
      openFiles: [],
      fileContents: {},
    }),
}));
