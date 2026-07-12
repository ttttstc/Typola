import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function readJson(path) {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8'));
}

function readText(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function writeText(path, content) {
  writeFileSync(resolve(root, path), content);
}

const pkg = readJson('package.json');
const version = pkg.version;
if (!version) {
  console.error('package.json missing version field');
  process.exit(1);
}

// 同步 Cargo.toml
const cargoPath = 'src-tauri/Cargo.toml';
const cargo = readText(cargoPath);
if (!/^version\s*=\s*"[^"]+"/m.test(cargo)) {
  console.error('Cargo.toml missing version line');
  process.exit(1);
}
const nextCargo = cargo.replace(/^version\s*=\s*"[^"]+"/m, `version = "${version}"`);
writeText(cargoPath, nextCargo);
console.log(`✓ Cargo.toml → ${version}`);

// 同步 tauri.conf.json
const confPath = 'src-tauri/tauri.conf.json';
const conf = readJson(confPath);
conf.version = version;
const original = readText(confPath);
const endsWithNewline = original.endsWith('\n');
writeText(confPath, JSON.stringify(conf, null, 2) + (endsWithNewline ? '\n' : ''));
console.log(`✓ tauri.conf.json → ${version}`);

console.log(`Synced all to ${version}`);
