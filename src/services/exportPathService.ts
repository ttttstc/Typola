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

export async function resolveDefaultExportPath(options: ExportPathOptions): Promise<string> {
  const fileName = createExportFileName(options.filePath || options.fileName, options.extension);
  const baseName = fileName.replace(/^.*[\\/]/u, '');
  const dir = options.filePath ? dirname(options.filePath) : null;
  const baseDir = dir || await downloadDir();
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
