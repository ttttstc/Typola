import type { ITheme } from '@xterm/xterm';

export type AppTheme = 'light' | 'dark';

const TERMINAL_THEMES: Record<AppTheme, ITheme> = {
  light: {
    background: '#F7F7F7',
    foreground: '#0B0B0B',
    cursor: '#0B0B0B',
    cursorAccent: '#F7F7F7',
    selectionBackground: '#D8E6FB',
    selectionInactiveBackground: '#EAEAEA',
    black: '#0B0B0B',
    red: '#D95C5C',
    green: '#2F855A',
    yellow: '#B7791F',
    blue: '#3B82F6',
    magenta: '#9F7AEA',
    cyan: '#0F766E',
    white: '#FFFFFF',
    brightBlack: '#6B6B6B',
    brightRed: '#E57373',
    brightGreen: '#38A169',
    brightYellow: '#D69E2E',
    brightBlue: '#60A5FA',
    brightMagenta: '#B794F4',
    brightCyan: '#14B8A6',
    brightWhite: '#F7F7F7',
  },
  dark: {
    background: '#141414',
    foreground: '#F2F2F2',
    cursor: '#F2F2F2',
    cursorAccent: '#141414',
    selectionBackground: '#1E3A5F',
    selectionInactiveBackground: '#242424',
    black: '#141414',
    red: '#F87171',
    green: '#4ADE80',
    yellow: '#FBBF24',
    blue: '#60A5FA',
    magenta: '#C084FC',
    cyan: '#22D3EE',
    white: '#F2F2F2',
    brightBlack: '#6B6B6B',
    brightRed: '#FCA5A5',
    brightGreen: '#86EFAC',
    brightYellow: '#FCD34D',
    brightBlue: '#93C5FD',
    brightMagenta: '#D8B4FE',
    brightCyan: '#67E8F9',
    brightWhite: '#FFFFFF',
  },
};

export function getTerminalTheme(theme: AppTheme): ITheme {
  return TERMINAL_THEMES[theme];
}
