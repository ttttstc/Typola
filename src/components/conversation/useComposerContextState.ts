import { useEffect, useMemo, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import type { AgentProvider } from '../../services/agent/provider';

type UseComposerContextStateOptions = {
  cwd?: string;
  workspaceSuggestion?: string;
  workspaceRecents: string[];
  currentFilePath?: string;
  activeProvider: AgentProvider;
  fileContextInjected?: boolean;
  currentFileContextPath?: string;
};

type AppendedContext = {
  text: string;
  currentFileContextPath?: string;
  referencePaths: string[];
};

/**
 * Keeps Composer context chips, attached files, and workspace recents logic outside the main JSX shell.
 */
export function useComposerContextState({
  cwd,
  workspaceSuggestion,
  workspaceRecents,
  currentFilePath,
  activeProvider,
  fileContextInjected = false,
  currentFileContextPath,
}: UseComposerContextStateOptions) {
  const [attachedFiles, setAttachedFiles] = useState<string[]>([]);
  const [currentFileDismissed, setCurrentFileDismissed] = useState(false);

  useEffect(() => {
    setCurrentFileDismissed(false);
  }, [currentFilePath]);

  const recentDirs = useMemo(() => {
    const ordered = [...(workspaceSuggestion ? [workspaceSuggestion] : []), ...workspaceRecents];
    const seen = new Set<string>();
    return ordered.flatMap((dir) => {
      if (!dir || dir === cwd || seen.has(dir)) return [];
      seen.add(dir);
      return [dir];
    }).slice(0, 8);
  }, [cwd, workspaceRecents, workspaceSuggestion]);

  const shouldAppendCurrentFile = Boolean(
    currentFilePath &&
    !currentFileDismissed &&
    (!fileContextInjected || currentFileContextPath !== currentFilePath),
  );

  const appendContext = (prompt: string): AppendedContext => {
    const referencePaths = [
      ...(!currentFileDismissed && currentFilePath ? [currentFilePath] : []),
      ...attachedFiles,
    ];
    const contextPaths = [
      ...(shouldAppendCurrentFile && currentFilePath ? [currentFilePath] : []),
      ...attachedFiles,
    ];
    if (activeProvider === 'opencode') {
      return {
        text: prompt,
        currentFileContextPath: shouldAppendCurrentFile ? currentFilePath : undefined,
        referencePaths,
      };
    }
    if (contextPaths.length === 0) return { text: prompt, referencePaths };
    const references = contextPaths.map((path) => `- ${path}`).join('\n');
    return {
      text: `${prompt}\n\n参考以下文件：\n${references}`,
      currentFileContextPath: shouldAppendCurrentFile ? currentFilePath : undefined,
      referencePaths,
    };
  };

  const addAttachments = (paths: string[]) => {
    setAttachedFiles((current) => {
      const seen = new Set(current);
      return [
        ...current,
        ...paths.flatMap((path) => {
          if (typeof path !== 'string' || seen.has(path)) return [];
          seen.add(path);
          return [path];
        }),
      ];
    });
  };

  const handleAttachFiles = async () => {
    const selected = await open({ multiple: true });
    const paths = Array.isArray(selected) ? selected : selected ? [selected] : [];
    addAttachments(paths);
  };

  return {
    attachedFiles,
    currentFileDismissed,
    recentDirs,
    appendContext,
    dismissCurrentFile: () => setCurrentFileDismissed(true),
    removeAttachment: (path: string) => {
      setAttachedFiles((current) => current.filter((candidate) => candidate !== path));
    },
    addAttachments,
    handleAttachFiles,
  };
}
