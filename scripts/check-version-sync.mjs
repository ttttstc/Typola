import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readFileText(path) {
  return readFileSync(resolve(path), 'utf8');
}

function parseTomlVersion(raw) {
  const m = raw.match(/^version\s*=\s*"([^"]+)"/m);
  if (!m) throw new Error('Cannot parse version from Cargo.toml');
  return m[1];
}

const packageVersion = JSON.parse(readFileText('package.json')).version;
const cargoVersion = parseTomlVersion(readFileText('src-tauri/Cargo.toml'));
const tauriConfVersion = JSON.parse(readFileText('src-tauri/tauri.conf.json')).version;

const versions = {
  'package.json': packageVersion,
  'Cargo.toml': cargoVersion,
  'tauri.conf.json': tauriConfVersion,
};

const unique = new Set(Object.values(versions));
if (unique.size !== 1) {
  console.error('Version mismatch:');
  for (const [file, version] of Object.entries(versions)) {
    console.error(`  ${file}: ${version}`);
  }
  process.exit(1);
}

console.log(`Version sync OK: ${packageVersion}`);
