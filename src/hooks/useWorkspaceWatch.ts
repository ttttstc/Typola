import { useCallback, useEffect, useState } from 'react';
import type { MutableRefObject } from 'react';
import { filterSelfWritePaths } from '../services/selfWriteFilter';
import { isArtifactCandidatePath } from '../services/artifacts/manifest';

function pathStartsWith(path: string, root: string): boolean {
  const normalize = (value: string) => value.replace(/\\/g, '/').replace(/\/+$/u, '').toLowerCase();
  const normalizedPath = normalize(path);
  const normalizedRoot = normalize(root);
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
}

type UseWorkspaceWatchOptions = {
  isTauriRuntime: boolean;
  watchRoot?: string;
  outputRoot?: string;
  lastSelfWriteRef: MutableRefObject<{ path: string; at: number }>;
};

type UseWorkspaceWatchResult = {
  agentChangedPaths: Map<string, number>;
  workspaceTreeVersion: number;
  rememberArtifact: (path: string) => void;
  clearArtifacts: () => void;
  forgetArtifact: (path: string) => void;
  /** 按目录前缀批量移除(关闭会话清理 conv-N 后,watcher 未必逐个文件报 remove)。 */
  forgetArtifactsUnder: (prefix: string) => void;
  bumpWorkspaceTreeVersion: () => void;
};

/**
 * Mirrors the existing workspace watcher wiring for AI output artifacts.
 */
export function useWorkspaceWatch({
  isTauriRuntime,
  watchRoot,
  outputRoot,
  lastSelfWriteRef,
}: UseWorkspaceWatchOptions): UseWorkspaceWatchResult {
  const [agentChangedPaths, setAgentChangedPaths] = useState<Map<string, number>>(new Map());
  const [workspaceTreeVersion, setWorkspaceTreeVersion] = useState(0);

  useEffect(() => {
    if (!isTauriRuntime || !watchRoot || !outputRoot) {
      setAgentChangedPaths(new Map());
      return undefined;
    }
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void import('../services/workspaceWatchService')
      .then(async ({ watchWorkspace, onWorkspaceChanged }) => {
        const [{ mkdir }, { invoke }] = await Promise.all([
          import('@tauri-apps/plugin-fs'),
          import('@tauri-apps/api/core'),
        ]);
        await invoke('allow_fs_directory', { dir: outputRoot });
        await mkdir(outputRoot, { recursive: true });
        await watchWorkspace(watchRoot);
        return onWorkspaceChanged((payload) => {
          const now = Date.now();
          const paths = filterSelfWritePaths(payload.paths, lastSelfWriteRef.current, now);
          // 只收「真实制品候选」:conv-N 目录(mkdir 事件)与 artifact.json 不是制品,
          // 放进来会污染下游 manifest 链路(目录被当 primaryFile)与 chips 展示。
          const artifactPaths = paths.filter(
            (path) => pathStartsWith(path, outputRoot) && isArtifactCandidatePath(path),
          );
          if (artifactPaths.length === 0) return;
          const removing = payload.kind === 'remove';
          setAgentChangedPaths((prev) => {
            const next = new Map(prev);
            for (const path of artifactPaths) {
              // 删除事件不能 set:否则被删掉的文件会永远留在 chips 里,点了只报文件不存在。
              if (removing) next.delete(path);
              else next.set(path, now);
            }
            return next;
          });
          if (payload.kind === 'create' || payload.kind === 'remove' || payload.kind === 'rename') {
            setWorkspaceTreeVersion((version) => version + 1);
          }
        });
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch((error) => console.warn('Failed to bind workspace watcher:', error));

    return () => {
      cancelled = true;
      unlisten?.();
      void import('../services/workspaceWatchService')
        .then(({ unwatchWorkspace }) => unwatchWorkspace(watchRoot))
        .catch((error) => console.warn('Failed to unwatch workspace:', error));
    };
  }, [isTauriRuntime, lastSelfWriteRef, outputRoot, watchRoot]);

  const clearArtifacts = useCallback(() => {
    setAgentChangedPaths(new Map());
  }, []);

  const rememberArtifact = useCallback((path: string) => {
    setAgentChangedPaths((prev) => {
      const next = new Map(prev);
      next.set(path, Date.now());
      return next;
    });
  }, []);

  const forgetArtifact = useCallback((path: string) => {
    setAgentChangedPaths((prev) => {
      const next = new Map(prev);
      next.delete(path);
      return next;
    });
  }, []);

  const forgetArtifactsUnder = useCallback((prefix: string) => {
    setAgentChangedPaths((prev) => {
      const next = new Map(prev);
      for (const path of [...next.keys()]) {
        if (pathStartsWith(path, prefix)) next.delete(path);
      }
      return next;
    });
  }, []);

  const bumpWorkspaceTreeVersion = useCallback(() => {
    setWorkspaceTreeVersion((version) => version + 1);
  }, []);

  return {
    agentChangedPaths,
    workspaceTreeVersion,
    rememberArtifact,
    clearArtifacts,
    forgetArtifact,
    forgetArtifactsUnder,
    bumpWorkspaceTreeVersion,
  };
}
