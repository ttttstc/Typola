import { useCallback, useEffect, useState } from 'react';
import type { MutableRefObject } from 'react';
import { filterSelfWritePaths } from '../services/selfWriteFilter';

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
          const artifactPaths = paths.filter((path) => pathStartsWith(path, outputRoot));
          if (artifactPaths.length === 0) return;
          setAgentChangedPaths((prev) => {
            const next = new Map(prev);
            for (const path of artifactPaths) {
              next.set(path, now);
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

  const bumpWorkspaceTreeVersion = useCallback(() => {
    setWorkspaceTreeVersion((version) => version + 1);
  }, []);

  return {
    agentChangedPaths,
    workspaceTreeVersion,
    rememberArtifact,
    clearArtifacts,
    forgetArtifact,
    bumpWorkspaceTreeVersion,
  };
}
