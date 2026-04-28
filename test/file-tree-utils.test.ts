import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildMarkdownFileTree } from '../electron/fileTree';

const tempDirs: string[] = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typola-tree-'));
  tempDirs.push(dir);
  return dir;
}

function writeFile(filePath: string, content = '# test') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

describe('buildMarkdownFileTree', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps markdown files while skipping heavyweight generated folders', async () => {
    const root = makeTempDir();
    writeFile(path.join(root, 'root.md'));
    writeFile(path.join(root, 'notes', 'child.md'));
    writeFile(path.join(root, 'notes', 'image.png'), 'binary');
    writeFile(path.join(root, 'node_modules', 'pkg', 'README.md'));
    writeFile(path.join(root, 'dist', 'bundle.md'));
    writeFile(path.join(root, '.git', 'config.md'));

    const tree = await buildMarkdownFileTree(root);

    expect(tree).toEqual([
      {
        name: 'notes',
        path: path.join(root, 'notes'),
        isDir: true,
        children: [
          {
            name: 'child.md',
            path: path.join(root, 'notes', 'child.md'),
            isDir: false,
          },
        ],
      },
      {
        name: 'root.md',
        path: path.join(root, 'root.md'),
        isDir: false,
      },
    ]);
  });
});
