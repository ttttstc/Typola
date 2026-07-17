/**
 * 把后端 / 插件层的原始错误信息映射成对新用户友好的人话提示。
 *
 * 原则:不丢失原始信息(开发者可在控制台看 console.error),但 UI 上展示的是
 * 可读、可执行的描述 —— 用户拿到错误后知道下一步该做什么。
 *
 * 未匹配的错误回退到原始字符串(开发兜底),保证至少有信息。
 */
export function humanizeExportError(error: unknown, kind: 'PDF' | 'Word'): string {
  const raw = error instanceof Error ? error.message : String(error);

  if (/PDF 导出需要安装|PDF.*需要安装.*Chrome|PDF.*需要安装.*浏览器/i.test(raw)) {
    return `${kind} 导出失败：未检测到 Chrome / Chromium / Edge 浏览器。请安装后重试。`;
  }
  if (/not allowed by ACL/i.test(raw)) {
    return `权限被拒绝(${kind} 导出未被 Tauri capability 授权)。请联系开发者排查 fs:scope 配置。`;
  }
  if (/forbidden path|UNAUTHORIZED|outside .* scope/i.test(raw)) {
    return `目标路径不在允许写入范围(${kind} 导出默认走系统 Downloads 目录)。请确认 Downloads 可写。`;
  }
  if (/timed? ?out|timeout/i.test(raw)) {
    return `${kind} 导出超时:文档过大、图片加载慢或后端渲染卡住。请重试,或缩减文档体积。`;
  }
  if (/Permission denied|access is denied|EACCES|os error 5/i.test(raw)) {
    return `${kind} 文件写入被系统拒绝(权限不足或文件被占用)。请关闭可能占用此文件的程序后重试。`;
  }
  if (/No such file|os error 2|ENOENT/i.test(raw)) {
    return `${kind} 导出失败:目标目录不存在或源文件已被删除。`;
  }
  if (/disk full|no space|ENOSPC/i.test(raw)) {
    return `${kind} 导出失败:磁盘空间不足。`;
  }
  if (/window|webview|failed to create/i.test(raw)) {
    return `${kind} 导出失败:后台渲染窗口创建失败。重启 Typola 后重试,如仍失败请反馈。`;
  }
  // 未识别的错误:回退到原文,但截短避免 toast 溢出。
  return raw.length > 200 ? `${raw.slice(0, 200)}…` : raw;
}
