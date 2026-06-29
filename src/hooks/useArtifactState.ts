import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { messageDialog } from '../services/dialogService';
import { pathBasename } from '../app/appLayoutUtils';
import { ensureArtifactManifest, inferArtifactKind } from '../services/artifacts/manifest';
import { scanArtifacts } from '../services/artifacts/scanner';
import type { ArtifactRecord } from '../services/artifacts/types';

type ArtifactItem = import('../components/ArtifactPreview').ArtifactItem;

type UseArtifactStateOptions = {
  agentChangedPaths: Map<string, number>;
  outputRoot?: string;
  workspaceRoot?: string;
  activeConversationId?: string;
  currentDocumentPath?: string;
  onForgetArtifact: (path: string) => void;
  onWorkspaceRefresh: () => void;
  onOpenPath: (path: string) => Promise<void>;
  onTransientMessage: (message: string) => void;
};

/**
 * Maps watched artifact paths into preview chips and keeps archive-to-workspace behavior out of AppLayout.
 */
export function useArtifactState({
  agentChangedPaths,
  outputRoot,
  workspaceRoot,
  activeConversationId,
  currentDocumentPath,
  onForgetArtifact,
  onWorkspaceRefresh,
  onOpenPath,
  onTransientMessage,
}: UseArtifactStateOptions) {
  const [scannedArtifacts, setScannedArtifacts] = useState<ArtifactRecord[]>([]);

  const refreshArtifacts = useCallback(async () => {
    if (!outputRoot) {
      setScannedArtifacts([]);
      return;
    }
    setScannedArtifacts(await scanArtifacts(outputRoot));
  }, [outputRoot]);

  useEffect(() => {
    void refreshArtifacts();
  }, [refreshArtifacts, agentChangedPaths]);

  useEffect(() => {
    if (agentChangedPaths.size === 0) return;
    agentChangedPaths.forEach((_ts, path) => {
      if (/\.artifact\.json$/iu.test(path)) return;
      void ensureArtifactManifest({
        artifactPath: path,
        documentPath: currentDocumentPath,
      }).then(() => refreshArtifacts()).catch((error) => {
        console.warn('Failed to ensure artifact manifest:', error);
      });
    });
  }, [agentChangedPaths, currentDocumentPath, refreshArtifacts]);

  const artifactItems = useMemo<ArtifactItem[]>(() => {
    const merged = new Map<string, ArtifactItem>();
    for (const record of scannedArtifacts) {
      if (activeConversationId && record.manifest?.source.conversationId && record.manifest.source.conversationId !== activeConversationId) {
        continue;
      }
      merged.set(record.path, {
        path: record.path,
        name: record.name,
        ts: record.ts,
        kind: record.kind,
        status: record.status,
        legacy: record.legacy,
      });
    }
    agentChangedPaths.forEach((ts, path) => {
      const name = path.replace(/\\/g, '/').split('/').pop() ?? path;
      if (/\.artifact\.json$/iu.test(name)) return;
      merged.set(path, {
        path,
        name,
        ts,
        kind: inferArtifactKind(path),
        status: merged.get(path)?.status ?? 'ready',
        legacy: merged.get(path)?.legacy ?? false,
      });
    });
    return [...merged.values()].sort((a, b) => b.ts - a.ts);
  }, [activeConversationId, agentChangedPaths, scannedArtifacts]);

  const handleArchiveArtifact = useCallback(async (artifactPath: string) => {
    if (!workspaceRoot) {
      await messageDialog('请先在 AI 工作台选择工作区，再保存产物。', { title: '保存产物' });
      return;
    }
    try {
      const archivedPath = await invoke<string>('archive_artifact_to_workspace', {
        request: { artifactPath, workspaceRoot },
      });
      onForgetArtifact(artifactPath);
      await refreshArtifacts();
      onWorkspaceRefresh();
      await onOpenPath(archivedPath);
      onTransientMessage(`已保存到工作区：${pathBasename(archivedPath)}`);
    } catch (error) {
      await messageDialog(String(error), { title: '保存产物失败' });
    }
  }, [onForgetArtifact, onOpenPath, onTransientMessage, onWorkspaceRefresh, refreshArtifacts, workspaceRoot]);

  return { artifactItems, handleArchiveArtifact, refreshArtifacts };
}
