import { mkdtempSync, rmSync, existsSync, copyFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = resolve(__dirname, '..');
const tauriConfig = JSON.parse(
  await import(new URL('../src-tauri/tauri.conf.json', import.meta.url), { with: { type: 'json' } })
    .then((module) => JSON.stringify(module.default))
);

const productName = tauriConfig.productName ?? 'Typola';
const version = tauriConfig.version ?? '0.0.0';

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      parsed[key] = 'true';
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: false,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with code ${result.status ?? 'unknown'}`);
  }
}

function platformDescriptor(platform, target) {
  if (platform === 'win32') return { label: 'windows-x64', releaseDir: join('src-tauri', 'target', 'release') };
  if (platform === 'darwin') {
    const targetLabel = target === 'x86_64-apple-darwin' ? 'macos-x64' : 'macos-arm64';
    const releaseDir = target
      ? join('src-tauri', 'target', target, 'release')
      : join('src-tauri', 'target', 'release');
    return { label: targetLabel, releaseDir };
  }
  throw new Error(`portable packaging is not configured for platform ${platform}`);
}

function buildWindowsPortable(releaseDir, assetLabel) {
  const exePath = join(projectRoot, releaseDir, `${productName.toLowerCase()}.exe`);
  if (!existsSync(exePath)) {
    throw new Error(`missing release executable: ${exePath}`);
  }

  const stagingRoot = mkdtempSync(join(tmpdir(), 'typola-portable-'));
  const stagingDir = join(stagingRoot, `${productName}-portable`);
  mkdirSync(stagingDir, { recursive: true });

  copyFileSync(exePath, join(stagingDir, `${productName}.exe`));
  writeFileSync(
    join(stagingDir, 'README-portable.txt'),
    [
      `${productName} Portable`,
      '',
      `Version: ${version}`,
      '',
      '- Double-click Typola.exe to run.',
      '- This portable build does not write into Program Files.',
      '- Windows WebView2 Runtime is still required on the machine.',
    ].join('\r\n'),
    'utf8',
  );

  const outputDir = join(projectRoot, 'src-tauri', 'target', 'release', 'bundle', 'portable');
  mkdirSync(outputDir, { recursive: true });
  const zipPath = join(outputDir, `${productName}_${version}_${assetLabel}_portable.zip`);
  rmSync(zipPath, { force: true });

  run('powershell', [
    '-NoProfile',
    '-Command',
    `Compress-Archive -Path '${stagingDir}' -DestinationPath '${zipPath}' -Force`,
  ]);

  rmSync(stagingRoot, { recursive: true, force: true });
  return zipPath;
}

function buildMacPortable(releaseDir, assetLabel) {
  const appPath = join(projectRoot, releaseDir, 'bundle', 'macos', `${productName}.app`);
  if (!existsSync(appPath)) {
    throw new Error(`missing macOS app bundle: ${appPath}`);
  }

  const outputDir = join(projectRoot, releaseDir, 'bundle', 'portable');
  mkdirSync(outputDir, { recursive: true });
  const zipPath = join(outputDir, `${productName}_${version}_${assetLabel}_portable.zip`);
  rmSync(zipPath, { force: true });

  run('ditto', ['-c', '-k', '--keepParent', appPath, zipPath]);
  return zipPath;
}

const args = parseArgs(process.argv.slice(2));
const runtimePlatform = args.platform ?? process.platform;
const target = args.target ?? process.env.TYPOLA_PORTABLE_TARGET ?? '';
const { label, releaseDir } = platformDescriptor(runtimePlatform, target);

const assetPath = runtimePlatform === 'win32'
  ? buildWindowsPortable(releaseDir, label)
  : buildMacPortable(releaseDir, label);

console.log(assetPath);
