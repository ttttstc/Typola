import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = path.join(repoRoot, 'src', 'services', 'themeRegistry.ts');

const ANSI_KEYS = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite',
];

const CHEVRON_ICON = "data:image/svg+xml,%3Csvg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='STROKE' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E";

function repoPath(...parts) {
  return path.join(repoRoot, ...parts);
}

function cssVar(name) {
  return `var(--theme-${name})`;
}

function mix(color, amount, base = 'transparent') {
  return `color-mix(in oklch, ${color} ${amount}%, ${base})`;
}

function encodeChevronStroke(color) {
  return color.replace('#', '%23');
}

function selectChevron(color) {
  return `url("${CHEVRON_ICON.replace('STROKE', encodeChevronStroke(color))}")`;
}

async function loadThemeRegistry() {
  const source = fs.readFileSync(registryPath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      isolatedModules: true,
      verbatimModuleSyntax: true,
    },
    fileName: registryPath,
  }).outputText;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'typola-themes-'));
  const modulePath = path.join(tempDir, 'themeRegistry.mjs');
  fs.writeFileSync(modulePath, transpiled, 'utf8');
  return import(pathToFileURL(modulePath).href);
}

function cssVariablesForTheme(theme) {
  const core = theme.core;
  const tokens = theme.deriveTokens
    ? theme.deriveTokens(core, theme.overrides)
    : undefined;
  const terminal = tokens?.terminal ?? {};
  const variables = [
    ['theme-canvas', core.canvas],
    ['theme-paper', core.paper],
    ['theme-surface', core.surface],
    ['theme-surface-muted', mix(cssVar('surface'), 70, cssVar('border'))],
    ['theme-text-primary', core.textPrimary],
    ['theme-text-secondary', core.textSecondary],
    ['theme-text-muted', mix(cssVar('text-secondary'), 72, cssVar('paper'))],
    ['theme-border', core.border],
    ['theme-border-soft', mix(cssVar('border'), 58)],
    ['theme-border-hover', mix(cssVar('border'), 70, cssVar('text-primary'))],
    ['theme-accent', core.accent],
    ['theme-accent-soft', mix(cssVar('accent'), 10)],
    ['theme-accent-muted', mix(cssVar('accent'), 42, cssVar('border'))],
    ['theme-selection', core.selection],
    ['theme-success', core.success],
    ['theme-danger', core.danger],
    ['theme-warning', core.warning],
    ['theme-panel-bg', mix(cssVar('surface'), 92, cssVar('canvas'))],
    ['theme-control-bg', mix(cssVar('surface'), 86, cssVar('canvas'))],
    ['theme-control-hover-bg', mix(cssVar('paper'), 74, cssVar('surface'))],
    ['theme-control-active-bg', mix(cssVar('accent'), 9, cssVar('surface'))],
    ['theme-overlay-bg', mix(cssVar('text-primary'), 35)],
    ['theme-shadow-soft', mix(cssVar('text-primary'), 18)],
    ['theme-paper-shadow', mix(cssVar('text-primary'), 8)],
    ['theme-toc-panel-bg', mix(cssVar('paper'), 72)],
    ['theme-ai-primary', core.aiPrimary],
    ['theme-ai-inserted', core.aiInserted],
    ['theme-ai-deleted', core.aiDeleted],
    ['theme-review-mark', core.reviewMark],
    ['theme-ai-selection-bg', mix(cssVar('ai-primary'), 10, cssVar('paper'))],
    ['theme-ai-selection-border', mix(cssVar('ai-primary'), 42, cssVar('border'))],
    ['theme-ai-inserted-bg', mix(cssVar('ai-inserted'), 14, cssVar('paper'))],
    ['theme-ai-inserted-text', mix(cssVar('ai-inserted'), 70, cssVar('text-primary'))],
    ['theme-ai-deleted-bg', mix(cssVar('ai-deleted'), 14, cssVar('paper'))],
    ['theme-ai-deleted-text', mix(cssVar('ai-deleted'), 74, cssVar('text-primary'))],
    ['theme-review-mark-bg', mix(cssVar('review-mark'), 12, cssVar('paper'))],
    ['theme-review-mark-bg-strong', mix(cssVar('review-mark'), 22, cssVar('paper'))],
    ['theme-review-mark-border', cssVar('review-mark')],
    ['theme-markdown-quote-bg', mix(cssVar('accent'), 7, cssVar('paper'))],
    ['theme-markdown-quote-border', mix(cssVar('accent'), 36, cssVar('border'))],
    ['theme-markdown-code-bg', mix(cssVar('surface'), 78, cssVar('canvas'))],
    ['theme-editor-active-line', mix(cssVar('accent'), 7, cssVar('paper'))],
    ['theme-editor-gutter-bg', mix(cssVar('surface'), 72, cssVar('canvas'))],
    ['theme-editor-gutter-text', cssVar('text-secondary')],
    ['theme-editor-search-match', mix(cssVar('warning'), 30, cssVar('paper'))],
    ['theme-terminal-background', terminal.background ?? cssVar('paper')],
    ['theme-terminal-foreground', terminal.foreground ?? cssVar('text-primary')],
    ['theme-terminal-cursor', terminal.cursor ?? cssVar('accent')],
    ['theme-select-chevron', selectChevron(core.textSecondary)],
  ];

  return variables;
}

function selectorFor(theme, index) {
  const selector = `html[data-theme-id='${theme.id}']`;
  return index === 0 ? `:root,\n${selector}` : selector;
}

export async function generateThemeCss() {
  const registry = await loadThemeRegistry();
  const themes = registry.listThemeDefinitions();
  const blocks = themes.map((theme, index) => {
    const withDerive = { ...theme, deriveTokens: registry.deriveTokens };
    const lines = [
      `${selectorFor(theme, index)} {`,
      `  color-scheme: ${theme.scheme};`,
      ...cssVariablesForTheme(withDerive).map(([name, value]) => `  --${name}: ${value};`),
      '}',
    ];
    return lines.join('\n');
  });

  return [
    '/* This file is generated by npm run build:themes. Do not edit by hand. */',
    '',
    ...blocks,
    '',
  ].join('\n');
}

export function assertNoUnknownAnsiKeys(themeDefinitions) {
  const known = new Set(ANSI_KEYS);
  const unknownKeys = [];
  for (const theme of themeDefinitions) {
    const terminal = theme.overrides?.terminal ?? {};
    for (const key of Object.keys(terminal)) {
      if (['background', 'foreground', 'cursor', 'selection'].includes(key)) continue;
      if (!known.has(key)) unknownKeys.push(`${theme.id}.${key}`);
    }
  }
  if (unknownKeys.length) {
    throw new Error(`Unknown terminal ANSI theme keys: ${unknownKeys.join(', ')}`);
  }
}

export async function loadThemeDefinitionsForChecks() {
  const registry = await loadThemeRegistry();
  return registry.listThemeDefinitions();
}

export { repoPath };
