import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryUrl = 'https://github.com/ttttstc/Typola';
const signatureRoot = resolve(process.env.TYPOLA_SIGNATURE_DIR ?? 'src-tauri/target/release/bundle/nsis');
const outputPath = resolve(
  process.env.TYPOLA_MANIFEST_OUTPUT ?? 'src-tauri/target/release/bundle/updater/latest.json',
);

async function findFiles(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await findFiles(path));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}

export function selectNsisSignature(paths) {
  const matches = paths.filter((path) => {
    const name = basename(path).toLowerCase();
    return name.endsWith('.exe.sig') && name.includes('setup');
  });
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one signed NSIS setup executable, found ${matches.length}`);
  }
  return matches[0];
}

export function createWindowsManifest({ version, notes, signature, assetName, publishedAt }) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error(`Invalid stable release version: ${version}`);
  }
  if (!signature.trim()) throw new Error('NSIS updater signature is empty');
  return {
    version,
    notes,
    pub_date: publishedAt,
    platforms: {
      'windows-x86_64': {
        signature: signature.trim(),
        url: `${repositoryUrl}/releases/download/v${version}/${assetName}`,
      },
    },
  };
}

async function main() {
  const version = (await readFile(resolve('VERSION'), 'utf8')).trim();
  const signaturePath = selectNsisSignature(await findFiles(signatureRoot));
  const assetName = basename(signaturePath).replace(/\.sig$/, '');
  const manifest = createWindowsManifest({
    version,
    notes: process.env.TYPOLA_UPDATE_NOTES ?? `Typola ${version}`,
    signature: await readFile(signaturePath, 'utf8'),
    assetName,
    publishedAt: new Date().toISOString(),
  });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${outputPath} for windows-x86_64 (${assetName})`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
