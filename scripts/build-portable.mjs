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
  const webview2Setup = join(projectRoot, 'src-tauri', 'resources', 'MicrosoftEdgeWebview2Setup.exe');
  if (existsSync(webview2Setup)) {
    copyFileSync(webview2Setup, join(stagingDir, 'MicrosoftEdgeWebview2Setup.exe'));
  }
  writeFileSync(
    join(stagingDir, `Start-${productName}.cmd`),
    [
      '@echo off',
      'setlocal',
      'set "WEBVIEW2_KEY=HKCU\\Software\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"',
      'reg query "%WEBVIEW2_KEY%" /v pv >nul 2>nul',
      'if %ERRORLEVEL%==0 goto run',
      'set "WEBVIEW2_KEY=HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"',
      'reg query "%WEBVIEW2_KEY%" /v pv >nul 2>nul',
      'if %ERRORLEVEL%==0 goto run',
      'if exist "%~dp0MicrosoftEdgeWebview2Setup.exe" goto install',
      'goto missing',
      ':install',
      'echo Installing Microsoft Edge WebView2 Runtime...',
      'start /wait "" "%~dp0MicrosoftEdgeWebview2Setup.exe" /silent /install',
      'reg query "HKCU\\Software\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" /v pv >nul 2>nul',
      'if %ERRORLEVEL%==0 goto run',
      'reg query "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" /v pv >nul 2>nul',
      'if %ERRORLEVEL%==0 goto run',
      ':missing',
      'echo.',
      'echo Typola requires Microsoft Edge WebView2 Runtime on this machine.',
      'echo Please install WebView2 Runtime, then run Typola again:',
      'echo https://developer.microsoft.com/microsoft-edge/webview2/',
      'echo.',
      'start "" "https://developer.microsoft.com/microsoft-edge/webview2/"',
      'pause',
      'exit /b 1',
      ':run',
      'start "" "%~dp0Typola.exe"',
      'exit /b 0',
    ].join('\r\n'),
    'utf8',
  );
  writeFileSync(
    join(stagingDir, 'README-portable.txt'),
    [
      `${productName} Portable`,
      '',
      `Version: ${version}`,
      '',
      '- Prefer Start-Typola.cmd. It checks whether Microsoft Edge WebView2 Runtime is installed before launching.',
      '- Do not copy Typola.exe out as a standalone artifact; keep the extracted portable folder intact.',
      '- This portable build does not write into Program Files.',
      '- If WebView2 Runtime is missing, Start-Typola.cmd runs the bundled MicrosoftEdgeWebview2Setup.exe first.',
      '- If installation still fails, install WebView2 Runtime manually from:',
      '  https://developer.microsoft.com/microsoft-edge/webview2/',
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
