import { useEffect, useMemo, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';

type UseComposerContextStateOptions = {
  cwd?: string;
  workspaceSuggestion?: string;
  workspaceRecents: string[];
  currentFilePath?: string;
  /** 本会话是否已经把"当前文档"作为 context 注入过 prompt。true 后 appendContext 不再重复拼,chip 仍展示。 */
  fileContextInjected?: boolean;
};

/**
 * Keeps Composer context chips, attached files, and workspace recents logic outside the main JSX shell.
 */
export function useComposerContextState({
  cwd,
  workspaceSuggestion,
  workspaceRecents,
  currentFilePath,
  fileContextInjected = false,
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

  const contextPaths = [
    ...(currentFilePath && !currentFileDismissed ? [currentFilePath] : []),
    ...attachedFiles,
  ];

  const appendContext = (prompt: string): string => {
    if (contextPaths.length === 0) return prompt;
    // 首条 send 后会话级置 fileContextInjected=true → 后续不再重复啰嗦同样的"参考以下文件",
    // 但保留首条用户主动添加的 attachments(对话中后续新挂的文件应被引用一次)。
    // 简化规则:本会话已注入过文件 context 且 contextPaths 仅含"当前文档"路径 → 跳过 appendContext;
    // 用户后续主动加 attachment 时强制再拼一次(因为是新增的)。
    if (fileContextInjected) {
      const attachmentOnly = contextPaths.filter((p) => p !== currentFilePath);
      if (attachmentOnly.length === 0) return prompt;
      const references = attachmentOnly.map((path) => `- ${path}`).join('\n');
      return `${prompt}\n\n参考以下文件：\n${references}`;
    }
    const references = contextPaths.map((path) => `- ${path}`).join('\n');
    return `${prompt}\n\n参考以下文件：\n${references}`;
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
