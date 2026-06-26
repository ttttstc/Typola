import { downloadDir } from '@tauri-apps/api/path';
import { exists } from '@tauri-apps/plugin-fs';

export type ExportPathOptions = {
  fileName: string;
  filePath?: string;
  extension: string;
};

export function createExportFileName(input: string, extension: string): string {
  const normalizedExtension = extension.replace(/^\./u, '');
  const fallback = input.trim() || `document.${normalizedExtension}`;
  const withoutKnownExtension = fallback.replace(/\.(md|markdown|html|htm|docx|pdf)$/iu, '');
  const baseName = withoutKnownExtension.trim() || 'document';
  return `${baseName}.${normalizedExtension}`;
}

export function dirname(path: string): string | null {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return index > 0 ? path.slice(0, index) : null;
}

export function joinPath(dir: string, name: string): string {
  const separator = dir.includes('\\') ? '\\' : '/';
  return `${dir.replace(/[\\/]+$/u, '')}${separator}${name}`;
}

/**
 * 解析导出文件的默认保存路径。
 *
 * 安全约束:Tauri capability fs:scope 只允许 $DESKTOP / $DOCUMENT / $DOWNLOAD /
 * $PICTURE / $VIDEO 的子路径(避免任意 traversal)。所以默认走 $DOWNLOAD,
 * 跨 OS 通用、写入权限稳定;不依赖 md 文件父目录是否在 scope 内。
 * (md 同目录导出会被 P0-1 评论标为攻击面级问题 —— 任意 .md 路径下任意写,绕过最小权限。)
 */
export async function resolveDefaultExportPath(options: ExportPathOptions): Promise<string> {
  const fileName = createExportFileName(options.filePath || options.fileName, options.extension);
  const baseName = fileName.replace(/^.*[\\/]/u, '');
  const baseDir = await downloadDir();
  return uniqueExportPath(joinPath(baseDir, baseName));
}

export async function uniqueExportPath(path: string): Promise<string> {
  if (!(await exists(path))) return path;

  const separatorIndex = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  const dir = separatorIndex > 0 ? path.slice(0, separatorIndex) : '';
  const fileName = separatorIndex > 0 ? path.slice(separatorIndex + 1) : path;
  const dotIndex = fileName.lastIndexOf('.');
  const stem = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const extension = dotIndex > 0 ? fileName.slice(dotIndex) : '';

  for (let i = 1; i < 1000; i += 1) {
    const candidate = dir ? joinPath(dir, `${stem}-${i}${extension}`) : `${stem}-${i}${extension}`;
    if (!(await exists(candidate))) return candidate;
  }

  return path;
}
