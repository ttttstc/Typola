#!/usr/bin/env node
import fs from 'node:fs';
import { assertNoUnknownAnsiKeys, generateThemeCss, loadThemeDefinitionsForChecks, repoPath } from './theme-css-builder.mjs';

const outPath = repoPath('src', 'styles', 'themes.css');
const checkOnly = process.argv.includes('--check');

const themes = await loadThemeDefinitionsForChecks();
assertNoUnknownAnsiKeys(themes);

const next = await generateThemeCss();
const current = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : '';

if (checkOnly) {
  if (current !== next) {
    console.error('src/styles/themes.css is out of date. Run `npm run build:themes`.');
    process.exit(1);
  }
  process.exit(0);
}

fs.writeFileSync(outPath, next, 'utf8');
