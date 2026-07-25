import type { RecentFile } from './recentFilesService';

export function quickOpenDisplay(file: RecentFile): { name: string; path: string } {
  const internalUntitled = !/[/\\]/.test(file.path)
    && /^untitled-(?:\d+-)?\d{10,}-[a-z0-9]+$/i.test(file.path);
  return internalUntitled
    ? { name: '未命名文档', path: '尚未保存' }
    : { name: file.name, path: file.path };
}
