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
    accentSoft: mix(core.accent, 13),
    panelBg: mix(core.surface, 94, core.canvas),
    controlBg: mix(core.surface, 68, core.canvas),
    controlHoverBg: mix(core.surface, 82, core.accent),
    controlActiveBg: mix(core.accent, 12, core.surface),
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
    description: '安静的纸感浅色，适合长文写作。',
    meta: '浅色 · 默认',
    scheme: 'light',
    preview: {
      canvas: '#f4f0e8',
      paper: '#fffdf8',
      accent: '#3f6f87',
    },
    core: {
      canvas: '#f4f0e8',
      paper: '#fffdf8',
      surface: '#fbf7ef',
      textPrimary: '#2f2a24',
      textSecondary: '#6f675e',
      border: '#ded6ca',
      accent: '#3f6f87',
      selection: '#cfe4ef',
      success: '#3f7d58',
      danger: '#a64b3c',
      warning: '#b2782c',
      aiPrimary: '#5d6fb2',
      aiInserted: '#3d8a76',
      aiDeleted: '#b05a4d',
      reviewMark: '#8b6bb1',
    },
  },
  {
    id: 'night-current',
    name: '深海',
    description: '低亮度深蓝黑，适合夜写、终端和 AI 长任务。',
    meta: '深色',
    scheme: 'dark',
    preview: {
      canvas: '#101821',
      paper: '#182432',
      accent: '#66b8d6',
    },
    core: {
      canvas: '#101821',
      paper: '#182432',
      surface: '#1d2b3a',
      textPrimary: '#e2e8ee',
      textSecondary: '#9eacb9',
      border: '#344556',
      accent: '#66b8d6',
      selection: '#2c5368',
      success: '#62b894',
      danger: '#d36f87',
      warning: '#d5a760',
      aiPrimary: '#8ca2e8',
      aiInserted: '#5ac3ad',
      aiDeleted: '#dd7890',
      reviewMark: '#d38aa5',
    },
    overrides: {
      terminal: {
        background: '#101821',
        foreground: '#d8e1e9',
        cursor: '#66b8d6',
        selection: '#2c5368',
        black: '#0d141c',
        red: '#e06c86',
        green: '#6fc59d',
        yellow: '#dfb66e',
        blue: '#70a7df',
        magenta: '#b99cf0',
        cyan: '#68c7d5',
        white: '#d8e1e9',
        brightBlack: '#647486',
        brightRed: '#f08da0',
        brightGreen: '#8bd7b5',
        brightYellow: '#edcc8b',
        brightBlue: '#91bef0',
        brightMagenta: '#ccb5ff',
        brightCyan: '#8ddce7',
        brightWhite: '#f2f6f8',
      },
    },
  },
  {
    id: 'ink-basin',
    name: '墨池',
    description: '黑白水墨与现代文档工作台，克制而有品牌识别度。',
    meta: '浅色 · 品牌',
    scheme: 'light',
    preview: {
      canvas: '#f0f1ed',
      paper: '#fdfdf9',
      accent: '#242424',
    },
    core: {
      canvas: '#f0f1ed',
      paper: '#fdfdf9',
      surface: '#e8e9e4',
      textPrimary: '#242424',
      textSecondary: '#686a64',
      border: '#d2d3cc',
      accent: '#242424',
      selection: '#d7ded8',
      success: '#4c7a69',
      danger: '#a53e35',
      warning: '#9a6a2d',
      aiPrimary: '#4c5f5a',
      aiInserted: '#527f70',
      aiDeleted: '#b34d42',
      reviewMark: '#b43f35',
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
