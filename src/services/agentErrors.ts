// 匹配常见「CLI 不存在」错误文案,跨平台(cannot find / not found / No such file / ENOENT / 找不到)
// 用于在场景卡启动失败时,把用户引导到设置面板的 AI CLI 段
export function isClaudeNotFoundError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /not found|no such file|ENOENT|cannot find|找不到/i.test(msg);
}
