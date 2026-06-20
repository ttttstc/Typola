import type { TocItem } from '../types/document';

export const RIGHT_PANEL_MIN_WIDTH = 320;
export const RIGHT_PANEL_MAX_WIDTH = 760;
export const RIGHT_PANEL_RESIZER_GAP = 9;
export const LEFT_PANEL_MIN_WIDTH = 220;
export const LEFT_PANEL_MAX_WIDTH = 560;
// 三栏布局默认比例:屏宽 1920 → 左 ~460 / 编辑器 ~1100 / 右 ~360。
// 左栏 460:AI 工作台对话需要够宽放消息流(原 366 偏窄)。
// 右栏 360:场景模板/产物列表紧凑,把空间让给编辑器(原 1/3 容器宽 ~640 偏宽)。
export const WORKSPACE_PANEL_DEFAULT_WIDTH = 460;
export const FLOW_LEFT_PANEL_WIDTH = 460;
export const FLOW_RIGHT_PANEL_WIDTH = 360;

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
