import type { TocItem } from '../types/document';

export const RIGHT_PANEL_MIN_WIDTH = 320;
export const RIGHT_PANEL_MAX_WIDTH = 760;
export const RIGHT_PANEL_RESIZER_GAP = 9;
export const LEFT_PANEL_MIN_WIDTH = 220;
export const LEFT_PANEL_MAX_WIDTH = 560;
// 三栏布局默认比例:屏宽 1920 → 左 360 / 编辑器 ~700 / 右 ~830。
// 左栏 360:文件树紧凑为主,AI 工作台场景自动扩宽(由 LeftRail 内部处理)。
// 右栏 = 容器宽 * 0.45:场景模板/产物列表更宽,接近 Typora 排版。
export const WORKSPACE_PANEL_DEFAULT_WIDTH = 360;
export const FLOW_LEFT_PANEL_WIDTH = 360;
export const FLOW_RIGHT_PANEL_WIDTH = 360;
export const RIGHT_PANEL_DEFAULT_RATIO = 0.45;

export function pathBasename(path: string): string {
  return path.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? path;
}

export function joinLocalPath(root: string, ...parts: string[]): string {
  const separator = root.includes('\\') ? '\\' : '/';
  return [
    root.replace(/[\\/]+$/u, ''),
    ...parts.map((part) => part.replace(/^[\\/]+|[\\/]+$/gu, '')),
  ].filter(Boolean).join(separator);
}

export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/** 给定 source 字符 offset,返回 0-based line index。
 *  超界或空字符串时返回 0;只数 '\n',最后一段无 '\n' 也算一行。 */
export function lineIndexAtOffset(source: string, offset: number): number {
  if (offset <= 0) return 0;
  let line = 0;
  const upper = Math.min(offset, source.length);
  for (let i = 0; i < upper; i++) {
    if (source.charCodeAt(i) === 10) line++;
  }
  return line;
}

export function imageExtensionFromMime(type: string): string {
  if (type === 'image/jpeg') return 'jpg';
  if (type === 'image/webp') return 'webp';
  if (type === 'image/gif') return 'gif';
  return 'png';
}

export function extractToc(content: string): TocItem[] {
  const headings: TocItem[] = [];
  const regex = /^(#{1,6})\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = regex.exec(content)) !== null) {
    const level = match[1].length;
    const text = match[2].trim();
    const id = `toc-${idx++}`;
    headings.push({ level, text, id });
  }
  return headings;
}

export function toUpdateErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '更新安装失败';
}

export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], .cm-editor, .vditor'));
}
