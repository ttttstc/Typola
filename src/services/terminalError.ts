export function friendlyTerminalError(error?: string): string {
  if (!error) return '终端未能启动，请重试。';
  if (/permission|denied|权限|eacces/i.test(error)) {
    return 'Typola 没有启动该终端的权限，请检查程序权限或终端路径。';
  }
  if (/not found|找不到|enoent/i.test(error)) {
    return '找不到配置的终端程序，请检查“设置 → 终端”中的路径，或清空后使用系统默认终端。';
  }
  return '终端启动失败。你可以重试；若问题持续，请展开诊断信息检查原始错误。';
}
