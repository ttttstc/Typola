// 列出 `<workspaceRoot>/.typola-output/` 下、与当前文档相关的 AI 改稿文件。
//
// 命名约定:`{源文件stem}.ai改{N}.md`,N 为递增版本号(由 useSendReviewToAI 预计算)。
// 每次 conv 的 Write 都把文件落到 `<outputBaseDir>/<convId>/` 子目录,所以要递归两层。
//
// 刷新策略:
//   - agentChangedPaths 引用变化(Claude Write/Edit 工具有新事件)→ 重扫
//   - currentFilePath 变化 → 重扫
//   - 输出基址变化 → 重扫
//   - 手动调 refresh() 也行

import { useCallback, useEffect, useRef, useState } from 'react';
import { joinLocalPath, pathBasename } from '../app/appLayoutUtils';

export type RevisionEntry = {
  /** 文件名(仅 basename,不带路径) */
  name: string;
  /** 完整路径 */
  path: string;
  /** 修改时间(epoch ms) */
  mtime: number;
  /** 解析出的版本号 N(若文件名不匹配 N=undefined) */
  version?: number;
};

type UseRevisionListOptions = {
  /** `<workspaceRoot>/.typola-output` 绝对路径;未设置时返回空列表 */
  outputBaseDir?: string;
  /** 当前打开文档的完整路径,用于派生 stem 过滤 */
  currentFilePath?: string;
  /** 触发重扫;Claude 写文件后引用会变 */
  agentChangedPaths?: Map<string, number>;
};

// 从完整文件路径派生 stem(去掉扩展名)。跨平台路径都处理。
function stemOf(filePath: string): string {
  const name = pathBasename(filePath);
  return name.replace(/\.[^.]+$/u, '');
}

async function readDirSafe(path: string): Promise<Array<{ name: string; isDirectory: boolean; isFile: boolean }>> {
  try {
    const { readDir } = await import('@tauri-apps/plugin-fs');
    const entries = await readDir(path);
    return entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory, isFile: e.isFile }));
  } catch {
    return [];
  }
}

async function statSafe(path: string): Promise<{ mtime: number } | null> {
  try {
    const { stat } = await import('@tauri-apps/plugin-fs');
    const info = await stat(path);
    const ms = info.mtime instanceof Date ? info.mtime.getTime() : Date.now();
    return { mtime: Number.isFinite(ms) ? ms : Date.now() };
  } catch {
    return null;
  }
}

export function useRevisionList({
  outputBaseDir,
  currentFilePath,
  agentChangedPaths,
}: UseRevisionListOptions): { revisions: RevisionEntry[]; refresh: () => void } {
  const [revisions, setRevisions] = useState<RevisionEntry[]>([]);
  const scanRef = useRef(0);

  const scan = useCallback(async () => {
    const ticket = ++scanRef.current;
    if (!outputBaseDir || !currentFilePath) {
      setRevisions([]);
      return;
    }
    const stem = stemOf(currentFilePath);
    const pattern = new RegExp(`^${escapeRegExp(stem)}\\.ai改(\\d+)\\.md$`, 'u');
    const subdirs = await readDirSafe(outputBaseDir);
    const matches: RevisionEntry[] = [];
    for (const sub of subdirs) {
      if (!sub.isDirectory) continue;
      const subPath = joinLocalPath(outputBaseDir, sub.name);
      const files = await readDirSafe(subPath);
      for (const f of files) {
        if (!f.isFile) continue;
        const m = f.name.match(pattern);
        if (!m) continue;
        const fullPath = joinLocalPath(subPath, f.name);
        const stat = await statSafe(fullPath);
        matches.push({
          name: f.name,
          path: fullPath,
          mtime: stat?.mtime ?? 0,
          version: Number.parseInt(m[1], 10),
        });
      }
    }
    // 仅最新一次扫描结果生效(防止慢 IO 覆盖新一次)
    if (ticket !== scanRef.current) return;
    matches.sort((a, b) => b.mtime - a.mtime);
    setRevisions(matches);
  }, [outputBaseDir, currentFilePath]);

  useEffect(() => {
    void scan();
  }, [scan, agentChangedPaths]);

  return { revisions, refresh: scan };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}