import type { Dirent } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface FileTreeEntry {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileTreeEntry[];
}

const MARKDOWN_EXTENSIONS = new Set(['.md']);
const IGNORED_DIRECTORY_NAMES = new Set(['.git', 'node_modules', 'dist', 'release']);

function shouldIgnoreDirectory(name: string) {
  return name.startsWith('.') || IGNORED_DIRECTORY_NAMES.has(name.toLowerCase());
}

function shouldIncludeFile(name: string) {
  return !name.startsWith('.') && MARKDOWN_EXTENSIONS.has(path.extname(name).toLowerCase());
}

function sortEntries(entries: FileTreeEntry[]) {
  return entries.sort((left, right) => {
    if (left.isDir !== right.isDir) {
      return left.isDir ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });
}

export async function buildMarkdownFileTree(dirPath: string): Promise<FileTreeEntry[]> {
  let entries: Dirent[] = [];

  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const result: FileTreeEntry[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (shouldIgnoreDirectory(entry.name)) {
        continue;
      }

      const children = await buildMarkdownFileTree(fullPath);
      if (children.length > 0) {
        result.push({ name: entry.name, path: fullPath, isDir: true, children });
      }
      continue;
    }

    if (shouldIncludeFile(entry.name)) {
      result.push({ name: entry.name, path: fullPath, isDir: false });
    }
  }

  return sortEntries(result);
}

export async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
