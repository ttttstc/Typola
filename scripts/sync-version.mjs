import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stableVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function assertStableVersion(value) {
  if (!stableVersionPattern.test(value)) {
    throw new Error(`VERSION must be stable SemVer X.Y.Z without a leading v: ${JSON.stringify(value)}`);
  }
  return value;
}

function replaceRequired(source, pattern, replacement, path) {
  const next = source.replace(pattern, replacement);
  if (next === source && !pattern.test(source)) {
    throw new Error(`Cannot find version field in ${path}`);
  }
  return next;
}

export function synchronizeVersionText(path, source, version) {
  if (path === 'package.json') {
    return replaceRequired(source, /("version"\s*:\s*")[^"]+("\s*,)/, `$1${version}$2`, path);
  }
  if (path === 'package-lock.json') {
    let next = replaceRequired(source, /("version"\s*:\s*")[^"]+("\s*,)/, `$1${version}$2`, path);
    next = replaceRequired(
      next,
      /(""\s*:\s*\{\s*"name"\s*:\s*"typola"\s*,\s*"version"\s*:\s*")[^"]+("\s*,)/,
      `$1${version}$2`,
      path,
    );
    return next;
  }
  if (path === 'src-tauri/tauri.conf.json') {
    return replaceRequired(source, /("version"\s*:\s*")[^"]+("\s*,)/, `$1${version}$2`, path);
  }
  if (path === 'src-tauri/Cargo.toml') {
    return replaceRequired(source, /(\[package\][\s\S]*?\nversion\s*=\s*")[^"]+("\s*)/, `$1${version}$2`, path);
  }
  if (path === 'src-tauri/Cargo.lock') {
    return replaceRequired(
      source,
      /(\[\[package\]\]\s*\nname\s*=\s*"typola"\s*\nversion\s*=\s*")[^"]+("\s*)/,
      `$1${version}$2`,
      path,
    );
  }
  throw new Error(`Unsupported version file: ${path}`);
}

export function assertReleaseTag(tag, version) {
  if (tag !== `v${version}`) {
    throw new Error(`Release tag ${tag} must equal v${version}`);
  }
}

export function assertReleaseVersionChanged(previousVersion, version) {
  if (previousVersion === version) {
    throw new Error(`VERSION ${version} is unchanged from the release commit parent`);
  }
}

function readVersionAtRef(ref) {
  const result = spawnSync('git', ['show', `${ref}:VERSION`], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) return undefined;
  return assertStableVersion(result.stdout.trim());
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const checkOnly = args.has('--check');
  const version = assertStableVersion((await readFile(resolve(projectRoot, 'VERSION'), 'utf8')).trim());
  const files = [
    'package.json',
    'package-lock.json',
    'src-tauri/tauri.conf.json',
    'src-tauri/Cargo.toml',
    'src-tauri/Cargo.lock',
  ];
  const mismatches = [];

  for (const path of files) {
    const absolutePath = resolve(projectRoot, path);
    const source = await readFile(absolutePath, 'utf8');
    const synchronized = synchronizeVersionText(path, source, version);
    if (source === synchronized) continue;
    if (checkOnly) mismatches.push(path);
    else await writeFile(absolutePath, synchronized, 'utf8');
  }

  const tagArgIndex = process.argv.indexOf('--tag');
  const tag = tagArgIndex >= 0 ? process.argv[tagArgIndex + 1] : undefined;
  if (tag) assertReleaseTag(tag, version);
  const previousRefIndex = process.argv.indexOf('--require-version-change');
  const previousRef = previousRefIndex >= 0 ? process.argv[previousRefIndex + 1] : undefined;
  if (previousRef) {
    const previousVersion = readVersionAtRef(previousRef);
    if (previousVersion) assertReleaseVersionChanged(previousVersion, version);
  }

  if (mismatches.length > 0) {
    throw new Error(`Version ${version} is not synchronized in: ${mismatches.join(', ')}`);
  }

  console.log(`${checkOnly ? 'Verified' : 'Synchronized'} version ${version}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
