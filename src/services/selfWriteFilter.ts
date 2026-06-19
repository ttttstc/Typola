export type SelfWriteMark = { path: string; at: number };

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase();
}

function samePath(a: string, b: string): boolean {
  return normalizePath(a) === normalizePath(b);
}

// 自写路径判定:与 `AppLayout` 里的 `sameDocumentPath` 同语义,但不依赖组件内局部函数,
// 以便单测独立验证。P0-B 修复用。
export function isSelfWritePath(path: string, last: SelfWriteMark, now: number): boolean {
  if (!last.path) return false;
  if (!samePath(last.path, path)) return false;
  return now - last.at < 1500;
}

// 批量过滤:workspace-changed 一次性收到多文件路径时一次性过滤。
// 返回过滤后的路径数组;空数组表示全部是自写,handler 应直接 return 不调 setAgentChangedPaths。
export function filterSelfWritePaths(
  paths: string[],
  last: SelfWriteMark,
  now: number,
): string[] {
  return paths.filter((p) => !isSelfWritePath(p, last, now));
}
