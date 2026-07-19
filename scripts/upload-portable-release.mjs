import { execFileSync } from 'node:child_process';

function resolvePortableAsset() {
  const output = execFileSync('node', ['scripts/build-portable.mjs'], {
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'inherit'],
  }).trim();
  const lines = output.split(/\r?\n/).filter(Boolean);
  return lines.at(-1);
}

const tag = process.env.GITHUB_REF_NAME;
if (!tag) {
  throw new Error('GITHUB_REF_NAME is required to upload portable assets');
}

const assetPath = resolvePortableAsset();
execFileSync('gh', ['release', 'upload', tag, assetPath], {
  stdio: 'inherit',
});
