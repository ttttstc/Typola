export type ThemeId = 'plain-paper' | 'night-current' | 'ink-basin';

export type ThemeScheme = 'light' | 'dark';
export type MermaidTheme = 'default' | 'dark';
export type VditorPreviewTheme = 'light' | 'dark';
export type VditorHighlightStyle = 'github' | 'github-dark';
export type TerminalAnsiColor =
  | 'black'
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'magenta'
  | 'cyan'
  | 'white'
  | 'brightBlack'
  | 'brightRed'
  | 'brightGreen'
  | 'brightYellow'
  | 'brightBlue'
  | 'brightMagenta'
  | 'brightCyan'
  | 'brightWhite';

export type TerminalThemeTokens = {
  background: string;
  foreground: string;
  cursor: string;
  selection: string;
} & Partial<Record<TerminalAnsiColor, string>>;

export type CoreTokens = {
  canvas: string;
  paper: string;
  surface: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  accent: string;
  selection: string;
  success: string;
  danger: string;
  warning: string;
  aiPrimary: string;
  aiInserted: string;
  aiDeleted: string;
  reviewMark: string;
};

export type DerivedTokens = {
  textMuted: string;
  borderSoft: string;
  borderHover: string;
  accentSoft: string;
  panelBg: string;
  controlBg: string;
  controlHoverBg: string;
  controlActiveBg: string;
  overlayBg: string;
  shadowSoft: string;
  paperShadow: string;
  ai: {
    selectionBg: string;
    selectionBorder: string;
    pending: string;
    pendingGlow: string;
    insertedBg: string;
    insertedText: string;
    deletedBg: string;
    deletedText: string;
    modifiedBg: string;
    trace: string;
    rollback: string;
    reviewMarkBg: string;
    reviewMarkBgStrong: string;
    reviewMarkBorder: string;
  };
  markdown: {
    heading: string;
    link: string;
    quoteBg: string;
    quoteBorder: string;
    codeBg: string;
    codeText: string;
    tableBorder: string;
    hr: string;
  };
  editor: {
    caret: string;
    activeLine: string;
    gutterText: string;
    gutterBg: string;
    searchMatch: string;
  };
  terminal: {
    background: string;
    foreground: string;
    cursor: string;
    selection: string;
  } & Partial<Record<TerminalAnsiColor, string>>;
};

export type ThemeDefinition = {
  id: ThemeId;
  name: string;
  description: string;
  meta: string;
  scheme: ThemeScheme;
  preview: { canvas: string; paper: string; accent: string };
  core: CoreTokens;
  overrides?: Partial<DerivedTokens>;
};

export type AppThemeOptions = {
  reviewEnhanceMarks: boolean;
};

export const DEFAULT_THEME_ID: ThemeId = 'plain-paper';

function mix(color: string, amount: number, base: string = 'transparent'): string {
  return `color-mix(in oklch, ${color} ${amount}%, ${base})`;
}

export function deriveTokens(core: CoreTokens, overrides: Partial<DerivedTokens> = {}): DerivedTokens {
  const derived: DerivedTokens = {
    textMuted: mix(core.textSecondary, 72, core.paper),
    borderSoft: mix(core.border, 58),
    borderHover: mix(core.border, 70, core.textPrimary),
    accentSoft: mix(core.accent, 10),
    panelBg: mix(core.surface, 92, core.canvas),
    controlBg: mix(core.surface, 86, core.canvas),
    controlHoverBg: mix(core.paper, 74, core.surface),
    controlActiveBg: mix(core.accent, 9, core.surface),
    overlayBg: mix(core.textPrimary, 35),
    shadowSoft: mix(core.textPrimary, 18),
    paperShadow: mix(core.textPrimary, 8),
    ai: {
      selectionBg: mix(core.aiPrimary, 10, core.paper),
      selectionBorder: mix(core.aiPrimary, 42, core.border),
      pending: core.aiPrimary,
      pendingGlow: mix(core.aiPrimary, 20),
      insertedBg: mix(core.aiInserted, 14, core.paper),
      insertedText: mix(core.aiInserted, 70, core.textPrimary),
      deletedBg: mix(core.aiDeleted, 14, core.paper),
      deletedText: mix(core.aiDeleted, 74, core.textPrimary),
      modifiedBg: mix(core.warning, 16, core.paper),
      trace: mix(core.aiPrimary, 18, core.paper),
      rollback: mix(core.danger, 16, core.paper),
      reviewMarkBg: mix(core.reviewMark, 12, core.paper),
      reviewMarkBgStrong: mix(core.reviewMark, 22, core.paper),
      reviewMarkBorder: core.reviewMark,
    },
    markdown: {
      heading: core.textPrimary,
      link: core.accent,
      quoteBg: mix(core.accent, 7, core.paper),
      quoteBorder: mix(core.accent, 36, core.border),
      codeBg: mix(core.surface, 78, core.canvas),
      codeText: core.textPrimary,
      tableBorder: core.border,
      hr: core.border,
    },
    editor: {
      caret: core.accent,
      activeLine: mix(core.accent, 7, core.paper),
      gutterText: core.textSecondary,
      gutterBg: mix(core.surface, 72, core.canvas),
      searchMatch: mix(core.warning, 30, core.paper),
    },
    terminal: {
      background: core.paper,
      foreground: core.textPrimary,
      cursor: core.accent,
      selection: core.selection,
    },
  };

  return {
    ...derived,
    ...overrides,
    ai: { ...derived.ai, ...overrides.ai },
    markdown: { ...derived.markdown, ...overrides.markdown },
    editor: { ...derived.editor, ...overrides.editor },
    terminal: { ...derived.terminal, ...overrides.terminal },
  };
}

