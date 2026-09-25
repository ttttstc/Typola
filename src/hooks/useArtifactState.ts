import { useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { messageDialog } from '../services/dialogService';
import { isArtifactCandidatePath } from '../services/artifacts/manifest';
import { pathBasename } from '../app/appLayoutUtils';

type ArtifactItem = import('../components/ArtifactPreview').ArtifactItem;

type UseArtifactStateOptions = {
  agentChangedPaths: Map<string, number>;
  workspaceRoot?: string;
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
  workspaceRoot,
  onForgetArtifact,
  onWorkspaceRefresh,
  onOpenPath,
  onTransientMessage,
}: UseArtifactStateOptions) {
  const artifactItems = useMemo<ArtifactItem[]>(() => {
    const items: ArtifactItem[] = [];
    agentChangedPaths.forEach((ts, path) => {
      // watcher 写入时已按同一 predicate 过滤;这里再兜一层,保证 chips 视图与 manifest
      // 链路对「什么是制品」的判定完全一致。
      if (!isArtifactCandidatePath(path)) return;
      const name = path.replace(/\\/g, '/').split('/').pop() ?? path;
      const lower = name.toLowerCase();
      let kind: ArtifactItem['kind'] = 'other';
      if (lower.endsWith('.md') || lower.endsWith('.markdown')) kind = 'markdown';
      else if (lower.endsWith('.html') || lower.endsWith('.htm')) kind = 'html';
      else if (lower.endsWith('.txt') || lower.endsWith('.json') || lower.endsWith('.css') || lower.endsWith('.js')) kind = 'text';
      items.push({ path, name, ts, kind });
    });
    return items.sort((a, b) => b.ts - a.ts);
  }, [agentChangedPaths]);

  const handleArchiveArtifact = useCallback(async (artifactPath: string, targetName?: string): Promise<string | undefined> => {
    if (!workspaceRoot) {
      await messageDialog('请先在 AI 工作台选择工作区，再保存产物。', { title: '保存产物' });
      return undefined;
    }
    try {
      const archivedPath = await invoke<string>('archive_artifact_to_workspace', {
        request: { artifactPath, workspaceRoot, targetName: targetName ?? null },
      });
      onForgetArtifact(artifactPath);
      onWorkspaceRefresh();
      onTransientMessage(`已保存到工作区：${pathBasename(archivedPath)}`);
      // 自动打开只是后置便利动作:它失败不能把「文件已保存成功」判成失败——否则上层会跳过
      // archived manifest 写回,留下 primaryFile 悬空的卡片。
      void onOpenPath(archivedPath).catch((error) => {
        console.warn('Failed to open archived artifact:', error);
      });
      return archivedPath;
    } catch (error) {
      await messageDialog(String(error), { title: '保存产物失败' });
      return undefined;
    }
  }, [onForgetArtifact, onOpenPath, onTransientMessage, onWorkspaceRefresh, workspaceRoot]);

  return { artifactItems, handleArchiveArtifact };
}