const THEME_DEFINITIONS: readonly ThemeDefinition[] = [
  {
    id: 'plain-paper',
    name: '素笺',
    description: '回到经典 light：中性暖白、细边界、暖橙强调。',
    meta: 'Light · 默认',
    scheme: 'light',
    preview: {
      canvas: '#f8f5ef',
      paper: '#fbfaf6',
      accent: '#b65f3a',
    },
    core: {
      canvas: '#f8f5ef',
      paper: '#fbfaf6',
      surface: '#f3efe7',
      textPrimary: '#2d2924',
      textSecondary: '#6d665d',
      border: '#e2dbd0',
      accent: '#b65f3a',
      selection: '#ead8ca',
      success: '#4d7660',
      danger: '#a6533f',
      warning: '#9a6c36',
      aiPrimary: '#8a6757',
      aiInserted: '#4d7660',
      aiDeleted: '#a6533f',
      reviewMark: '#8a6757',
    },
  },
  {
    id: 'night-current',
    name: '深海',
    description: '深色工作台，保留蓝色冷静感但减少彩色噪声。',
    meta: '深色',
    scheme: 'dark',
    preview: {
      canvas: '#11161c',
      paper: '#171d24',
      accent: '#7fb4d6',
    },
    core: {
      canvas: '#11161c',
      paper: '#171d24',
      surface: '#1e252d',
      textPrimary: '#e8edf2',
      textSecondary: '#a0a9b2',
      border: '#303942',
      accent: '#7fb4d6',
      selection: '#293d4c',
      success: '#7fb09a',
      danger: '#d08a82',
      warning: '#c8a46f',
      aiPrimary: '#8fb0c7',
      aiInserted: '#7fb09a',
      aiDeleted: '#d08a82',
      reviewMark: '#8fb0c7',
    },
    overrides: {
      terminal: {
        background: '#11161c',
        foreground: '#e3e9ee',
        cursor: '#7fb4d6',
        selection: '#293d4c',
        black: '#0c1015',
        red: '#d08a82',
        green: '#7fb09a',
        yellow: '#c8a46f',
        blue: '#7fb4d6',
        magenta: '#a8a8c9',
        cyan: '#88b7bf',
        white: '#d9e0e6',
        brightBlack: '#66717c',
        brightRed: '#e0a29b',
        brightGreen: '#9bc5b2',
        brightYellow: '#d8bb88',
        brightBlue: '#9dc8e4',
        brightMagenta: '#bfbfdc',
        brightCyan: '#a5cdd3',
        brightWhite: '#f3f6f8',
      },
    },
  },
  {
    id: 'ink-basin',
    name: '墨韵',
    description: '纯黑白灰文档工作台，只用明度建立层级。',
    meta: '黑白灰',
    scheme: 'light',
    preview: {
      canvas: '#f3f3f1',
      paper: '#ffffff',
      accent: '#111111',
    },
    core: {
      canvas: '#f3f3f1',
      paper: '#ffffff',
      surface: '#eeeeec',
      textPrimary: '#111111',
      textSecondary: '#666666',
      border: '#d8d8d5',
      accent: '#111111',
      selection: '#d9d9d6',
      success: '#3f3f3f',
      danger: '#1f1f1f',
      warning: '#555555',
      aiPrimary: '#333333',
      aiInserted: '#3f3f3f',
      aiDeleted: '#1f1f1f',
      reviewMark: '#111111',
    },
    overrides: {
      terminal: {
        background: '#ffffff',
        foreground: '#111111',
        cursor: '#111111',
        selection: '#d9d9d6',
        black: '#111111',
        red: '#1f1f1f',
        green: '#3f3f3f',
        yellow: '#555555',
        blue: '#2b2b2b',
        magenta: '#454545',
        cyan: '#5c5c5c',
        white: '#e8e8e6',
        brightBlack: '#777777',
        brightRed: '#333333',
        brightGreen: '#555555',
        brightYellow: '#6a6a6a',
        brightBlue: '#444444',
        brightMagenta: '#666666',
        brightCyan: '#7a7a7a',
        brightWhite: '#ffffff',
      },
    },
  },
];

const THEME_IDS = new Set(THEME_DEFINITIONS.map((theme) => theme.id));

export function listThemeDefinitions(): readonly ThemeDefinition[] {
  return THEME_DEFINITIONS;
}

export function normalizeThemeId(value: unknown): ThemeId {
  return typeof value === 'string' && THEME_IDS.has(value as ThemeId)
    ? value as ThemeId
    : DEFAULT_THEME_ID;
}

export function getThemeDefinition(value: unknown): ThemeDefinition {
  const id = normalizeThemeId(value);
  return THEME_DEFINITIONS.find((theme) => theme.id === id) ?? THEME_DEFINITIONS[0];
}

export function getThemeScheme(value: unknown): ThemeScheme {
  return getThemeDefinition(value).scheme;
}

export function getMermaidTheme(value: unknown): MermaidTheme {
  return getThemeScheme(value) === 'dark' ? 'dark' : 'default';
}

export function getVditorPreviewTheme(value: unknown): VditorPreviewTheme {
  return getThemeScheme(value) === 'dark' ? 'dark' : 'light';
}

export function getVditorHighlightStyle(value: unknown): VditorHighlightStyle {
  return getThemeScheme(value) === 'dark' ? 'github-dark' : 'github';
}

export function resolveTerminalTheme(value: unknown): TerminalThemeTokens {
  const theme = getThemeDefinition(value);
  return deriveTokens(theme.core, theme.overrides).terminal;
}
